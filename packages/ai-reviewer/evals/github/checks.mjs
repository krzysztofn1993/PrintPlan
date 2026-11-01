export const EVAL_CHECK_NAME = "AI Reviewer Evals";
export const EVAL_WORKFLOW = ".github/workflows/reviewer-evals.yml";

export async function openEvalCheck(client, identity) {
  return client.request("POST", "/check-runs", {
    name: EVAL_CHECK_NAME,
    head_sha: identity.head,
    status: "in_progress",
    external_id: JSON.stringify(identity),
    output: { title: "Reviewer evaluation pending", summary: "Trusted evaluation preparation is in progress." },
  });
}

export function validateEvalRun(run, identity) {
  return Boolean(
    run &&
    ["pull_request_target", "workflow_dispatch"].includes(run.event) &&
    run.path?.split("@")[0] === EVAL_WORKFLOW &&
    run.repository?.full_name === identity.repository &&
    run.head_sha === identity.workflowSha &&
    run.run_attempt >= identity.runAttempt &&
    (run.event === "workflow_dispatch" || run.pull_requests?.some((pr) => pr.number === identity.pr)),
  );
}

export function validateEvalMatrix(report, expected) {
  if (
    !report ||
    report.manifest?.promptDigest !== expected.promptDigest ||
    report.manifest?.mode !== "gate" ||
    report.manifest?.planned !== 9 ||
    report.matrix?.length !== 9
  )
    return false;
  const cells = new Set();
  for (const row of report.matrix) {
    const key = `${row.caseId}/${row.repetition}`;
    if (
      !["case-01", "case-02", "case-03"].includes(row.caseId) ||
      !Number.isInteger(row.repetition) ||
      row.repetition < 1 ||
      row.repetition > 3 ||
      row.status !== "pass" ||
      row.promptDigest !== expected.promptDigest ||
      cells.has(key)
    )
      return false;
    cells.add(key);
  }
  return cells.size === 9;
}
