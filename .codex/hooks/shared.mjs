import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const environment = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
// A hook invoked by its proof suite must launch an independent test runner.
// Inheriting this internal flag makes `node --test` skip files with exit 0.
delete environment.NODE_TEST_CONTEXT;
// The opt-in real-tool hook proof must not recursively start another real-tool proof.
delete environment.PRINTPLAN_HOOKS_REAL_TOOLS;
const codeExtension = /\.(?:[cm]?js|jsx|ts|tsx|astro)$/;

export function readPayload() {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function run(command, args, cwd, deadline = Date.now() + 30000) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { status: 1, output: "Hook check deadline exceeded." };
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: remaining,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    output: [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
  };
}

function git(cwd, args) {
  const result = run("git", args, cwd);
  if (result.status !== 0) throw new Error(`Git check failed in ${cwd}: ${result.output}`);
  return result.output;
}

function commonDirectory(root) {
  return realpathSync(path.resolve(root, git(root, ["rev-parse", "--git-common-dir"]).trim()));
}

export function ownedRoot(directory) {
  const result = run("git", ["rev-parse", "--show-toplevel"], directory);
  if (result.status !== 0) {
    if (/ENOENT/.test(result.output)) throw new Error(`Git is unavailable: ${result.output}`);
    return null;
  }
  const root = realpathSync(result.output.trim());
  return commonDirectory(root) === commonDirectory(checkout) ? root : null;
}

export function payloadCwd(payload) {
  return typeof payload?.cwd === "string" && payload.cwd ? path.resolve(payload.cwd) : process.cwd();
}

export function coveredFile(root, filename) {
  const relative = path.relative(root, filename);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative) &&
    !/^(?:node_modules|dist|\.astro|\.wrangler|\.agents)(?:\/|\\)/.test(relative) &&
    codeExtension.test(relative) &&
    existsSync(filename) &&
    statSync(filename).isFile()
  );
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sessionDirectory(root, sessionId) {
  return path.join(commonDirectory(root), "printplan-agent-hook-sessions", digest(sessionId));
}

export function registerCheckout(root, payload) {
  if (typeof payload?.session_id !== "string" || !payload.session_id) return;
  const directory = sessionDirectory(root, payload.session_id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, `${digest(root)}.json`);
  const temporary = `${filename}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ root }), { mode: 0o600 });
  renameSync(temporary, filename);
}

export function sessionCheckouts(root, payload) {
  const roots = new Set([root]);
  if (typeof payload?.session_id !== "string" || !payload.session_id) return [...roots];
  const directory = sessionDirectory(root, payload.session_id);
  if (!existsSync(directory)) return [...roots];
  for (const filename of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    const entry = JSON.parse(readFileSync(path.join(directory, filename), "utf8"));
    if (typeof entry.root === "string" && existsSync(entry.root)) {
      const candidate = ownedRoot(entry.root);
      if (candidate) roots.add(candidate);
    }
  }
  return [...roots];
}

export function patchFiles(payload) {
  if (payload?.tool_name && !["apply_patch", "Edit", "Write"].includes(payload.tool_name)) return [];
  const patch = typeof payload?.tool_input === "string" ? payload.tool_input : payload?.tool_input?.command;
  if (typeof patch !== "string") return [];
  return [
    ...new Set(
      [...patch.matchAll(/^\*\*\* (?:Update File|Add File|Move to): (.+)\r?$/gm)].map((match) =>
        match[1].replace(/\r$/, ""),
      ),
    ),
  ];
}

export function changedFiles(root) {
  const tracked = git(root, ["diff", "--name-only", "-z", "HEAD", "--"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return [...new Set([...tracked.split("\0"), ...untracked.split("\0")].filter(Boolean))];
}

export function testFiles(root) {
  const tracked = git(root, ["ls-files", "-z", "--", "scripts/*.test.mjs"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", "scripts/*.test.mjs"]);
  return [
    ...new Set(
      [...tracked.split("\0"), ...untracked.split("\0")].filter((file) => file && existsSync(path.join(root, file))),
    ),
  ];
}

export function relatedTests(root, files) {
  const candidates = testFiles(root);
  const edited = new Set(files.map((file) => realpathSync(file)));
  const queries = new Set();
  for (const testFile of candidates) {
    for (const file of files) {
      let relative = path
        .relative(path.dirname(path.join(root, testFile)), file)
        .split(path.sep)
        .join("/");
      if (!relative.startsWith(".")) relative = `./${relative}`;
      queries.add(relative);
      queries.add(relative.replace(codeExtension, ""));
      const fromRoot = path.relative(root, file).split(path.sep).join("/");
      if (fromRoot.startsWith("src/")) {
        queries.add(`@/${fromRoot.slice(4)}`);
        queries.add(`@/${fromRoot.slice(4).replace(codeExtension, "")}`);
      }
    }
  }
  const tracked = new Set(git(root, ["ls-files", "-z", "--", "scripts/*.test.mjs"]).split("\0"));
  const matches = new Set();
  if (queries.size && candidates.some((file) => tracked.has(file))) {
    const result = run(
      "git",
      [
        "grep",
        "-l",
        "-z",
        "-F",
        ...[...queries].flatMap((query) => ["-e", query]),
        "--",
        ...candidates.filter((file) => tracked.has(file)),
      ],
      root,
    );
    if (result.status > 1) throw new Error(`Related-test selection failed: ${result.output}`);
    for (const file of result.output.split("\0").filter(Boolean)) matches.add(file);
  }
  const hookChanged = files.some((file) =>
    path.relative(root, file).split(path.sep).join("/").startsWith(".codex/hooks/"),
  );
  return candidates.filter((file) => {
    if (edited.has(realpathSync(path.join(root, file)))) return true;
    if (hookChanged && file === "scripts/agent-hooks.test.mjs") return true;
    if (tracked.has(file) && !matches.has(file)) return false;
    const source = readFileSync(path.join(root, file), "utf8");
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)];
    return imports.some(([, specifier]) => {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return false;
      const base = specifier.startsWith("@/")
        ? path.join(root, "src", specifier.slice(2))
        : path.resolve(root, path.dirname(file), specifier);
      return [base, ...[".ts", ".tsx", ".js", ".mjs", ".jsx"].map((extension) => `${base}${extension}`)].some(
        (candidate) => existsSync(candidate) && statSync(candidate).isFile() && edited.has(realpathSync(candidate)),
      );
    });
  });
}

export function runLocal(root, tool, args, deadline) {
  const binary = path.join(root, "node_modules", ".bin", tool);
  if (!existsSync(binary))
    return {
      status: 1,
      output: `Missing local ${tool} executable: ${binary}. Run npm ci with the pinned Node version.`,
    };
  return run(process.execPath, [realpathSync(binary), ...args], root, deadline);
}

export function runTests(root, files, deadline) {
  if (!files.length)
    return { status: 1, output: "No native test files found under scripts/*.test.mjs; the test gate did not run." };
  return run(process.execPath, ["--experimental-strip-types", "--test", ...files], root, deadline);
}

export function reportFailure(reports) {
  const message = `PrintPlan agent checks failed. Fix these before finishing:\n${reports.join("\n\n")}`;
  const bounded =
    message.length > 14000 ? `${message.slice(0, 9500)}\n[output shortened]\n${message.slice(-4000)}` : message;
  process.stderr.write(`${bounded}\n`);
  process.exitCode = 2;
}
