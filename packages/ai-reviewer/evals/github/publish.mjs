import { readFile } from "node:fs/promises";
import { validateEvalMatrix, validateEvalRun } from "./checks.mjs";

export function evaluatePublication({ identity, run, livePR, report }) {
  if (!identity || !run || !livePR) return { conclusion: "failure", reason: "MISSING_PROVENANCE" };
  if (!validateEvalRun(run, identity)) return { conclusion: "failure", reason: "INVALID_PROVENANCE" };
  if (livePR.state !== "open" || livePR.head?.sha !== identity.head || livePR.base?.sha !== identity.base)
    return { conclusion: "failure", reason: "STALE_REFS" };
  if (identity.unchanged === true) return { conclusion: "success", reason: "PROMPT_UNCHANGED" };
  if (!validateEvalMatrix(report, { promptDigest: identity.promptDigest }))
    return { conclusion: "failure", reason: "INVALID_OR_INCOMPLETE_MATRIX" };
  return { conclusion: "success", reason: "ALL_CASES_PASSED" };
}

async function github(token, repository, path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error("PROVENANCE_READ_FAILED");
  return response.json();
}

if (process.env.EVAL_IDENTITY_FILE && process.env.GITHUB_TOKEN) {
  const identity = JSON.parse(await readFile(process.env.EVAL_IDENTITY_FILE, "utf8"));
  const report = await readFile(process.env.EVAL_REPORT_FILE, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const [run, livePR] = await Promise.all([
    github(process.env.GITHUB_TOKEN, identity.repository, `/actions/runs/${identity.runId}`),
    github(process.env.GITHUB_TOKEN, identity.repository, `/pulls/${identity.pr}`),
  ]);
  const outcome = evaluatePublication({ identity, run, livePR, report });
  const update = await fetch(`https://api.github.com/repos/${identity.repository}/check-runs/${identity.checkId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "completed",
      conclusion: outcome.conclusion,
      output: { title: "Reviewer evaluation finished", summary: outcome.reason },
    }),
  });
  if (!update.ok || outcome.conclusion !== "success") throw new Error(outcome.reason);
}
