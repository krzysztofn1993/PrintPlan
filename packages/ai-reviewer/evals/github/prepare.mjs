import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { dirname, resolve } from "node:path";

export const PROMPT_PATHS = Object.freeze([
  "packages/ai-reviewer/prompts/code-review/system.md",
  "packages/ai-reviewer/prompts/code-review/criteria.md",
]);
const limit = 64 * 1024;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "buffer", maxBuffer: 2 * 1024 * 1024 });
}

export function extractCandidatePrompts({ cwd, head, paths = PROMPT_PATHS }) {
  if (!/^[a-f0-9]{40}$/.test(head) || paths.join("\n") !== PROMPT_PATHS.join("\n"))
    throw new Error("INVALID_PROMPT_REQUEST");
  let tree;
  try {
    tree = git(cwd, ["ls-tree", "-z", head, "--", ...PROMPT_PATHS]).toString("utf8");
  } catch {
    throw new Error("PROMPT_MISSING");
  }
  const entries = tree.split("\0").filter(Boolean);
  if (entries.length !== PROMPT_PATHS.length) throw new Error("PROMPT_MISSING");
  const contents = [];
  for (const expected of PROMPT_PATHS) {
    const entry = entries.find((line) => line.slice(line.indexOf("\t") + 1) === expected);
    const match = entry?.match(/^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40})\t(.+)$/);
    if (!match || match[4] !== expected) throw new Error("PROMPT_MISSING");
    if (match[1] === "120000" || match[2] !== "blob") throw new Error("PROMPT_NOT_REGULAR_FILE");
    const bytes = git(cwd, ["cat-file", "blob", match[3]]);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("PROMPT_INVALID_UTF8");
    }
    if (!text.trim()) throw new Error("PROMPT_EMPTY");
    contents.push(text);
  }
  if (contents.reduce((sum, item) => sum + Buffer.byteLength(item), 0) > limit) throw new Error("PROMPT_TOO_LARGE");
  const digest = createHash("sha256").update(JSON.stringify(contents)).digest("hex");
  return { system: contents[0], criteria: contents[1], digest };
}

export async function stageTrustedPackage({ trustedRoot, destination, candidate }) {
  const source = resolve(trustedRoot, "packages/ai-reviewer/evals");
  const target = resolve(destination, "packages/ai-reviewer/evals");
  // Only the two data files are overlaid; package code and policy stay trusted.
  await mkdir(dirname(resolve(destination, PROMPT_PATHS[0])), { recursive: true });
  await writeFile(resolve(destination, PROMPT_PATHS[0]), candidate.system, { flag: "w" });
  await writeFile(resolve(destination, PROMPT_PATHS[1]), candidate.criteria, { flag: "w" });
  return { source, target, promptDigest: candidate.digest };
}

export function eligibleEvalEvent(event, owner) {
  const pr = event?.pull_request;
  if (!pr || !["opened", "synchronize", "reopened"].includes(event.action)) return false;
  if (pr.base?.ref !== "master" || pr.state === "closed") return false;
  if (pr.head?.repo?.full_name?.toLowerCase() !== event.repository?.full_name?.toLowerCase()) return false;
  if (pr.user?.type === "Bot" || event.sender?.type === "Bot" || !owner?.trim()) return false;
  return (
    pr.user?.login?.toLowerCase() === owner.toLowerCase() && event.sender?.login?.toLowerCase() === owner.toLowerCase()
  );
}

export function executionIdentity(event, runId, runAttempt, workflowSha = process.env.GITHUB_SHA) {
  const pr = event.pull_request;
  const id = {
    repository: event.repository.full_name,
    pr: pr.number,
    base: pr.base.sha,
    head: pr.head.sha,
    runId: String(runId),
    runAttempt: Number(runAttempt),
    workflowSha,
  };
  if (!/^[-\w.]+\/[-\w.]+$/.test(id.repository) || !Number.isSafeInteger(id.pr) || id.pr < 1)
    throw new Error("INVALID_EXECUTION");
  if (![id.base, id.head].every((sha) => /^[a-f0-9]{40}$/.test(sha))) throw new Error("INVALID_EXECUTION");
  if (!/^[a-f0-9]{40}$/.test(id.workflowSha ?? "")) throw new Error("INVALID_EXECUTION");
  if (!/^\d+$/.test(id.runId) || !Number.isSafeInteger(id.runAttempt) || id.runAttempt < 1)
    throw new Error("INVALID_EXECUTION");
  return id;
}

if ((process.env.EVAL_EVENT_PATH || process.env.GITHUB_EVENT_PATH) && process.env.CANDIDATE_OUTPUT) {
  const { readFile } = await import("node:fs/promises");
  const event = JSON.parse(await readFile(process.env.EVAL_EVENT_PATH || process.env.GITHUB_EVENT_PATH, "utf8"));
  const owner = process.env.AI_REVIEW_OWNER;
  if (!eligibleEvalEvent(event, owner)) {
    process.stdout.write(JSON.stringify({ eligible: false }));
  } else {
    const identity = executionIdentity(event, process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT);
    const candidate = extractCandidatePrompts({ cwd: process.env.GITHUB_WORKSPACE, head: identity.head });
    const { loadPrompt } = await import("../../src/prompts/load.mjs");
    const unchanged = candidate.digest === (await loadPrompt()).digest;
    const destination = resolve(process.env.RUNNER_TEMP, "eval-candidate");
    await stageTrustedPackage({ trustedRoot: process.env.GITHUB_WORKSPACE, destination, candidate });
    const checkId = Number(process.env.EVAL_CHECK_ID);
    const result = { ...identity, checkId, promptDigest: candidate.digest, unchanged };
    await writeFile(process.env.CANDIDATE_OUTPUT, JSON.stringify(result));
    process.stdout.write(JSON.stringify({ eligible: true, ...result }));
  }
}
