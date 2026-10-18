// Prove owner serialization with observed PostgreSQL blockers and controlled commits.
/* global Buffer, setTimeout, clearTimeout */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const COMMAND_TIMEOUT_MS = 15_000;
const WAIT_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";

async function main() {
  const config = await readFile("supabase/config.toml", "utf8");
  const projectId = config.match(/^project_id\s*=\s*["']([a-zA-Z0-9_-]+)["']\s*$/m)?.[1];
  assert.ok(projectId, "Could not derive the local Supabase database container.");
  const container = "supabase_db_" + projectId;
  const prefix = "pp_reservation_" + randomUUID() + "_";
  const owner = randomUUID();
  const otherOwner = randomUUID();
  const live = new Set();
  let sequence = 0;
  let fixtureCreated = false;
  let failure;
  let cases = 0;

  function start(sql, { held = false, command } = {}) {
    const applicationName = prefix + ++sequence;
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        "-e",
        "PGAPPNAME=" + applicationName,
        container,
        "psql",
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=verbose",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-f",
        "-",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const session = { child, applicationName, command, settled: false };
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let processError;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, COMMAND_TIMEOUT_MS);
    const capture = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        processError = new Error("A database session exceeded its bounded output size.");
        child.kill("SIGKILL");
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
    // A stopped psql session can close stdin before the controller releases it.
    child.stdin.on("error", () => undefined);
    session.done = new Promise((resolve) => {
      child.on("error", (error) => {
        processError = error;
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        session.settled = true;
        live.delete(session);
        resolve({
          code,
          error: processError,
          timedOut,
          stdout: Buffer.concat(stdout).toString("utf8").trim(),
          stderr: Buffer.concat(stderr).toString("utf8").trim(),
        });
      });
    });
    live.add(session);
    if (held) child.stdin.write(sql + "\n");
    else child.stdin.end(sql + "\n");
    return session;
  }

  function succeeded(result) {
    assert.ifError(result.error);
    assert.equal(result.timedOut, false, "A database command exceeded its timeout.");
    assert.equal(result.code, 0, "Database command failed: " + result.stderr.slice(-1200));
    return result.stdout;
  }

  async function db(sql) {
    return succeeded(await start(sql).done);
  }

  async function json(sql) {
    return JSON.parse(await db(sql));
  }

  function transaction(userId, command, commit = false) {
    return [
      "SET statement_timeout = '8s';",
      "SET idle_in_transaction_session_timeout = '10s';",
      "BEGIN ISOLATION LEVEL READ COMMITTED;",
      "SET LOCAL ROLE authenticated;",
      "SET LOCAL request.jwt.claim.sub = " + quote(userId) + ";",
      command,
      ...(commit ? ["COMMIT;"] : []),
    ].join("\n");
  }

  async function execute(userId, command) {
    return json(transaction(userId, command, true));
  }

  function mutation(userId, command, commit = false) {
    return start(transaction(userId, command, commit), { held: !commit, command });
  }

  async function observe(session) {
    return json(
      "SELECT COALESCE((SELECT jsonb_build_object(" +
        "'pid',pid,'state',state,'query',query,'waitType',wait_event_type," +
        "'blockers',pg_blocking_pids(pid)) FROM pg_stat_activity WHERE application_name=" +
        quote(session.applicationName) +
        "), 'null'::jsonb);",
    );
  }

  function idle(session, backend) {
    return backend?.state === "idle in transaction" && backend.query.trim() === session.command.trim();
  }

  async function waitFor(session, predicate, description, allowExit = false) {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (session.settled) {
        if (allowExit) return null;
        const result = await session.done;
        assert.fail(description + ": session exited early. " + result.stderr.slice(-1200));
      }
      const backend = await observe(session);
      if (backend && predicate(backend)) return backend;
      // Polling only bounds observation; elapsed time never establishes correctness.
      await pause(25);
    }
    assert.fail("Timed out observing " + description);
  }

  function waitForIdle(session, allowExit = false) {
    return waitFor(session, (backend) => idle(session, backend), "completed uncommitted mutation", allowExit);
  }

  function waitForBlocked(session, holderPid) {
    return waitFor(
      session,
      (backend) => {
        assert.equal(idle(session, backend), false, "A competing mutation completed without waiting for its owner.");
        return backend.state === "active" && backend.waitType === "Lock" && backend.blockers.includes(holderPid);
      },
      "the competitor blocked by the held mutation",
    );
  }

  async function commit(session) {
    assert.equal(session.settled, false, "Cannot commit a session that already exited.");
    session.child.stdin.end("COMMIT;\n");
    return JSON.parse(succeeded(await session.done));
  }

  async function stopSessions(sessions) {
    const pending = sessions.filter((session) => !session.settled);
    if (!pending.length) return;
    try {
      await db(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid<>pg_backend_pid()" +
          " AND application_name IN (" +
          pending.map((session) => quote(session.applicationName)).join(",") +
          ");",
      );
    } finally {
      for (const session of pending) {
        session.child.stdin.destroy();
        if (!session.settled) session.child.kill("SIGKILL");
      }
      await Promise.all(pending.map((session) => session.done));
    }
  }

  async function fixture(userId, name, recordedGrams = 150) {
    const colour = "Concurrency " + name.slice(0, 20) + " " + randomUUID();
    const value = await execute(
      userId,
      "SELECT jsonb_build_object('spool',public.create_spool('PLA'," +
        quote(colour) +
        "," +
        recordedGrams +
        ")," +
        "'prints',jsonb_build_array(public.create_print('First','PLA'," +
        quote(colour) +
        ",80),public.create_print('Second','PLA'," +
        quote(colour) +
        ",80)));",
    );
    return {
      ...value,
      owner: userId,
      requestId: randomUUID(),
      replacementRequestId: randomUUID(),
      settlementRequestId: randomUUID(),
    };
  }

  async function state(f) {
    const printIds = f.prints.map((print) => quote(print.id)).join(",");
    return json(
      "SELECT jsonb_build_object(" +
        "'spool',(SELECT to_jsonb(s) FROM public.spool_inventory s WHERE s.id=" +
        quote(f.spool.id) +
        " AND s.user_id=" +
        quote(f.owner) +
        ")," +
        "'prints',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb)" +
        " FROM public.planned_prints p WHERE p.user_id=" +
        quote(f.owner) +
        " AND p.id IN (" +
        printIds +
        "))," +
        "'requests',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.request_id),'[]'::jsonb)" +
        " FROM private.reservation_requests r WHERE r.user_id=" +
        quote(f.owner) +
        " AND r.print_id IN (" +
        printIds +
        "))," +
        "'reservations',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.print_id),'[]'::jsonb)" +
        " FROM public.print_reservations r WHERE r.user_id=" +
        quote(f.owner) +
        " AND r.print_id IN (" +
        printIds +
        "))," +
        "'settlements',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.print_id),'[]'::jsonb)" +
        " FROM private.print_settlements s WHERE s.user_id=" +
        quote(f.owner) +
        " AND s.print_id IN (" +
        printIds +
        ")));",
    );
  }

  function stock(value, recorded, reserved) {
    assert.ok(value.spool, "Expected a surviving spool.");
    assert.equal(value.spool.recorded_grams, recorded);
    assert.equal(value.spool.reserved_grams, reserved);
    assert.equal(value.spool.available_grams, recorded - reserved);
  }

  function printState(value, printId) {
    return value.prints.find((print) => print.id === printId);
  }

  function reserve(f, print = f.prints[0], requestId = f.requestId, version = print.version) {
    return (
      "SELECT public.reserve_print_material(" +
      [quote(requestId), quote(print.id), version, quote(f.spool.id), "'best_fit'"].join(",") +
      ");"
    );
  }

  function settle(
    f,
    print = f.prints[0],
    reservationId = f.reservationId,
    requestId = f.settlementRequestId,
    actualGrams = 75,
    version = print.version + 1,
  ) {
    return (
      "SELECT public.settle_print_consumption(" +
      [quote(requestId), quote(print.id), version, quote(reservationId), actualGrams].join(",") +
      ");"
    );
  }

  async function reserveForSettlement(f, print = f.prints[0], requestId = f.requestId) {
    const result = await execute(f.owner, reserve(f, print, requestId, print.version));
    f.reservationId = result.reservationId;
    return result.reservationId;
  }

  function edit(print, version = print.version + 1) {
    return (
      "SELECT public.update_print(" +
      [
        quote(print.id),
        version,
        quote("Edited " + print.name),
        quote(print.material),
        quote(print.colour),
        print.required_grams,
      ].join(",") +
      ");"
    );
  }

  function release(reservationId, printId) {
    return "SELECT public.release_print_material(" + quote(reservationId) + "," + quote(printId) + ");";
  }

  function reduce(f) {
    return "SELECT public.update_spool(" + quote(f.spool.id) + ",'PLA'," + quote(f.spool.colour) + ",80);";
  }

  function correctSpool(f, grams) {
    return "SELECT public.update_spool(" + quote(f.spool.id) + ",'PLA'," + quote(f.spool.colour) + "," + grams + ");";
  }

  function deletion(f, resource) {
    return "SELECT public.delete_" + resource + "(" + quote(resource === "spool" ? f.spool.id : f.prints[0].id) + ");";
  }

  function expectedFailure(result, code, message) {
    assert.ifError(result.error);
    assert.equal(result.timedOut, false, "The expected business rejection must not be a process timeout.");
    assert.notEqual(result.code, 0, "The competing mutation should have been rejected.");
    assert.match(result.stderr, new RegExp("ERROR:\\s+" + code + ":\\s+" + message + "(?:\\r?\\n|$)"));
  }

  async function runRace(name, spec) {
    const f = await fixture(owner, name, spec.recordedGrams ?? 150);
    if (spec.prepare) await spec.prepare(f);
    const before = await state(f);
    const holder = mutation(owner, spec.holder(f));
    const participants = [holder];
    try {
      const holderBackend = await waitForIdle(holder);
      const waiter = mutation(owner, spec.waiter(f));
      participants.push(waiter);
      await waitForBlocked(waiter, holderBackend.pid);
      assert.deepEqual(await state(f), before, "Uncommitted mutations must remain invisible to the observer.");
      if (spec.blocked) await spec.blocked(f, holder, waiter, holderBackend);
      const holderReceipt = await commit(holder);
      const holderState = await state(f);
      const waiterBackend = await waitForIdle(waiter, true);
      let waiterReceipt;
      let extra;
      if (spec.error) {
        assert.equal(waiterBackend, null, "The competing mutation unexpectedly succeeded.");
        expectedFailure(await waiter.done, spec.error[0], spec.error[1]);
      } else {
        if (!waiterBackend) succeeded(await waiter.done);
        assert.ok(waiterBackend, "Expected an uncommitted successful competitor.");
        const afterCommit = spec.beforeWaiterCommit
          ? await spec.beforeWaiterCommit(f, waiterBackend, participants)
          : undefined;
        waiterReceipt = await commit(waiter);
        if (afterCommit) extra = await afterCommit();
      }
      const final = await state(f);
      await spec.verify(f, { final, holderState, holderReceipt, waiterReceipt, extra });
      if (!spec.allowSecondPrintChange) {
        assert.deepEqual(
          printState(final, f.prints[1].id),
          printState(before, f.prints[1].id),
          "The unrelated print must remain unchanged.",
        );
      }
      const overbooked = await db(
        "SELECT count(*) FROM public.spool_inventory WHERE user_id IN (" +
          quote(owner) +
          "," +
          quote(otherOwner) +
          ") AND (reserved_grams<0 OR available_grams<0 OR reserved_grams>recorded_grams" +
          " OR available_grams<>recorded_grams-reserved_grams);",
      );
      assert.equal(overbooked, "0", "Every fixture spool must satisfy its stock invariant.");
      cases += 1;
      console.log("PASS  " + name + " (observed blocker, controlled commit, fresh state)");
    } finally {
      await stopSessions(participants);
    }
  }

  try {
    await db(
      "INSERT INTO auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) VALUES " +
        [owner, otherOwner]
          .map(
            (id) =>
              "(" +
              quote(id) +
              ",'authenticated','authenticated'," +
              quote("reservation-concurrency-" + id + "@example.test") +
              ",'',now(),now(),now())",
          )
          .join(",") +
        ";",
    );
    fixtureCreated = true;
    const independent = await fixture(otherOwner, "independent owner");
    let independentReceipt;
    await runRace("reserve then competing reserve", {
      holder: (f) => reserve(f),
      waiter: (f) => reserve(f, f.prints[1], f.replacementRequestId),
      error: ["P0001", "insufficient_material"],
      async blocked(f, holder, waiter, holderBackend) {
        independentReceipt = await execute(otherOwner, reserve(independent, independent.prints[0], f.requestId));
        assert.equal(independentReceipt.disposition, "active");
        assert.equal((await observe(holder)).state, "idle in transaction");
        await waitForBlocked(waiter, holderBackend.pid);
        stock(await state(independent), 150, 88);
        console.log("PASS  another owner commits with the same request UUID while the first owner remains locked");
      },
      verify(f, { final, holderReceipt }) {
        stock(final, 150, 88);
        assert.equal(printState(final, f.prints[0].id).version, 2);
        assert.equal(printState(final, f.prints[1].id).version, 1);
        assert.equal(printState(final, f.prints[1].id).reservation_id, null);
        assert.equal(final.requests.length, 1);
        assert.notEqual(holderReceipt.reservationId, independentReceipt.reservationId);
      },
    });

    await runRace("stock reduction then reserve", {
      holder: reduce,
      waiter: (f) => reserve(f),
      error: ["P0001", "insufficient_material"],
      verify(f, { final }) {
        stock(final, 80, 0);
        assert.equal(printState(final, f.prints[0].id).version, 1);
        assert.equal(printState(final, f.prints[0].id).reservation_id, null);
        assert.equal(final.requests.length, 0);
      },
    });

    await runRace("reserve then stock reduction", {
      holder: (f) => reserve(f),
      waiter: reduce,
      error: ["P0001", "stock_below_reservations"],
      verify(f, { final, holderReceipt }) {
        stock(final, 150, 88);
        assert.equal(printState(final, f.prints[0].id).version, 2);
        assert.equal(printState(final, f.prints[0].id).reservation_id, holderReceipt.reservationId);
      },
    });

    for (const resource of ["spool", "print"]) {
      for (const deleteFirst of [true, false]) {
        await runRace(deleteFirst ? resource + " deletion then reserve" : "reserve then " + resource + " deletion", {
          holder: (f) => (deleteFirst ? deletion(f, resource) : reserve(f)),
          waiter: (f) => (deleteFirst ? reserve(f) : deletion(f, resource)),
          ...(deleteFirst
            ? { error: resource === "spool" ? ["P0001", "insufficient_material"] : ["P0002", "not_found"] }
            : {}),
          async verify(f, { final, holderReceipt, waiterReceipt }) {
            if (resource === "spool") {
              assert.equal(final.spool, null);
              assert.equal(printState(final, f.prints[0].id).reservation_id, null);
              assert.equal(printState(final, f.prints[0].id).version, deleteFirst ? 1 : 3);
              if (!deleteFirst) {
                assert.equal(waiterReceipt.cancelledReservations.length, 1);
                assert.equal(waiterReceipt.cancelledReservations[0].reservationId, holderReceipt.reservationId);
                assert.equal(waiterReceipt.cancelledReservations[0].releasedGrams, 88);
              }
            } else {
              stock(final, 150, 0);
              assert.equal(printState(final, f.prints[0].id), undefined);
              if (!deleteFirst) {
                assert.equal(waiterReceipt.releasedReservationId, holderReceipt.reservationId);
                assert.equal(waiterReceipt.releasedGrams, 88);
              }
            }
            assert.equal(final.requests.length, deleteFirst ? 0 : 1);
            if (!deleteFirst) {
              assert.equal(final.requests[0].state, "deleted");
              const replay = start(transaction(owner, reserve(f), true));
              expectedFailure(await replay.done, "P0001", "reservation_request_completed");
              assert.deepEqual(await state(f), final, "A replay after deletion must not resurrect a reservation.");
            }
          },
        });
      }
    }

    await runRace("duplicate reservation request", {
      holder: (f) => reserve(f),
      waiter: (f) => reserve(f),
      verify(f, { final, holderState, holderReceipt, waiterReceipt }) {
        stock(final, 150, 88);
        assert.equal(waiterReceipt.replayed, true);
        assert.equal(waiterReceipt.reservationId, holderReceipt.reservationId);
        assert.deepEqual(final, holderState, "Duplicate replay must not change versions, timestamps, stock or ledger.");
        assert.equal(final.requests.length, 1);
      },
    });

    await runRace("release then replacement then stale cancellation", {
      async prepare(f) {
        f.originalReservationId = (await execute(owner, reserve(f))).reservationId;
      },
      holder: (f) => release(f.originalReservationId, f.prints[0].id),
      waiter: (f) => reserve(f, f.prints[0], f.replacementRequestId, 3),
      async beforeWaiterCommit(f, waiterBackend, participants) {
        const stale = mutation(owner, release(f.originalReservationId, f.prints[0].id), true);
        participants.push(stale);
        await waitForBlocked(stale, waiterBackend.pid);
        return async () => JSON.parse(succeeded(await stale.done));
      },
      verify(f, { final, holderState, holderReceipt, waiterReceipt, extra }) {
        assert.equal(holderReceipt.disposition, "released");
        stock(holderState, 150, 0);
        assert.equal(printState(holderState, f.prints[0].id).version, 3);
        stock(final, 150, 88);
        assert.equal(printState(final, f.prints[0].id).version, 4);
        assert.equal(printState(final, f.prints[0].id).reservation_id, waiterReceipt.reservationId);
        assert.notEqual(waiterReceipt.reservationId, f.originalReservationId);
        assert.equal(extra.disposition, "already_released");
        assert.equal(extra.reservationId, f.originalReservationId);
        assert.equal(final.requests.length, 2);
        assert.equal(
          final.requests.find((request) => request.reservation_id === f.originalReservationId).state,
          "released",
        );
        assert.equal(
          final.requests.find((request) => request.reservation_id === waiterReceipt.reservationId).state,
          "active",
        );
      },
    });

    await runRace("release then replacement then stale settlement", {
      async prepare(f) {
        f.originalReservationId = await reserveForSettlement(f);
      },
      holder: (f) => release(f.originalReservationId, f.prints[0].id),
      waiter: (f) => reserve(f, f.prints[0], f.replacementRequestId, 3),
      async beforeWaiterCommit(f, waiterBackend, participants) {
        const stale = mutation(
          owner,
          settle(f, f.prints[0], f.originalReservationId, f.settlementRequestId, 75, 2),
          true,
        );
        participants.push(stale);
        await waitForBlocked(stale, waiterBackend.pid);
        return async () => {
          expectedFailure(await stale.done, "P0001", "edit_conflict");
        };
      },
      async verify(f, { final, holderState, waiterReceipt }) {
        stock(holderState, 150, 0);
        stock(final, 150, 88);
        assert.equal(printState(final, f.prints[0].id).version, 4);
        assert.equal(printState(final, f.prints[0].id).reservation_id, waiterReceipt.reservationId);
        assert.notEqual(waiterReceipt.reservationId, f.originalReservationId);
        assert.equal(final.settlements.length, 0);
        assert.equal(final.requests.length, 2);
        assert.equal(
          final.requests.find((request) => request.reservation_id === f.originalReservationId).state,
          "released",
        );
        assert.equal(
          final.requests.find((request) => request.reservation_id === waiterReceipt.reservationId).state,
          "active",
        );
        const wrongIdentity = mutation(
          owner,
          settle(f, f.prints[0], f.originalReservationId, f.settlementRequestId, 75, 4),
          true,
        );
        expectedFailure(await wrongIdentity.done, "P0001", "reservation_changed");
        assert.deepEqual(await state(f), final, "A stale settlement must not consume or release its replacement.");
      },
    });

    await runRace("settlement then release and replacement attempt", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) =>
        "DO $$ BEGIN PERFORM public.release_print_material(" +
        quote(f.reservationId) +
        "," +
        quote(f.prints[0].id) +
        "); END $$;\n" +
        reserve(f, f.prints[0], f.replacementRequestId, 3),
      error: ["P0001", "print_settled"],
      verify(f, { final, holderState, holderReceipt }) {
        stock(final, 75, 0);
        assert.deepEqual(final, holderState, "A rejected replacement must preserve the completed settlement exactly.");
        assert.equal(printState(final, f.prints[0].id).version, 3);
        assert.equal(final.settlements.length, 1);
        assert.equal(final.settlements[0].receipt.id, holderReceipt.settlement.id);
        assert.equal(final.requests.length, 1);
        assert.equal(final.requests[0].state, "released");
      },
    });

    let independentSettlement;
    await runRace("same-key settlement replay with independent-owner progress", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      async blocked(f, holder, waiter, holderBackend) {
        const reservationId = independentReceipt.reservationId;
        independent.reservationId = reservationId;
        independentSettlement = await execute(
          otherOwner,
          settle(independent, independent.prints[0], reservationId, independent.settlementRequestId, 75, 2),
        );
        assert.equal(independentSettlement.replayed, false);
        assert.equal((await observe(holder)).state, "idle in transaction");
        await waitForBlocked(waiter, holderBackend.pid);
        stock(await state(independent), 75, 0);
        console.log("PASS  another owner settles independently while the first owner remains locked");
      },
      verify(f, { final, holderState, holderReceipt, waiterReceipt }) {
        stock(final, 75, 0);
        assert.equal(waiterReceipt.replayed, true);
        assert.deepEqual(waiterReceipt.settlement, holderReceipt.settlement);
        assert.deepEqual(final, holderState, "Replay must preserve stock, versions, requests, and receipt evidence.");
        assert.equal(final.settlements.length, 1);
        assert.equal(printState(final, f.prints[0].id).version, 3);
        assert.equal(final.requests[0].state, "released");
        assert.equal(independentSettlement.settlement.actualGrams, 75);
      },
    });

    await runRace("different-key settlement conflicts after first commit", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
        f.secondSettlementRequestId = randomUUID();
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.secondSettlementRequestId, 75, 2),
      error: ["P0001", "already_settled"],
      verify(f, { final, holderReceipt }) {
        stock(final, 75, 0);
        assert.equal(final.settlements.length, 1);
        assert.equal(holderReceipt.settlement.actualGrams, 75);
        assert.equal(printState(final, f.prints[0].id).version, 3);
      },
    });

    await runRace("two different prints settle on one serialized spool", {
      recordedGrams: 300,
      async prepare(f) {
        f.reservationIds = [
          await reserveForSettlement(f, f.prints[0]),
          await reserveForSettlement(f, f.prints[1], f.replacementRequestId),
        ];
        f.otherSettlementRequestId = randomUUID();
      },
      holder: (f) => settle(f, f.prints[0], f.reservationIds[0], f.settlementRequestId, 100, 2),
      waiter: (f) => settle(f, f.prints[1], f.reservationIds[1], f.otherSettlementRequestId, 100, 2),
      allowSecondPrintChange: true,
      verify(f, { final, holderReceipt, waiterReceipt }) {
        stock(final, 100, 0);
        assert.equal(holderReceipt.settlement.spool.recordedGramsBefore, 300);
        assert.equal(holderReceipt.settlement.spool.recordedGramsAfter, 200);
        assert.equal(holderReceipt.settlement.spool.reservedGramsAfter, 88);
        assert.equal(waiterReceipt.settlement.spool.recordedGramsBefore, 200);
        assert.equal(waiterReceipt.settlement.spool.recordedGramsAfter, 100);
        assert.equal(waiterReceipt.settlement.spool.reservedGramsAfter, 0);
        assert.equal(final.settlements.length, 2);
        assert.equal(printState(final, f.prints[0].id).version, 3);
        assert.equal(printState(final, f.prints[1].id).version, 3);
      },
    });

    await runRace("settlement then competing reservation", {
      recordedGrams: 200,
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 100, 2),
      waiter: (f) => reserve(f, f.prints[1], f.replacementRequestId, 1),
      allowSecondPrintChange: true,
      verify(f, { final, holderReceipt, waiterReceipt }) {
        stock(final, 100, 88);
        assert.equal(holderReceipt.settlement.spool.reservedGramsAfter, 0);
        assert.equal(waiterReceipt.disposition, "active");
        assert.equal(printState(final, f.prints[0].id).version, 3);
        assert.equal(printState(final, f.prints[1].id).version, 2);
        assert.equal(
          final.requests.find((request) => request.reservation_id === waiterReceipt.reservationId).state,
          "active",
        );
      },
    });

    await runRace("reservation then settlement cancels newest allocation", {
      recordedGrams: 200,
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => reserve(f, f.prints[1], f.replacementRequestId, 1),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 120, 2),
      allowSecondPrintChange: true,
      verify(f, { final, waiterReceipt }) {
        stock(final, 80, 0);
        assert.equal(waiterReceipt.settlement.cancelledReservations.length, 1);
        assert.equal(waiterReceipt.settlement.cancelledReservations[0].printId, f.prints[1].id);
        assert.equal(waiterReceipt.settlement.spool.recordedGramsAfter, 80);
        assert.equal(printState(final, f.prints[0].id).version, 3);
        assert.equal(printState(final, f.prints[1].id).version, 3);
        assert.ok(final.requests.every((request) => request.state === "released"));
      },
    });

    await runRace("settlement then exact release", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) => release(f.reservationId, f.prints[0].id),
      verify(f, { final, waiterReceipt }) {
        stock(final, 75, 0);
        assert.equal(waiterReceipt.disposition, "already_released");
        assert.equal(final.settlements.length, 1);
        assert.equal(final.requests[0].state, "released");
      },
    });

    await runRace("exact release then stale settlement", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => release(f.reservationId, f.prints[0].id),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      error: ["P0001", "edit_conflict"],
      verify(f, { final }) {
        stock(final, 150, 0);
        assert.equal(final.settlements.length, 0);
        assert.equal(printState(final, f.prints[0].id).version, 3);
        assert.equal(final.requests[0].state, "released");
      },
    });

    await runRace("settlement then print edit", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) => edit(f.prints[0]),
      error: ["P0001", "print_settled"],
      verify(f, { final }) {
        stock(final, 75, 0);
        assert.equal(final.settlements.length, 1);
        assert.equal(printState(final, f.prints[0].id).version, 3);
      },
    });

    await runRace("print edit then stale settlement", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => edit(f.prints[0]),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      error: ["P0001", "edit_conflict"],
      verify(f, { final }) {
        stock(final, 150, 88);
        assert.equal(final.settlements.length, 0);
        assert.equal(printState(final, f.prints[0].id).version, 3);
      },
    });

    await runRace("settlement then completed print deletion", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) => deletion(f, "print"),
      verify(f, { final }) {
        stock(final, 75, 0);
        assert.equal(printState(final, f.prints[0].id), undefined);
        assert.equal(final.settlements.length, 1);
        assert.equal(final.settlements[0].receipt.actualGrams, 75);
      },
    });

    await runRace("print deletion then settlement", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => deletion(f, "print"),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      error: ["P0002", "not_found"],
      verify(f, { final }) {
        stock(final, 150, 0);
        assert.equal(printState(final, f.prints[0].id), undefined);
        assert.equal(final.settlements.length, 0);
        assert.equal(final.requests[0].state, "deleted");
      },
    });

    await runRace("settlement then spool correction", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) => correctSpool(f, 80),
      verify(f, { final, holderReceipt }) {
        stock(final, 80, 0);
        assert.equal(holderReceipt.settlement.spool.recordedGramsAfter, 75);
        assert.equal(final.settlements.length, 1);
      },
    });

    await runRace("spool correction then settlement", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => correctSpool(f, 100),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      verify(f, { final, waiterReceipt }) {
        stock(final, 25, 0);
        assert.equal(waiterReceipt.settlement.spool.recordedGramsBefore, 100);
        assert.equal(waiterReceipt.settlement.spool.recordedGramsAfter, 25);
        assert.equal(final.settlements.length, 1);
      },
    });

    await runRace("settlement then spool deletion", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      waiter: (f) => deletion(f, "spool"),
      verify(f, { final }) {
        assert.equal(final.spool, null);
        assert.equal(printState(final, f.prints[0].id).settlement_id !== null, true);
        assert.equal(final.settlements.length, 1);
        assert.equal(final.requests[0].state, "released");
      },
    });

    await runRace("spool deletion then settlement", {
      async prepare(f) {
        f.reservationId = await reserveForSettlement(f);
      },
      holder: (f) => deletion(f, "spool"),
      waiter: (f) => settle(f, f.prints[0], f.reservationId, f.settlementRequestId, 75, 2),
      error: ["P0001", "edit_conflict"],
      verify(f, { final }) {
        assert.equal(final.spool, null);
        assert.equal(printState(final, f.prints[0].id).reservation_id, null);
        assert.equal(printState(final, f.prints[0].id).version, 3);
        assert.equal(final.settlements.length, 0);
        assert.equal(final.requests[0].state, "deleted");
      },
    });

    assert.equal(cases, 26);
  } catch (error) {
    failure = error;
  }

  const cleanupErrors = [];
  try {
    await stopSessions([...live]);
    await db(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid<>pg_backend_pid()" +
        " AND application_name LIKE " +
        quote(prefix + "%") +
        ";",
    );
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (fixtureCreated) {
    try {
      await db("DELETE FROM auth.users WHERE id IN (" + quote(owner) + "," + quote(otherOwner) + ");");
      assert.equal(
        await db("SELECT count(*) FROM auth.users WHERE id IN (" + quote(owner) + "," + quote(otherOwner) + ");"),
        "0",
      );
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    throw new AggregateError(
      [...(failure ? [failure] : []), ...cleanupErrors],
      "Concurrency check or fixture cleanup failed.",
    );
  }
  if (failure) throw failure;
  console.log("PASS  all " + cases + " interleavings verified; sessions and account fixtures cleaned up");
}

main().catch((error) => {
  const details = error instanceof AggregateError ? error.errors : [error];
  console.error(
    "Reservation concurrency check failed: " +
      details.map((item) => (item instanceof Error ? item.message : "unexpected failure")).join("; "),
  );
  process.exitCode = 1;
});
