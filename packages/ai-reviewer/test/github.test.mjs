import test from "node:test";
import assert from "node:assert/strict";
import { prepareCheck, eligible, execution, recoverCheck } from "../src/github/prepare.mjs";
import { publishReview, ownedComment } from "../src/github/publish.mjs";
import { MARKER } from "../src/reporting/comment.mjs";
import { context, envelope } from "./fixtures/review.mjs";
import { event, fakeGitHub } from "./fixtures/github.mjs";
const prepare = (client, runId = context.runId, runAttempt = 1, extra = {}) =>
  prepareCheck({ client, event: event(), owner: "owner", runId, runAttempt, ...extra });
const publish = (client, id, value = envelope()) =>
  publishReview({
    client,
    id,
    context: { ...context, runId: id.runId, runAttempt: id.runAttempt },
    envelope: value && { ...value, context: { ...context, runId: id.runId, runAttempt: id.runAttempt } },
  });

test("owner-only event policy includes drafts and synchronize, ignores forks bots and unrelated labels", async () => {
  assert.equal(eligible(event(), "OwNeR"), true);
  assert.equal(eligible(event({ action: "synchronize" }), "owner"), true);
  assert.equal(eligible(event({ action: "labeled", label: { name: "ai-cr:review" } }), "owner"), true);
  assert.throws(() => eligible(event(), ""), /OWNER_REQUIRED/);
  const invalid = [
    event({ action: "labeled", label: { name: "other" } }),
    event({ sender: { login: "other" } }),
    event({ sender: { login: "owner", type: "Bot" } }),
    event({ pull_request: { ...event().pull_request, user: { login: "other" } } }),
    event({
      pull_request: {
        ...event().pull_request,
        head: { ...event().pull_request.head, repo: { full_name: "fork/repo" } },
      },
    }),
  ];
  const { client, state } = fakeGitHub();
  for (const value of invalid)
    assert.equal(await prepareCheck({ client, event: value, owner: "owner", runId: "123", runAttempt: 1 }), null);
  assert.equal(state.calls.length, 0);
});

test("pending check is persisted before retry label removal and initial failure never consumes label", async () => {
  const { client, state } = fakeGitHub();
  const value = event({ action: "labeled", label: { name: "ai-cr:review" } });
  state.labels.add("ai-cr:review");
  let persisted = false;
  state.before = ({ method }) => {
    if (method === "DELETE") assert.equal(persisted, true);
  };
  const id = await prepare(client, "123", 1, {
    event: value,
    persist: async () => {
      persisted = true;
      assert.equal(state.checks[0].status, "in_progress");
    },
  });
  assert.equal(state.labels.has("ai-cr:review"), false);
  await prepare(client);
  assert.equal(state.checks.length, 1);
  assert.equal((await recoverCheck(client, id)).id, id.checkId);
  const failed = fakeGitHub();
  failed.state.labels.add("ai-cr:review");
  failed.state.failures.push({ method: "POST", path: "/check-runs", status: 503, count: 1 });
  await assert.rejects(prepare(failed.client, "123", 1, { event: value }));
  assert.equal(failed.state.labels.has("ai-cr:review"), true);
});

test("one owned comment survives pass fail operational transitions and duplicate invocation", async () => {
  const { client, state } = fakeGitHub();
  let id = await prepare(client);
  assert.equal((await publish(client, id)).conclusion, "success");
  const commentId = state.comments[0].id;
  assert.deepEqual([...state.labels], ["ai-cr:passed"]);
  assert.equal((await publish(client, id)).duplicate, true);
  id = await prepare(client, "124");
  const fail = envelope();
  fail.review.verdict = "fail";
  assert.equal((await publish(client, id, fail)).conclusion, "failure");
  assert.deepEqual([...state.labels], ["ai-cr:failed"]);
  id = await prepare(client, "125");
  assert.equal((await publish(client, id, null)).conclusion, "failure");
  assert.equal(state.labels.size, 0);
  assert.equal(state.comments.length, 1);
  assert.equal(state.comments[0].id, commentId);
  assert.match(state.comments[0].body, /Operation: \*\*error\*\*/);
  assert.ok(!state.comments[0].body.includes("Verdict:"));
});

test("pagination ignores human marker copies and bot markers without trusted check provenance", async () => {
  const { client, state } = fakeGitHub();
  const id = await prepare(client);
  for (let i = 0; i < 101; i++)
    state.comments.push({
      id: 1000 + i,
      body: MARKER,
      user: { login: i ? "github-actions[bot]" : "human", type: i ? "Bot" : "User" },
      issue_url: `https://api.github.com/repos/${context.repository}/issues/1`,
    });
  await publish(client, id);
  assert.equal(state.comments.length, 102);
  assert.equal((await ownedComment(client, id)).id, state.comments.at(-1).id);
  assert.ok(state.calls.some((call) => call.path.includes("comments?per_page=100&page=2")));
});

test("prior same-SHA pass followed by retry preparation failure creates red replacement without artifacts", async () => {
  const { client, state } = fakeGitHub();
  await publish(client, await prepare(client));
  const retry = await prepare(client, "123", 2);
  assert.equal(state.checks.at(-1).status, "in_progress");
  assert.equal((await publishReview({ client, id: execution(event(), "123", 2) })).conclusion, "failure");
  assert.equal(state.checks.at(-1).id, retry.checkId);
  assert.equal(state.checks.at(-1).conclusion, "failure");
  assert.equal(state.labels.size, 0);
});

test("newer same-head execution and head/base changes suppress old publication", async () => {
  for (const change of ["new-run", "new-attempt", "head", "base"]) {
    const { client, state } = fakeGitHub();
    const id = await prepare(client);
    if (change === "new-run") await prepare(client, "124");
    if (change === "new-attempt") await prepare(client, "123", 2);
    if (change === "head") state.pr.head.sha = "d".repeat(40);
    if (change === "base") state.pr.base.sha = "e".repeat(40);
    assert.equal((await publish(client, id)).conclusion, "cancelled");
    assert.equal(state.comments.length, 0);
    assert.equal(state.labels.size, 0);
    assert.equal(state.checks[0].conclusion, "cancelled");
  }
});

test("freshness is rechecked between comment/labels/check mutations", async () => {
  const { client, state } = fakeGitHub();
  const id = await prepare(client);
  let shifted = false;
  state.before = ({ method, path }) => {
    if (!shifted && method === "POST" && path.includes("/comments")) {
      shifted = true;
      state.pr.head.sha = "f".repeat(40);
    }
  };
  assert.equal((await publish(client, id)).conclusion, "cancelled");
  assert.equal(state.labels.size, 0);
  assert.equal(state.checks[0].conclusion, "cancelled");
});

test("publication HTTP failures never complete green and transient writes have at most three attempts", async () => {
  for (const path of ["/comments", "/labels", "/check-runs/"]) {
    const { client, state } = fakeGitHub();
    const id = await prepare(client);
    state.failures.push({ method: path === "/check-runs/" ? "PATCH" : "POST", path, status: 503, count: 3 });
    const result = await publish(client, id);
    assert.notEqual(result.conclusion, "success");
    assert.notEqual(state.checks[0].conclusion, "success");
    assert.equal(state.labels.has("ai-cr:passed"), false);
    assert.ok(!JSON.stringify(state.comments).includes("fake-github-secret"));
  }
  const { client, state } = fakeGitHub();
  const id = await prepare(client);
  state.failures.push({ method: "DELETE", path: "/labels", status: 503, count: 2 });
  assert.equal((await publish(client, id)).conclusion, "success");
  assert.equal(state.calls.filter((call) => call.method === "DELETE" && call.path.includes("passed")).length, 3);
});

test("context mismatch and provider operational errors cannot publish pass", async () => {
  for (const kind of ["context", "error", "timed_out"]) {
    const { client, state } = fakeGitHub();
    const id = await prepare(client);
    const value = envelope();
    if (kind === "context") value.context.head = "f".repeat(40);
    else
      Object.assign(value, {
        status: "error",
        review: null,
        error: { code: kind === "timed_out" ? "DEADLINE_EXCEEDED" : "HTTP_401", message: "Safe failure" },
      });
    const result = await publishReview({ client, id, context, envelope: value });
    assert.equal(result.conclusion, kind === "timed_out" ? "timed_out" : "failure");
    assert.equal(state.labels.size, 0);
  }
});

test("trusted preparation through fake provider to publication binds head/base/model/prompt and preserves comment across commits", async () => {
  const { reviewChange } = await import("../src/core/review.mjs");
  const { client, state } = fakeGitHub();
  const first = await prepare(client);
  let calls = 0;
  const input = { title: "Change", body: "PR text is data", diff: "+change", paths: ["text"], unreviewedPaths: [] };
  const result = await reviewChange({
    context,
    input,
    model: "explicit-test-model",
    apiKey: "fake-provider-key",
    fetchImpl: async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          id: "resp_combined",
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: JSON.stringify(envelope().review) }],
            },
          ],
        }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.prompt.id, "code-review");
  assert.equal(result.model, "explicit-test-model");
  assert.equal((await publishReview({ client, id: first, context, envelope: result })).conclusion, "success");
  const commentId = state.comments[0].id;
  const nextEvent = event();
  nextEvent.action = "synchronize";
  nextEvent.pull_request.head.sha = "d".repeat(40);
  state.pr = nextEvent.pull_request;
  const next = await prepare(client, "124", 1, { event: nextEvent });
  const nextContext = { ...context, head: next.head, runId: next.runId };
  assert.equal(
    (await publishReview({ client, id: next, context: nextContext, envelope: { ...result, context: nextContext } }))
      .conclusion,
    "success",
  );
  assert.equal(state.comments.length, 1);
  assert.equal(state.comments[0].id, commentId);
  assert.match(state.comments[0].body, new RegExp(next.head));
});

test("trusted check ownership rejects another Actions workflow with copied marker metadata", async () => {
  const { client, state } = fakeGitHub();
  const id = await prepare(client);
  await publish(client, id);
  const original = client.fetchImpl;
  client.fetchImpl = async (url, options) => {
    const response = await original(url, options);
    if (!url.includes("/actions/runs/")) return response;
    return { ...response, json: async () => ({ ...(await response.json()), path: ".github/workflows/unrelated.yml" }) };
  };
  assert.equal(await ownedComment(client, id), null);
  assert.equal(state.comments.length, 1);
});

test("CLI completion recovers pending identity when no input or output artifact exists", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { runPrepare } = await import("../src/cli/prepare.mjs");
  const { runPublish } = await import("../src/cli/publish.mjs");
  const dir = await mkdtemp(join(tmpdir(), "review-recovery-"));
  const { client, state } = fakeGitHub();
  try {
    const eventPath = join(dir, "event.json");
    const outputPath = join(dir, "outputs");
    await writeFile(eventPath, JSON.stringify(event()));
    const env = {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_TOKEN: "fake-github-secret",
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "1",
      AI_REVIEW_OWNER: "owner",
    };
    await runPrepare({ env, mode: "pending", directory: join(dir, "prepared"), fetchImpl: client.fetchImpl });
    assert.match(await readFile(outputPath, "utf8"), /eligible=true/);
    assert.equal(
      (await runPublish({ env, directory: join(dir, "never-created"), fetchImpl: client.fetchImpl })).conclusion,
      "failure",
    );
    assert.equal(state.checks.length, 1);
    assert.equal(state.checks[0].conclusion, "failure");
    await runPrepare({ env, mode: "pending", directory: join(dir, "prepared"), fetchImpl: client.fetchImpl });
    assert.ok((await readFile(outputPath, "utf8")).endsWith(`eligible=false\ncheck=${state.checks[0].id}\n`));
    assert.equal(state.checks.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("public run provenance reads omit authentication while all check/comment/label requests retain it", async () => {
  const { client, state } = fakeGitHub();
  const id = await prepare(client);
  assert.equal((await publish(client, id)).conclusion, "success");
  const reads = state.calls.filter((call) => call.method === "GET" && /^\/actions\/runs\/\d+$/.test(call.path));
  assert.ok(reads.length > 0);
  for (const call of reads) assert.equal(Object.hasOwn(call.headers, "Authorization"), false);
  for (const call of state.calls.filter((call) => !reads.includes(call)))
    assert.equal(call.headers.Authorization, "Bearer fake-github-secret");
  assert.ok(state.calls.some((call) => call.method === "POST" && call.path === "/check-runs"));
  assert.ok(state.calls.some((call) => call.method === "POST" && call.path.includes("/comments")));
  assert.ok(state.calls.some((call) => call.method === "POST" && call.path.includes("/labels")));
});

test("run provenance accepts documented workflow path ref suffix but rejects other workflow filenames", async () => {
  const { client } = fakeGitHub();
  const id = await prepare(client);
  await publish(client, id);
  const original = client.fetchImpl;
  let suffixPath = ".github/workflows/review.yml@refs/pull/1/merge";
  client.fetchImpl = async (url, options) => {
    const response = await original(url, options);
    if (!url.includes("/actions/runs/")) return response;
    return { ...response, json: async () => ({ ...(await response.json()), path: suffixPath }) };
  };
  assert.ok(await ownedComment(client, id));
  suffixPath = ".github/workflows/review-copy.yml@master";
  assert.equal(await ownedComment(client, id), null);
});
