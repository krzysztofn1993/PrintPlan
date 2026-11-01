import { execFileSync } from "node:child_process";
import { assembleInput } from "../core/review.mjs";
// Only immutable object IDs enter Git arguments. Never execute head scripts/configuration.
export function collectDiff({ cwd, head, base, title, body = "", git = execFileSync }) {
  if (![head, base].every((sha) => /^[a-f0-9]{40}$/.test(sha))) throw new Error("INVALID_SHA");
  const command = (args) =>
    git("git", ["-c", "core.hooksPath=/dev/null", "-c", "diff.external=", ...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 1_572_864,
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ATTR_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
    });
  const mergeBase = command(["merge-base", base, head]).trim();
  if (!/^[a-f0-9]{40}$/.test(mergeBase)) throw new Error("INVALID_MERGE_BASE");
  const paths = command([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--name-only",
    "--no-renames",
    "-z",
    mergeBase,
    head,
    "--",
  ])
    .split("\0")
    .filter(Boolean);
  if (paths.length > 200) throw new Error("INPUT_PATHS");
  const stats = command([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--numstat",
    "-z",
    "--no-renames",
    mergeBase,
    head,
    "--",
  ])
    .split("\0")
    .filter(Boolean);
  const unreviewedPaths = stats.filter((line) => line.startsWith("-\t-\t")).map((line) => line.slice(4));
  // Compact identical moves without changing the complete path inventory or binary disclosure.
  const diff = command(["diff", "--no-ext-diff", "--no-textconv", "--find-renames=100%", mergeBase, head, "--"]);
  const input = { title, body: body ?? "", paths, unreviewedPaths, diff };
  assembleInput(input);
  return { mergeBase, input };
}
