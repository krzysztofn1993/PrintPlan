import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const workflow = parse(await readFile(resolve(root, ".github/workflows/reviewer-evals.yml"), "utf8"));
const ci = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8"));

test("candidate evaluation is trusted-base PR target without path filters", () => {
  assert.deepEqual(workflow.on.pull_request_target, {
    branches: ["master"],
    types: ["opened", "synchronize", "reopened"],
  });
  assert.equal("paths" in workflow.on.pull_request_target, false);
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(workflow.jobs.infer.permissions, {});
  assert.ok(workflow.jobs.infer.concurrency.group.includes("reviewer-evals-paid-"));
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.mode.options, ["comparison", "pull-request"]);
  assert.match(
    workflow.jobs.prepare.steps.find((step) => step.name === "Resolve fresh PR refs for manual rerun").run,
    /PR_NUMBER.*\^\[1-9\]/s,
  );
  assert.ok(
    workflow.jobs.prepare.steps.findIndex((step) => step.name === "Open pending check before fallible preparation") <
      workflow.jobs.prepare.steps.findIndex((step) => step.name === "Fetch PR head as Git data"),
  );
  const finalizer = workflow.jobs.prepare.steps.at(-1);
  assert.equal(finalizer.name, "Complete pending check if preparation cannot continue");
  assert.match(finalizer.if, /always\(\).*failure\(\).*cancelled\(\).*steps\.prepare\.outputs\.eligible/s);
  assert.match(finalizer.if, /steps\.open-check\.outputs\.check_id/);
  assert.match(finalizer.run, /status\\":\\"completed/);
  assert.match(finalizer.run, /conclusion="failure"/);
  assert.match(finalizer.run, /Reviewer evaluation blocked/);
  assert.match(finalizer.run, /not eligible for evaluation/);
  assert.match(finalizer.run, /Reviewer evaluation preparation failed/);
  const secretSteps = workflow.jobs.infer.steps.filter((step) => step.env?.OPENAI_API_KEY);
  assert.equal(secretSteps.length, 1);
  assert.equal(secretSteps[0].env.OPENAI_API_KEY, "${{ secrets.OPENAI_API_KEY }}");
  assert.equal(workflow.jobs.infer.steps[0].with["persist-credentials"], false);
  assert.ok(!JSON.stringify(workflow.jobs.infer.steps).includes("GITHUB_TOKEN"));
  assert.ok(
    workflow.jobs.publish.steps.some((step) => step.run === "node packages/ai-reviewer/evals/github/publish.mjs"),
  );
});

test("regular CI runs the eval suite as offline candidate code", () => {
  const steps = ci.jobs.ci.steps;
  const install = steps.findIndex((step) =>
    step.run?.includes("npm ci --ignore-scripts --prefix packages/ai-reviewer/evals"),
  );
  const tests = steps.findIndex((step) => step.run === "npm run test:ai-review-evals");
  const prod = steps.findIndex((step) => step.run === "npm run test:ai-review");
  assert.ok(install >= 0 && tests > install && prod > tests);
  assert.equal(JSON.stringify(steps.slice(install, prod)).includes("OPENAI_API_KEY"), false);
});
