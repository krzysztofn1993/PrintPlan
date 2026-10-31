import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
const root = new URL("../../../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const ci = parse(await readFile(new URL(".github/workflows/ci.yml", root), "utf8"));

test("root CI installs the independent package before offline review tests and preserves app gates", () => {
  assert.equal(manifest.scripts["test:ai-review"], "npm --prefix packages/ai-reviewer test");
  assert.equal(manifest.workspaces, undefined);
  assert.ok(!Object.keys(manifest.dependencies).some((name) => name.includes("ai-reviewer")));
  const commands = ci.jobs.ci.steps.map((step) => step.run);
  const install = commands.indexOf("npm ci --ignore-scripts --prefix packages/ai-reviewer");
  const tests = commands.indexOf("npm run test:ai-review");
  assert.ok(commands.indexOf("npm ci") >= 0 && install > commands.indexOf("npm ci") && tests > install);
  for (const command of [
    "npm run test:hooks",
    "npm run test:auth",
    "npm run test:spools",
    "npm run test:prints",
    "npm run test:reservations",
    "npm run test:settlements",
    "npm run test:settings",
    "npm run lint",
    "npx astro check",
    "npm run build",
  ])
    assert.ok(commands.includes(command), `Existing app gate retained: ${command}`);
  assert.ok(
    !JSON.stringify(ci.jobs.ci.steps.filter((step) => step.run === "npm run test:ai-review")).includes("secrets."),
  );
});

test("smoke retains database, browser, production-preview and authenticated HTTP acceptance", () => {
  const commands = ci.jobs.smoke.steps.map((step) => step.run).filter(Boolean);
  for (const command of [
    "supabase test db",
    "npm run test:reservations:concurrency",
    "npm run test:migrations",
    "npm run test:e2e",
    "npm run build",
    "BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke",
    "supabase stop --no-backup",
  ])
    assert.ok(commands.includes(command), `Existing smoke coverage retained: ${command}`);
  assert.ok(commands.some((command) => command.includes("supabase start")));
  assert.ok(commands.some((command) => command.includes("npm run preview")));
  assert.equal(ci.jobs.smoke.steps.at(-1).if, "always()");
});

test("test preload blocks accidental HTTP and removes provider/write credentials before fixtures load", async () => {
  const local = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const command of Object.values(local.scripts)) assert.match(command, /--import \.\/test\/offline\.mjs --test/);
  const preload = new URL("./offline.mjs", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      preload,
      "--input-type=module",
      "-e",
      `
    if (process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN || process.env.GH_TOKEN) process.exit(2);
    try { await fetch("https://api.openai.com/v1/responses"); process.exit(3); }
    catch (error) { if (error.message !== "OFFLINE_TEST_NETWORK_FORBIDDEN") process.exit(4); }
  `,
    ],
    {
      env: { OPENAI_API_KEY: "fixture-secret", GITHUB_TOKEN: "fixture-write-token", GH_TOKEN: "fixture-token" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
});
