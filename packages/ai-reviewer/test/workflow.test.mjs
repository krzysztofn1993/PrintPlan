import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { URL } from "node:url";
import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import { collectDiff } from "../src/input/diff.mjs";
const workflow = parse(await readFile(new URL("../../../.github/workflows/review.yml", import.meta.url), "utf8"));

test("routing is pull_request master including automatic synchronize and only retry-label events qualify", () => {
  assert.deepEqual(workflow.on, {
    pull_request: { branches: ["master"], types: ["opened", "synchronize", "reopened", "labeled"] },
  });
  for (const job of [workflow.jobs.prepare, workflow.jobs.publish]) {
    assert.match(job.if, /github.event.label.name == 'ai-cr:review'/);
    assert.match(job.if, /github.event.pull_request.head.repo.full_name == github.repository/);
    assert.match(job.if, /github.event.pull_request.user.login == vars.AI_REVIEW_OWNER/);
    assert.match(job.if, /github.actor == vars.AI_REVIEW_OWNER/);
    assert.deepEqual(job.concurrency, {
      group: "ai-review-mutations-${{ github.repository }}-${{ github.event.pull_request.number }}",
      "cancel-in-progress": false,
      queue: "max",
    });
    assert.ok(!job.if.includes("draft"));
  }
  assert.match(workflow.jobs.publish.if, /always\(\)/);
  assert.deepEqual(workflow.jobs.publish.needs, ["prepare", "review"]);
});

test("permissions isolate inference from GitHub writes and run only the prepared trusted package", () => {
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(workflow.jobs.review.permissions, {});
  assert.equal(workflow.jobs.review["timeout-minutes"], 20);
  for (const name of ["prepare", "publish"]) {
    assert.deepEqual(workflow.jobs[name].permissions, { contents: "read", "pull-requests": "write", checks: "write" });
    const checkout = workflow.jobs[name].steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    assert.equal(checkout.with.ref, "${{ github.event.pull_request.base.sha }}");
    assert.equal(checkout.with["persist-credentials"], false);
  }
  const steps = workflow.jobs.review.steps;
  assert.ok(!steps.some((step) => step.uses?.includes("checkout")));
  assert.equal(steps.find((step) => step.uses?.startsWith("./")).uses, "./prepared/packages/ai-reviewer");
  const secret = steps.find((step) => step.env?.OPENAI_API_KEY);
  assert.deepEqual(secret.env, { OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}" });
  assert.ok(!JSON.stringify(steps).includes("GITHUB_TOKEN"));
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job["runs-on"], "ubuntu-latest");
    assert.notEqual(job.name, "AI Code Review");
    for (const step of job.steps)
      if (step.uses && !step.uses.startsWith("./")) assert.match(step.uses, /^[\w/-]+@[a-f0-9]{40}$/);
  }
});

test("pending check precedes install/diff/artifacts and completion survives absent artifacts/install failure", () => {
  const steps = workflow.jobs.prepare.steps;
  const pending = steps.findIndex((step) => step.id === "pending");
  const install = steps.findIndex((step) => step.run?.includes("npm ci"));
  const diff = steps.findIndex((step) => step.name === "Build bounded input");
  assert.ok(pending >= 0 && pending < install && install < diff);
  assert.ok(steps.slice(pending + 1).every((step) => step.if?.includes("eligible")));
  const upload = workflow.jobs.review.steps.at(-1);
  assert.equal(upload.if, "always()");
  assert.equal(upload.with["retention-days"], 7);
  const completion = workflow.jobs.publish.steps.at(-1);
  assert.equal(completion.if, "always()");
  assert.ok(
    workflow.jobs.publish.steps
      .filter((step) => step.run?.includes("npm ci") || step.uses?.includes("download-artifact"))
      .every((step) => step["continue-on-error"] === true),
  );
  for (const name of ["prepare", "review"]) {
    const artifacts = workflow.jobs[name].steps.filter((step) => step.uses?.includes("artifact"));
    for (const step of artifacts)
      assert.match(step.with.name, /v1-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
  }
});

test("real Git diff treats head as data, disables executable drivers/hooks, and discloses binary paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-git-"));
  const git = (args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "Fixture"]);
    git(["config", "user.email", "fixture@example.invalid"]);
    await writeFile(join(dir, "text"), "old\n");
    await writeFile(join(dir, "image"), new Uint8Array([0, 1, 2]));
    git(["add", "text", "image"]);
    git(["commit", "-qm", "base"]);
    const base = git(["rev-parse", "HEAD"]);
    await writeFile(join(dir, ".gitattributes"), "text diff=unsafe\n");
    await writeFile(join(dir, "text"), "new\n");
    await writeFile(join(dir, "image"), new Uint8Array([0, 3, 4]));
    await mkdir(join(dir, ".git", "hooks"), { recursive: true });
    const marker = join(dir, "executed");
    git(["config", "diff.unsafe.command", `touch ${marker}`]);
    git(["config", "diff.unsafe.textconv", `touch ${marker}`]);
    git(["add", "text", "image", ".gitattributes"]);
    git(["commit", "-qm", "head"]);
    const head = git(["rev-parse", "HEAD"]);
    const value = collectDiff({ cwd: dir, head, base, title: "Review" });
    assert.equal(value.mergeBase, base);
    assert.ok(value.input.diff.includes("+new"));
    assert.deepEqual(value.input.unreviewedPaths, ["image"]);
    await assert.rejects(readFile(marker));
    // The checkout remains base while data is read from the head object.
    git(["checkout", "--detach", base]);
    assert.ok(collectDiff({ cwd: dir, head, base, title: "Review" }).input.diff.includes("+new"));
    assert.equal(git(["rev-parse", "HEAD"]), base);
    assert.throws(() => collectDiff({ cwd: dir, head: "--exec=unsafe", base, title: "Review" }), /INVALID_SHA/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
