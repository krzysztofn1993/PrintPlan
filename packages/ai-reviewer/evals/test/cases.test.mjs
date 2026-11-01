import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";
import { assembleInput } from "../../src/core/review.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../cases");
const oracleTerms = /expectedVerdict|mechanism|trigger|incorrectBehavior|unacceptableAllegations|238|91 g|88 g/i;
const execFileAsync = promisify(execFile);

test("the frozen corpus has six development and twelve holdout reviewable cases", async () => {
  const ids = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    ids,
    Array.from({ length: 18 }, (_, index) => `case-${String(index + 1).padStart(2, "0")}`),
  );
  for (const id of ids) {
    const dir = join(root, id);
    const input = JSON.parse(await readFile(join(dir, "input.json"), "utf8"));
    const oracle = JSON.parse(await readFile(join(dir, "oracle.json"), "utf8"));
    const [before, after, patch] = await Promise.all(
      ["before.mjs", "after.mjs", "diff.patch"].map((name) => readFile(join(dir, name), "utf8")),
    );
    assert.ok(before.trim() && after.trim() && input.diff.trim());
    assert.deepEqual(input.paths, [patch.match(/^diff --git a\/([^ ]+) b\/[^\n]+/m)?.[1]]);
    assert.equal(input.paths.length, 1);
    assert.deepEqual(input.unreviewedPaths, []);
    assert.equal((input.diff.match(/^@@ /gm) ?? []).length, 1);
    assert.match(input.diff, /^diff --git /m);
    assert.match(input.diff, /^--- a\//m);
    assert.match(input.diff, /^\+\+\+ b\//m);
    assert.ok(oracle.sourceRevision && oracle.expectedVerdict && oracle.changedLocation && oracle.mechanism);
    assert.ok(oracle.trigger && oracle.expectedBehavior && oracle.incorrectBehavior && oracle.reproduction);
    assert.ok(Array.isArray(oracle.unacceptableAllegations));
    const modelInput = assembleInput(input);
    assert.equal(Object.keys(JSON.parse(modelInput)).sort().join(","), "body,diff,paths,title,unreviewedPaths");
    assert.doesNotMatch(modelInput, oracleTerms);
  }
});

test("each frozen diff matches its input and applies from before to after", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "printplan-ai-review-evals-"));
  try {
    await execFileAsync("git", ["init", "--quiet"], { cwd: scratch });
    const ids = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const id of ids) {
      const dir = join(root, id);
      const input = JSON.parse(await readFile(join(dir, "input.json"), "utf8"));
      const [before, after, patch] = await Promise.all(
        ["before.mjs", "after.mjs", "diff.patch"].map((name) => readFile(join(dir, name), "utf8")),
      );
      assert.equal(input.diff, patch, `${id}: model input contains the checked-in patch`);

      const target = resolve(scratch, input.paths[0]);
      assert.ok(target.startsWith(`${scratch}/`), `${id}: patch path stays inside scratch directory`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, before);
      const patchPath = join(scratch, "fixture.patch");
      await writeFile(patchPath, patch);

      await assert.doesNotReject(
        () => execFileAsync("git", ["apply", "--check", patchPath], { cwd: scratch }),
        undefined,
        `${id}: patch applies cleanly to before.mjs`,
      );
      await execFileAsync("git", ["apply", patchPath], { cwd: scratch });
      assert.equal(await readFile(target, "utf8"), after, `${id}: patch produces after.mjs`);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("holdout fixtures retain accepted oracle labels and remain separate from development cases", async () => {
  for (let index = 7; index <= 18; index++) {
    const id = `case-${String(index).padStart(2, "0")}`;
    const oracle = JSON.parse(await readFile(join(root, id, "oracle.json"), "utf8"));
    assert.equal(oracle.evidenceStatus, "author-reviewed-accepted");
    assert.ok(oracle.sourceRevision.length === 40);
    assert.deepEqual(oracle.assertionAnchors.length, oracle.expectedVerdict === "fail" ? 3 : 0);
  }
});

test("model-visible settlement and cancellation cases state the policies they test", async () => {
  const settlement = JSON.parse(await readFile(join(root, "case-04", "input.json"), "utf8"));
  const cancellation = JSON.parse(await readFile(join(root, "case-06", "input.json"), "utf8"));
  assert.match(settlement.body, /clamp.{0,30}zero/i);
  assert.match(settlement.body, /must never be negative/i);
  assert.match(cancellation.body, /newest-created.{0,40}first/i);
  assert.match(cancellation.body, /older reservations keep priority/i);
});

test("model-visible retry case shows state consumption and receipt replay behavior", async () => {
  const input = JSON.parse(await readFile(join(root, "case-05", "input.json"), "utf8"));
  const oracle = JSON.parse(await readFile(join(root, "case-05", "oracle.json"), "utf8"));
  const modelInput = JSON.parse(assembleInput(input));
  assert.match(modelInput.diff, /-\s*if \(previous\) return \{ state, receipt: previous, replayed: true \}/);
  assert.match(modelInput.diff, /recorded: Math\.max\(0, state\.recorded - actual\)/);
  assert.match(modelInput.diff, /receipts: \{ \.\.\.state\.receipts, \[requestId\]: receipt \}/);
  assert.match(modelInput.diff, /replayed: false/);
  assert.match(oracle.expectedBehavior, /saved receipt/i);
  assert.match(oracle.expectedBehavior, /leaves .* estimate at 70 g/i);
  assert.match(oracle.incorrectBehavior, /deducted again/i);
});

test("frozen before and after sources express the intended witnesses", async () => {
  for (const id of ["case-01", "case-02"]) {
    const base = join(root, id);
    const before = await import(`${base}/before.mjs`);
    const after = await import(`${base}/after.mjs`);
    assert.equal(before.getAvailableGrams({ recordedGrams: 150, reservedGrams: 88 }), 62);
    assert.equal(after.getAvailableGrams({ recordedGrams: 150, reservedGrams: 88 }), id === "case-01" ? 62 : 238);
  }
  const base = join(root, "case-03");
  const before = await import(`${base}/before.mjs`);
  const after = await import(`${base}/after.mjs`);
  const scenario = { recorded: 300, otherHolds: 209, ownHold: 88, requested: 84 };
  assert.deepEqual(before.resizeReservation(scenario), { status: "retained", grams: 84 });
  assert.deepEqual(after.resizeReservation(scenario), { status: "released", grams: 0 });

  const excess = join(root, "case-04");
  const excessBefore = await import(`${excess}/before.mjs`);
  const excessAfter = await import(`${excess}/after.mjs`);
  assert.equal(excessBefore.remainingStock(100, 130), 0);
  assert.equal(excessAfter.remainingStock(100, 130), -30);

  const replay = join(root, "case-05");
  const replayBefore = await import(`${replay}/before.mjs`);
  const replayAfter = await import(`${replay}/after.mjs`);
  const state = { recorded: 150, receipts: {} };
  const first = replayBefore.settle(state, "req-1", 80);
  assert.equal(first.state.recorded, 70);
  assert.equal(replayBefore.settle(first.state, "req-1", 80).state.recorded, 70);
  const brokenFirst = replayAfter.settle(state, "req-1", 80);
  assert.equal(replayAfter.settle(brokenFirst.state, "req-1", 80).state.recorded, 0);

  const priority = join(root, "case-06");
  const priorityBefore = await import(`${priority}/before.mjs`);
  const priorityAfter = await import(`${priority}/after.mjs`);
  const reservations = [
    { id: "older", grams: 60, createdAt: 1 },
    { id: "newer", grams: 50, createdAt: 2 },
  ];
  assert.deepEqual(priorityBefore.cancelUntilFits(reservations, 100), ["newer"]);
  assert.deepEqual(priorityAfter.cancelUntilFits(reservations, 100), ["older"]);
});

test("holdout source pairs expose the stated regressions and safe corrections", async () => {
  const loadPair = async (id) => {
    const dir = join(root, id);
    return [await import(`${dir}/before.mjs`), await import(`${dir}/after.mjs`)];
  };
  const [cookieSafe, cookieBad] = await loadPair("case-07");
  const [cookieOld, cookieFixed] = await loadPair("case-08");
  assert.equal(cookieSafe.cookieOptions(true).secure, true);
  assert.equal(cookieBad.cookieOptions(true).secure, false);
  assert.equal(cookieOld.cookieOptions(true).secure, false);
  assert.equal(cookieFixed.cookieOptions(true).secure, true);
  assert.equal(cookieFixed.cookieOptions(false).secure, false);

  const [refreshBaseline, refreshRegression] = await loadPair("case-09");
  const [retryRegression, retryFixed] = await loadPair("case-10");
  const attemptRefresh = (implementation, confirmDiscardResult) => {
    let confirmCalls = 0;
    let loadCalls = 0;
    const result = implementation.retryListRefresh({
      editingPrintId: "print-1",
      confirmDiscard: () => {
        confirmCalls += 1;
        return confirmDiscardResult;
      },
      loadLatest: () => {
        loadCalls += 1;
      },
    });
    return { result, confirmCalls, loadCalls };
  };
  assert.deepEqual(attemptRefresh(refreshBaseline, false), { result: false, confirmCalls: 1, loadCalls: 0 });
  assert.deepEqual(attemptRefresh(refreshRegression, false), { result: true, confirmCalls: 0, loadCalls: 1 });
  assert.deepEqual(attemptRefresh(retryRegression, false), { result: true, confirmCalls: 0, loadCalls: 1 });
  assert.deepEqual(attemptRefresh(retryFixed, false), { result: false, confirmCalls: 1, loadCalls: 0 });
  assert.deepEqual(attemptRefresh(retryFixed, true), { result: true, confirmCalls: 1, loadCalls: 1 });

  const [diffSafe, diffBad] = await loadPair("case-11");
  const [diffOld, diffFixed] = await loadPair("case-12");
  assert.equal(diffSafe.DIFF_LIMIT, 1_048_576);
  assert.deepEqual(diffSafe.DIFF_ARGS, ["--find-renames=100%"]);
  assert.equal(diffBad.DIFF_LIMIT, 262_144);
  assert.deepEqual(diffBad.DIFF_ARGS, ["--no-renames"]);
  assert.equal(diffOld.DIFF_LIMIT, 262_144);
  assert.equal(diffFixed.DIFF_LIMIT, 1_048_576);

  const [marginSafe, marginBad] = await loadPair("case-13");
  const [marginOld, marginFixed] = await loadPair("case-14");
  assert.equal(marginSafe.acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 110 }), true);
  assert.equal(marginBad.acceptsReservation(100, 10, { recordedGrams: 1, availableGrams: 1 }), true);
  assert.equal(marginOld.acceptsReservation(100, 10, { recordedGrams: 1, availableGrams: 1 }), true);
  assert.equal(marginFixed.acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 110 }), true);
  assert.equal(marginFixed.acceptsReservation(100, 10, { recordedGrams: 1, availableGrams: 1 }), false);

  const [messageSafe, messageBad] = await loadPair("case-15");
  const [messageOld, messageFixed] = await loadPair("case-16");
  assert.match(messageSafe.recoveryMessage(), /may have completed/);
  assert.match(messageBad.recoveryMessage(), /rejected/);
  assert.match(messageOld.recoveryMessage(), /rejected/);
  assert.match(messageFixed.recoveryMessage(), /may have completed/);

  const [settlementSafe, settlementBad] = await loadPair("case-17");
  const [settlementOld, settlementFixed] = await loadPair("case-18");
  assert.deepEqual(settlementSafe.actions({}, false), ["review"]);
  assert.deepEqual(settlementBad.actions({}, false), []);
  assert.deepEqual(settlementOld.actions({}, false), []);
  assert.deepEqual(settlementFixed.actions({}, false), ["review"]);
});
