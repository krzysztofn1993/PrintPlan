import { URL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadPrompt } from "../src/prompts/load.mjs";
import { scoreFields } from "../src/contracts/validate.mjs";

test("bundled prompt preserves criteria, verdict policy and static trust boundary", async () => {
  const prompt = await loadPrompt();
  assert.equal(prompt.id, "code-review");
  assert.match(prompt.digest, /^[a-f0-9]{64}$/);
  assert.equal((await loadPrompt()).digest, prompt.digest);
  for (const field of scoreFields) assert.ok(prompt.criteria.includes(field));
  assert.match(prompt.system, /untrusted data/);
  assert.match(prompt.system, /Tests were not executed/);
  assert.match(prompt.system, /verdict alone controls/);
  assert.match(prompt.system, /Minor.*pass/);
  for (const id of ["../code-review", "/tmp/code-review", "unknown", "code-review/../../", ""])
    await assert.rejects(loadPrompt(id), /UNKNOWN_PROMPT/);
});

test("package imports and assets are independent of cwd, app, and Actions", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "reviewer-contract-"));
  try {
    const loader = new URL("../src/prompts/load.mjs", import.meta.url).href;
    const validator = new URL("../src/contracts/validate.mjs", import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const {loadPrompt}=await import(${JSON.stringify(loader)}); const {reviewSchema}=await import(${JSON.stringify(validator)}); if (!(await loadPrompt()).digest || reviewSchema.required.length!==8) process.exit(1);`,
      ],
      { cwd, env: {}, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.deepEqual(Object.keys(manifest.dependencies), ["ajv"]);
  assert.match(manifest.dependencies.ajv, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.workspaces, undefined);
});
