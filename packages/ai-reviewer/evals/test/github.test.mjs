import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadPrompt } from "../../src/prompts/load.mjs";
import { extractCandidatePrompts, eligibleEvalEvent, executionIdentity, PROMPT_PATHS } from "../github/prepare.mjs";
import { validateEvalMatrix, validateEvalRun } from "../github/checks.mjs";
import { evaluatePublication } from "../github/publish.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("trusted blob extraction rejects invalid object types and binds ordered prompt digest", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "eval-blobs-"));
  try {
    git(cwd, "init", "-q");
    git(cwd, "config", "user.name", "Fixture");
    git(cwd, "config", "user.email", "fixture@example.invalid");
    for (const [index, path] of PROMPT_PATHS.entries()) {
      const file = join(cwd, path);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, `candidate ${index}\n`);
    }
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "candidate");
    const head = git(cwd, "rev-parse", "HEAD");
    const candidate = extractCandidatePrompts({ cwd, head });
    assert.deepEqual([candidate.system, candidate.criteria], ["candidate 0\n", "candidate 1\n"]);
    assert.equal(
      candidate.digest,
      (await import("node:crypto"))
        .createHash("sha256")
        .update(JSON.stringify([candidate.system, candidate.criteria]))
        .digest("hex"),
    );
    assert.throws(() => extractCandidatePrompts({ cwd, head, paths: ["arbitrary"] }), /INVALID_PROMPT_REQUEST/);
    assert.throws(() => extractCandidatePrompts({ cwd, head: "f".repeat(40) }), /PROMPT_MISSING/);
    const real = join(cwd, PROMPT_PATHS[0]);
    const saved = await (await import("node:fs/promises")).readFile(real);
    await rm(real);
    await symlink(PROMPT_PATHS[1].split("/").at(-1), real);
    git(cwd, "add", "-A");
    git(cwd, "commit", "-qm", "symlink");
    assert.throws(
      () => extractCandidatePrompts({ cwd, head: git(cwd, "rev-parse", "HEAD") }),
      /PROMPT_NOT_REGULAR_FILE/,
    );
    await rm(real);
    await writeFile(real, saved);
    const criteria = join(cwd, PROMPT_PATHS[1]);
    await writeFile(criteria, Buffer.from([0xff, 0xfe]));
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "invalid encoding");
    assert.throws(() => extractCandidatePrompts({ cwd, head: git(cwd, "rev-parse", "HEAD") }), /PROMPT_INVALID_UTF8/);
    await writeFile(criteria, "   \n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "empty prompt");
    assert.throws(() => extractCandidatePrompts({ cwd, head: git(cwd, "rev-parse", "HEAD") }), /PROMPT_EMPTY/);
    await writeFile(join(cwd, PROMPT_PATHS[0]), "x".repeat(40 * 1024));
    await writeFile(criteria, "y".repeat(25 * 1024));
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "oversized prompts");
    assert.throws(() => extractCandidatePrompts({ cwd, head: git(cwd, "rev-parse", "HEAD") }), /PROMPT_TOO_LARGE/);
    await rm(criteria);
    git(cwd, "add", "-A");
    git(cwd, "commit", "-qm", "deleted prompt");
    assert.throws(() => extractCandidatePrompts({ cwd, head: git(cwd, "rev-parse", "HEAD") }), /PROMPT_MISSING/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("candidate prompt hash matches the production ordered prompt representation", async () => {
  const prod = await loadPrompt();
  const { createHash } = await import("node:crypto");
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify([prod.system, prod.criteria]))
      .digest("hex"),
    prod.digest,
  );
});

test("eligibility and provenance are scoped to the eval workflow and complete matrix", () => {
  const event = {
    action: "opened",
    repository: { full_name: "owner/repo" },
    sender: { login: "owner", type: "User" },
    pull_request: {
      number: 7,
      state: "open",
      base: { ref: "master", sha: "b".repeat(40) },
      head: { sha: "a".repeat(40), repo: { full_name: "owner/repo" } },
      user: { login: "owner", type: "User" },
    },
  };
  assert.equal(eligibleEvalEvent(event, "owner"), true);
  assert.equal(eligibleEvalEvent({ ...event, sender: { login: "stranger" } }, "owner"), false);
  assert.equal(executionIdentity(event, "23", "2", "c".repeat(40)).head, "a".repeat(40));
  const identity = {
    repository: "owner/repo",
    pr: 7,
    head: "a".repeat(40),
    workflowSha: "c".repeat(40),
    runAttempt: 2,
  };
  assert.equal(
    validateEvalRun(
      {
        event: "pull_request_target",
        path: ".github/workflows/reviewer-evals.yml@refs/heads/master",
        repository: { full_name: "owner/repo" },
        head_sha: identity.workflowSha,
        run_attempt: 2,
        pull_requests: [{ number: 7 }],
      },
      identity,
    ),
    true,
  );
  assert.equal(
    validateEvalRun(
      {
        event: "pull_request",
        path: ".github/workflows/review.yml",
        repository: { full_name: "owner/repo" },
        head_sha: identity.workflowSha,
        run_attempt: 2,
        pull_requests: [{ number: 7 }],
      },
      identity,
    ),
    false,
  );
  const promptDigest = "c".repeat(64);
  const matrix = Array.from({ length: 54 }, (_, index) => ({
    caseId: `case-${String(Math.floor(index / 3) + 1).padStart(2, "0")}`,
    repetition: (index % 3) + 1,
    status: "pass",
    promptDigest,
  }));
  assert.equal(
    validateEvalMatrix(
      {
        manifest: {
          promptDigest,
          mode: "gate",
          planned: 54,
          caseIds: Array.from({ length: 18 }, (_, index) => `case-${String(index + 1).padStart(2, "0")}`),
        },
        matrix,
      },
      { promptDigest },
    ),
    true,
  );
  assert.equal(validateEvalMatrix({ promptDigest, matrix: [] }, { promptDigest }), false);
  const publication = {
    identity: { ...identity, base: "b".repeat(40), promptDigest, unchanged: false },
    run: {
      event: "pull_request_target",
      path: ".github/workflows/reviewer-evals.yml@refs/heads/master",
      repository: { full_name: "owner/repo" },
      head_sha: identity.workflowSha,
      run_attempt: 2,
      pull_requests: [{ number: 7 }],
    },
    livePR: { state: "open", head: { sha: identity.head }, base: { sha: "b".repeat(40) } },
    report: {
      manifest: {
        promptDigest,
        mode: "gate",
        planned: 54,
        caseIds: Array.from({ length: 18 }, (_, index) => `case-${String(index + 1).padStart(2, "0")}`),
      },
      matrix,
    },
  };
  assert.deepEqual(evaluatePublication(publication), { conclusion: "success", reason: "ALL_CASES_PASSED" });
  assert.equal(
    evaluatePublication({ ...publication, livePR: { ...publication.livePR, head: { sha: "d".repeat(40) } } }).reason,
    "STALE_REFS",
  );
  assert.equal(
    evaluatePublication({ ...publication, report: { ...publication.report, matrix: [] } }).reason,
    "INVALID_OR_INCOMPLETE_MATRIX",
  );
});
