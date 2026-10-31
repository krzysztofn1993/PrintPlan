export const CHECK_NAME = "AI Code Review";
export const BOT = "github-actions[bot]";
const lower = (value) => (typeof value === "string" ? value.toLowerCase() : "");
export function eligible(event, owner) {
  if (!owner?.trim()) throw new Error("OWNER_REQUIRED");
  const pr = event.pull_request;
  return Boolean(
    pr &&
    ["opened", "synchronize", "reopened", "labeled"].includes(event.action) &&
    (event.action !== "labeled" || event.label?.name === "ai-cr:review") &&
    pr.base?.ref === "master" &&
    pr.state !== "closed" &&
    lower(pr.head?.repo?.full_name) === lower(event.repository?.full_name) &&
    lower(pr.user?.login) === lower(owner) &&
    lower(event.sender?.login) === lower(owner) &&
    pr.user?.type !== "Bot" &&
    event.sender?.type !== "Bot",
  );
}
export function execution(event, runId, runAttempt) {
  const identity = {
    version: 1,
    repository: event.repository.full_name,
    pr: event.pull_request.number,
    head: event.pull_request.head.sha,
    base: event.pull_request.base.sha,
    runId: String(runId),
    runAttempt: Number(runAttempt),
  };
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(identity.repository) ||
    !Number.isSafeInteger(identity.pr) ||
    identity.pr < 1 ||
    ![identity.head, identity.base].every((sha) => /^[a-f0-9]{40}$/.test(sha)) ||
    !/^\d+$/.test(identity.runId) ||
    !Number.isSafeInteger(identity.runAttempt) ||
    identity.runAttempt < 1
  )
    throw new Error("INVALID_EXECUTION");
  return identity;
}
export const externalId = (id) =>
  JSON.stringify(
    Object.fromEntries(
      ["version", "repository", "pr", "head", "base", "runId", "runAttempt"].map((key) => [key, id[key]]),
    ),
  );
export function checkIdentity(check, repository, pr) {
  try {
    const id = JSON.parse(check.external_id);
    if (
      check.name !== CHECK_NAME ||
      check.app?.slug !== "github-actions" ||
      id.version !== 1 ||
      id.repository !== repository ||
      id.pr !== pr ||
      id.head !== check.head_sha ||
      !/^\d+$/.test(id.runId) ||
      !Number.isInteger(id.runAttempt)
    )
      return null;
    const url = `https://github.com/${repository}/actions/runs/${id.runId}/attempts/${id.runAttempt}`;
    return check.details_url === url ? id : null;
  } catch {
    return null;
  }
}
// Validate that a marker/check belongs to this workflow's PR run, not another bot workflow.
export async function trustedCheck(client, check, repository, pr) {
  const id = checkIdentity(check, repository, pr);
  if (!id) return null;
  const run = await client.request("GET", `/actions/runs/${id.runId}`, undefined, { missing: true });
  if (
    !run ||
    run.event !== "pull_request" ||
    run.path?.split("@")[0] !== ".github/workflows/review.yml" ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.run_attempt < id.runAttempt ||
    !run.pull_requests?.some((item) => item.number === pr && item.head.sha === id.head && item.base.sha === id.base)
  )
    return null;
  return id;
}
export const runUrl = (id) => `https://github.com/${id.repository}/actions/runs/${id.runId}/attempts/${id.runAttempt}`;
export const newer = (a, b) =>
  BigInt(a.runId) > BigInt(b.runId) || (a.runId === b.runId && a.runAttempt > b.runAttempt);
export async function checks(client, id) {
  return client.pages(
    `/commits/${id.head}/check-runs?check_name=${encodeURIComponent(CHECK_NAME)}&filter=all`,
    "check_runs",
  );
}
export async function freshness(client, id) {
  const pr = await client.request("GET", `/pulls/${id.pr}`);
  if (pr.head.sha !== id.head || pr.base.sha !== id.base || pr.state === "closed") return "BRANCH_MOVED";
  const list = await checks(client, id);
  for (const check of list) {
    const other = await trustedCheck(client, check, id.repository, id.pr);
    if (other && newer(other, id)) return "SUPERSEDED";
  }
  return null;
}
export async function recoverCheck(client, id) {
  return (
    (await checks(client, id)).find(
      (check) => checkIdentity(check, id.repository, id.pr) && check.external_id === externalId(id),
    ) ?? null
  );
}
export async function prepareCheck({
  client,
  event,
  owner,
  runId,
  runAttempt,
  persist = async () => {
    /* Persistence is optional for injected callers. */
  },
}) {
  if (!eligible(event, owner)) return null;
  const id = execution(event, runId, runAttempt);
  if (await freshness(client, id)) throw new Error("STALE_PREPARATION");
  let check = await recoverCheck(client, id);
  if (!check) {
    check = await client.request("POST", "/check-runs", {
      name: CHECK_NAME,
      head_sha: id.head,
      status: "in_progress",
      external_id: externalId(id),
      details_url: runUrl(id),
      output: { title: "Review pending", summary: "Trusted preparation is pending; no code verdict is available." },
    });
  }
  await persist({ ...id, checkId: check.id, completed: check.status === "completed" });
  if (event.action === "labeled") {
    if (await freshness(client, id)) throw new Error("STALE_PREPARATION");
    await client.request("DELETE", `/issues/${id.pr}/labels/ai-cr%3Areview`, undefined, { missing: true, retry: true });
  }
  return { ...id, checkId: check.id };
}
