import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(project, ".codex/hooks.json"), "utf8"));

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 20000, ...options });
  assert.ifError(result.error);
  return result;
}

function git(root, ...args) {
  const result = execute("git", args, { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function put(root, filename, text) {
  const full = path.join(root, filename);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
  return full;
}

function installHooks(root) {
  cpSync(path.join(project, ".codex/hooks"), path.join(root, ".codex/hooks"), { recursive: true });
  cpSync(path.join(project, ".codex/hooks.json"), path.join(root, ".codex/hooks.json"));
}

function installFakeTools(root) {
  const binary = `#!/usr/bin/env node
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (process.env.HOOK_PROOF_LOG) appendFileSync(process.env.HOOK_PROOF_LOG, JSON.stringify({tool,args})+'\\n');
if (tool === 'eslint') {
  for (const file of args.slice(args.indexOf('--')+1)) {
    if (existsSync(file) && readFileSync(file,'utf8').includes('LINT_ERROR')) {
      console.error(file+': error no-unused-vars (deliberate proof error)');
      process.exitCode=1;
    }
  }
} else if (args[0] === 'check' && existsSync('src/check.ts') && readFileSync('src/check.ts','utf8').includes('TYPE_ERROR')) {
  console.error('src/check.ts: error TS2322 (deliberate proof error)');
  process.exitCode=1;
} else if (args[0] === 'sync' && existsSync('SYNC_ERROR')) {
  console.error('Astro sync prerequisite failed (deliberate proof error)');
  process.exitCode=1;
}
`;
  for (const tool of ["eslint", "astro"]) {
    const filename = put(root, `node_modules/.bin/${tool}`, binary);
    chmodSync(filename, 0o755);
  }
}

function repository(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "printplan-hooks-proof-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "repo");
  mkdirSync(root);
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "hooks-proof@example.invalid");
  git(root, "config", "user.name", "Hook proof");
  put(root, ".gitignore", "node_modules/\n");
  put(root, "package.json", '{"type":"module"}\n');
  put(root, "src/check.ts", "export const value = 1;\n");
  put(root, "src/other.ts", "export const other = 2;\n");
  put(
    root,
    "scripts/related.test.mjs",
    'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { value } from "../src/check.ts";\ntest("independent value contract", () => assert.equal(value, 1));\n',
  );
  put(
    root,
    "scripts/unrelated.test.mjs",
    'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("unrelated behavior", () => assert.equal(1, 1));\n',
  );
  put(
    root,
    "scripts/failing.test.mjs",
    'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { appendFileSync } from "node:fs";\ntest("native fixture must not run at Stop", () => { appendFileSync(process.env.HOOK_NATIVE_TEST_MARKER, "ran\\n"); assert.fail("native fixture executed"); });\n',
  );
  installHooks(root);
  installFakeTools(root);
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Proof baseline");
  const log = path.join(directory, "commands.jsonl");
  return { directory, root, log, marker: path.join(directory, "native-tests-ran") };
}

function pushRepository(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "printplan-push-proof-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "repo");
  mkdirSync(root);
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "hooks-proof@example.invalid");
  git(root, "config", "user.name", "Hook proof");
  put(root, ".gitignore", "node_modules/\n");
  put(
    root,
    "package.json",
    JSON.stringify({
      type: "module",
      scripts: { prepare: "husky", "verify:deploy": "node scripts/gate-fixture.mjs" },
    }) + "\n",
  );
  cpSync(path.join(project, ".husky"), path.join(root, ".husky"), { recursive: true });
  symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"), "dir");
  put(
    root,
    "scripts/gate-fixture.mjs",
    'import { appendFileSync, readFileSync } from "node:fs";\n' +
      'appendFileSync(process.env.HOOK_GATE_LOG, "npm run verify:deploy\\n");\n' +
      'if (readFileSync(process.env.HOOK_GATE_RESULT, "utf8").trim() !== "pass") process.exitCode = 1;\n',
  );
  git(root, "add", ".");
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "Proof baseline");
  const remote = path.join(directory, "destination.git");
  const branch = git(root, "symbolic-ref", "--short", "HEAD");
  const clone = execute("git", ["clone", "--quiet", "--bare", root, remote]);
  assert.equal(clone.status, 0, clone.stderr);
  git(root, "remote", "add", "proof", remote);
  const originalPreCommit = readFileSync(path.join(root, ".husky/pre-commit"), "utf8");
  const prepare = execute("npm", ["run", "prepare"], { cwd: root, encoding: "utf8" });
  assert.equal(prepare.status, 0, prepare.stderr);
  assert.equal(git(root, "config", "core.hooksPath"), ".husky/_");
  assert.equal(readFileSync(path.join(root, ".husky/pre-commit"), "utf8"), originalPreCommit);
  assert.ok(existsSync(path.join(root, ".husky/_/pre-push")));
  return {
    directory,
    root,
    remote,
    branch,
    originalPreCommit,
    gateLog: path.join(directory, "gate.log"),
    gateResult: path.join(directory, "gate-result"),
  };
}

function patch(root, files, extra = {}) {
  return {
    cwd: root,
    tool_name: "apply_patch",
    tool_input: {
      command: `*** Begin Patch\n${files.map((file) => `*** Update File: ${file}\n@@\n+changed`).join("\n")}\n*** End Patch`,
    },
    ...extra,
  };
}

function invoke(fixture, script, payload, options = {}) {
  return execute(process.execPath, [path.join(fixture.root, `.codex/hooks/${script}.mjs`)], {
    cwd: fixture.root,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: {
      ...process.env,
      HOOK_PROOF_LOG: fixture.log,
      HOOK_NATIVE_TEST_MARKER: fixture.marker,
      CLAUDE_PROJECT_DIR: "/nonexistent/stale-checkout",
    },
    ...options,
  });
}

function clean(result, stop = false) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), stop ? "{}" : "");
}

function blocked(result, pattern) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, pattern);
}

function logEntries(fixture) {
  return existsSync(fixture.log)
    ? readFileSync(fixture.log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
}

test("per-edit: checks only named files, reports lint on stderr, and runs direct-import tests", (t) => {
  const fixture = repository(t);
  put(fixture.root, "src/check.ts", "export const value = 1; // LINT_ERROR\n");
  put(fixture.root, "src/other.ts", "// LINT_ERROR\n");
  put(
    fixture.root,
    "scripts/unrelated.test.mjs",
    'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("unrelated behavior", () => assert.equal(1, 2));\n',
  );
  blocked(invoke(fixture, "check-edits", patch(fixture.root, ["src/check.ts"])), /src\/check\.ts[\s\S]*no-unused-vars/);
  assert.deepEqual(logEntries(fixture)[0].args, ["--quiet", "--no-warn-ignored", "--", "src/check.ts"]);
  put(fixture.root, "src/check.ts", "export const value = 2;\n");
  blocked(
    invoke(fixture, "check-edits", patch(fixture.root, ["src/check.ts"])),
    /Related tests[\s\S]*independent value contract/,
  );
  put(fixture.root, "src/check.ts", "export const value = 1;\n");
  clean(invoke(fixture, "check-edits", patch(fixture.root, ["src/check.ts"])));
});

test("per-edit: supports Astro and tooling MJS files", (t) => {
  const fixture = repository(t);
  for (const filename of ["src/view.astro", "scripts/tool.mjs"]) {
    put(fixture.root, filename, "// LINT_ERROR\n");
    blocked(invoke(fixture, "check-edits", patch(fixture.root, [filename])), /no-unused-vars/);
  }
});

test("per-edit: skips unsupported, deleted/nonexistent, ignored and path-less payloads", (t) => {
  const fixture = repository(t);
  put(fixture.root, "README.md", "LINT_ERROR\n");
  put(fixture.root, ".agents/example.mjs", "// LINT_ERROR\n");
  for (const payload of [
    patch(fixture.root, ["README.md"]),
    patch(fixture.root, ["absent.ts"]),
    patch(fixture.root, [".agents/example.mjs"]),
    {},
    "",
    "not json",
    { cwd: fixture.root, tool_input: {} },
    { cwd: fixture.root, tool_input: { command: "not a patch" } },
    { tool_name: "Bash", tool_input: { command: "*** Update File: src/check.ts" } },
  ]) {
    clean(invoke(fixture, "check-edits", payload));
  }
  assert.deepEqual(logEntries(fixture), []);
});

test("per-edit: multi-file, rename, raw patch and subdirectory payloads", (t) => {
  const fixture = repository(t);
  const broken = "src/with space.ts";
  put(fixture.root, broken, "// LINT_ERROR\n");
  blocked(invoke(fixture, "check-edits", patch(fixture.root, ["src/check.ts", broken])), /with space\.ts/);
  const rename = {
    cwd: fixture.root,
    tool_name: "apply_patch",
    tool_input: { command: `*** Update File: gone.ts\n*** Move to: ${broken}\n` },
  };
  blocked(invoke(fixture, "check-edits", rename), /with space\.ts/);
  blocked(invoke(fixture, "check-edits", { ...rename, tool_input: rename.tool_input.command }), /with space\.ts/);
  blocked(invoke(fixture, "check-edits", patch(path.join(fixture.root, "src"), ["with space.ts"])), /with space\.ts/);
});

test("per-edit: foreign repositories and symlink escapes are skipped", (t) => {
  const fixture = repository(t);
  const foreign = repository(t);
  const filename = put(foreign.root, "src/foreign.ts", "// LINT_ERROR\n");
  clean(invoke(fixture, "check-edits", patch(fixture.root, [filename])));
  symlinkSync(filename, path.join(fixture.root, "src/linked.ts"));
  clean(invoke(fixture, "check-edits", patch(fixture.root, ["src/linked.ts"])));
  assert.deepEqual(logEntries(fixture), []);
});

test("per-edit: absent linter and unavailable git fail visibly", (t) => {
  const fixture = repository(t);
  rmSync(path.join(fixture.root, "node_modules/.bin/eslint"));
  blocked(invoke(fixture, "check-edits", patch(fixture.root, ["src/check.ts"])), /Missing local eslint/);
  blocked(
    invoke(fixture, "check-edits", patch(fixture.root, ["src/check.ts"]), { env: { ...process.env, PATH: "" } }),
    /Git is unavailable/,
  );
});

test("stop: clean checkout and malformed payloads run no checks", (t) => {
  const fixture = repository(t);
  for (const payload of [{ cwd: fixture.root }, {}, "", "not json"])
    clean(invoke(fixture, "check-turn", payload), true);
  assert.deepEqual(logEntries(fixture), []);
});

test("stop: shell-written tracked and untracked lint errors are caught; retry guard allows finish", (t) => {
  const fixture = repository(t);
  for (const filename of ["src/other.ts", "scripts/new-file.mjs"]) {
    put(fixture.root, filename, "// LINT_ERROR\n");
    blocked(invoke(fixture, "check-turn", { cwd: fixture.root }), /ESLint changed files[\s\S]*no-unused-vars/);
  }
  const previous = logEntries(fixture).length;
  clean(invoke(fixture, "check-turn", { cwd: fixture.root, stop_hook_active: true }), true);
  assert.equal(logEntries(fixture).length, previous);
});

test("stop: documentation-only and deleted-only changes launch no tools", (t) => {
  const fixture = repository(t);
  put(fixture.root, "README.md", "Documentation changed.\n");
  clean(invoke(fixture, "check-turn", { cwd: fixture.root }), true);
  assert.deepEqual(logEntries(fixture), []);
  rmSync(path.join(fixture.root, "README.md"));
  rmSync(path.join(fixture.root, "src/other.ts"));
  clean(invoke(fixture, "check-turn", { cwd: fixture.root }), true);
  assert.deepEqual(logEntries(fixture), []);
});

test("stop: lint-clean code skips Astro and native tests even when their fixtures would fail", (t) => {
  const fixture = repository(t);
  rmSync(path.join(fixture.root, "node_modules/.bin/astro"));
  put(fixture.root, "src/other.ts", "export const other = 3;\n");
  clean(invoke(fixture, "check-turn", { cwd: fixture.root }), true);
  assert.deepEqual(
    logEntries(fixture).map(({ tool }) => tool),
    ["eslint"],
  );
  assert.equal(existsSync(fixture.marker), false);
  rmSync(path.join(fixture.root, "scripts"), { recursive: true });
  put(fixture.root, "src/check.ts", "export const value = 2;\n");
  clean(invoke(fixture, "check-turn", { cwd: fixture.root }), true);
  assert.deepEqual(
    logEntries(fixture).map(({ tool }) => tool),
    ["eslint", "eslint"],
  );
});

test("stop: missing linter and unavailable Git fail visibly", (t) => {
  const fixture = repository(t);
  put(fixture.root, "src/other.ts", "export const other = 3;\n");
  rmSync(path.join(fixture.root, "node_modules/.bin/eslint"));
  blocked(invoke(fixture, "check-turn", { cwd: fixture.root }), /Missing local eslint/);
  blocked(
    invoke(fixture, "check-turn", { cwd: fixture.root }, { env: { ...process.env, PATH: "" } }),
    /Git is unavailable/,
  );
});

test("checkout: stale project-dir variables cannot redirect the checks", (t) => {
  const fixture = repository(t);
  const foreign = repository(t);
  put(foreign.root, "src/other.ts", "// LINT_ERROR\n");
  put(fixture.root, "src/other.ts", "export const other = 3;\n");
  const env = { ...process.env, CLAUDE_PROJECT_DIR: foreign.root, HOOK_PROOF_LOG: fixture.log };
  clean(invoke(fixture, "check-edits", patch(fixture.root, ["src/other.ts"]), { env }));
  clean(invoke(fixture, "check-turn", { cwd: fixture.root }, { env }), true);
});

test("checkout: sibling worktree edits are registered and swept from the original cwd", (t) => {
  const fixture = repository(t);
  const sibling = path.join(fixture.directory, "sibling");
  git(fixture.root, "worktree", "add", "--quiet", "--detach", sibling, "HEAD");
  installFakeTools(sibling);
  put(sibling, "src/other.ts", "// LINT_ERROR\n");
  const session_id = "session/../untrusted-id";
  blocked(
    invoke(fixture, "check-edits", patch(fixture.root, [path.join(sibling, "src/other.ts")], { session_id })),
    /sibling[\s\S]*no-unused-vars/,
  );
  blocked(invoke(fixture, "check-turn", { cwd: fixture.root, session_id }), /sibling[\s\S]*no-unused-vars/);
});

test("config: every command runs from a worktree subdirectory and ignores nonexistent project-dir", (t) => {
  const fixture = repository(t);
  const sibling = path.join(fixture.directory, "sibling");
  git(fixture.root, "worktree", "add", "--quiet", "--detach", sibling, "HEAD");
  installFakeTools(sibling);
  for (const [event, groups] of Object.entries(config.hooks)) {
    for (const group of groups)
      for (const hook of group.hooks) {
        assert.ok(hook.timeout > 0 && hook.timeout <= 120);
        clean(
          execute("bash", ["-c", hook.command], {
            cwd: path.join(sibling, "src"),
            input: JSON.stringify(event === "Stop" ? { cwd: sibling } : patch(sibling, ["src/other.ts"])),
            env: { ...process.env, CLAUDE_PROJECT_DIR: "/nonexistent", HOOK_PROOF_LOG: fixture.log },
          }),
          event === "Stop",
        );
      }
  }
});

test("config: missing script and Node runtime fail on the model-visible channel", (t) => {
  const fixture = repository(t);
  const command = config.hooks.PostToolUse[0].hooks[0].command;
  rmSync(path.join(fixture.root, ".codex/hooks/check-edits.mjs"));
  blocked(execute("bash", ["-c", command], { cwd: fixture.root, input: "{}" }), /Cannot find module/);
  const binaries = path.join(fixture.directory, "only-git");
  mkdirSync(binaries);
  symlinkSync(
    git(fixture.root, "--exec-path").replace(/\/lib(?:exec)?\/git-core$/, "/bin/git"),
    path.join(binaries, "git"),
  );
  blocked(
    execute("/bin/bash", ["-c", command], { cwd: fixture.root, input: "{}", env: { ...process.env, PATH: binaries } }),
    /Node\.js is missing/,
  );
});

test("pre-push: prepare installs Husky in checkouts and a failed full gate blocks refs", (t) => {
  const fixture = pushRepository(t);
  const linked = path.join(fixture.directory, "linked-worktree");
  git(fixture.root, "worktree", "add", "--quiet", "--detach", linked, "HEAD");
  if (!existsSync(path.join(linked, "node_modules")))
    symlinkSync(path.join(project, "node_modules"), path.join(linked, "node_modules"), "dir");
  const linkedPreCommit = readFileSync(path.join(linked, ".husky/pre-commit"), "utf8");
  const linkedPrepare = execute("npm", ["run", "prepare"], { cwd: linked, encoding: "utf8" });
  assert.equal(linkedPrepare.status, 0, linkedPrepare.stderr);
  assert.equal(git(linked, "config", "core.hooksPath"), ".husky/_");
  assert.ok(existsSync(path.join(linked, ".husky/_/pre-push")));
  assert.equal(readFileSync(path.join(linked, ".husky/pre-commit"), "utf8"), linkedPreCommit);

  put(fixture.root, "src/next.txt", "next revision\n");
  git(fixture.root, "add", "src/next.txt");
  const commit = execute("git", ["-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "Push candidate"], {
    cwd: fixture.root,
    encoding: "utf8",
  });
  assert.equal(commit.status, 0, commit.stderr);
  const destinationRef = `refs/heads/${fixture.branch}`;
  const pushRef = `HEAD:${destinationRef}`;
  const before = git(fixture.remote, "rev-parse", destinationRef);
  writeFileSync(fixture.gateResult, "fail\n");
  const rejected = execute("git", ["push", "proof", pushRef], {
    cwd: fixture.root,
    encoding: "utf8",
    env: { ...process.env, HOOK_GATE_LOG: fixture.gateLog, HOOK_GATE_RESULT: fixture.gateResult },
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr + rejected.stdout, /verify:deploy|failed/i);
  assert.equal(git(fixture.remote, "rev-parse", destinationRef), before);
  assert.equal(readFileSync(fixture.gateLog, "utf8"), "npm run verify:deploy\n");

  writeFileSync(fixture.gateResult, "pass\n");
  const accepted = execute("git", ["push", "proof", pushRef], {
    cwd: fixture.root,
    encoding: "utf8",
    env: { ...process.env, HOOK_GATE_LOG: fixture.gateLog, HOOK_GATE_RESULT: fixture.gateResult },
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(git(fixture.remote, "rev-parse", destinationRef), git(fixture.root, "rev-parse", "HEAD"));
  assert.equal(readFileSync(fixture.gateLog, "utf8"), "npm run verify:deploy\nnpm run verify:deploy\n");
  assert.equal(readFileSync(path.join(fixture.root, ".husky/pre-commit"), "utf8"), fixture.originalPreCommit);
});

test(
  "real tools: deliberate lint errors fail, then repairs pass through both hooks",
  { skip: process.env.PRINTPLAN_HOOKS_REAL_TOOLS !== "1", timeout: 120000 },
  (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "printplan-hooks-real-"));
    const root = path.join(directory, "checkout");
    git(project, "worktree", "add", "--quiet", "--detach", root, "HEAD");
    t.after(() => {
      git(project, "worktree", "remove", "--force", root);
      rmSync(directory, { recursive: true, force: true });
    });
    installHooks(root);
    cpSync(path.join(project, "eslint.config.js"), path.join(root, "eslint.config.js"));
    symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"), "dir");
    const fixture = { root, log: path.join(directory, "log") };
    put(root, "scripts/hook-proof.mjs", "const unusedHookProof = 1;\n");
    blocked(
      invoke(fixture, "check-edits", patch(root, ["scripts/hook-proof.mjs"]), { timeout: 30000 }),
      /hook-proof\.mjs[\s\S]*no-unused-vars/,
    );
    put(root, "scripts/hook-proof.mjs", "export const hookProof = 1;\n");
    clean(invoke(fixture, "check-edits", patch(root, ["scripts/hook-proof.mjs"]), { timeout: 30000 }));
    put(root, "scripts/stop-hook-proof.mjs", "const unusedStopHookProof = 1;\n");
    blocked(
      invoke(fixture, "check-turn", { cwd: root }, { timeout: 60000 }),
      /stop-hook-proof\.mjs[\s\S]*no-unused-vars/,
    );
    put(root, "scripts/stop-hook-proof.mjs", "export const stopHookProof = 1;\n");
    clean(invoke(fixture, "check-turn", { cwd: root }, { timeout: 60000 }), true);
  },
);
