import { CHECK_NAME, BOT, trustedCheck, freshness, recoverCheck, runUrl } from "./prepare.mjs";
import { MARKER, provenance, renderComment } from "../reporting/comment.mjs";
import { safeGitHubErrorCode } from "./client.mjs";

export async function ownedComment(client, id, runs = new Map()) {
  const comments = await client.pages(`/issues/${id.pr}/comments`);
  for (const comment of comments) {
    if (
      comment.user?.login !== BOT ||
      comment.user?.type !== "Bot" ||
      !comment.body?.startsWith(MARKER) ||
      comment.issue_url !== `https://api.github.com/repos/${id.repository}/issues/${id.pr}`
    )
      continue;
    // Comments from earlier head SHAs retain verifiable check provenance.
    const match = comment.body.match(/<!-- provenance:([\w.-]+\/[\w.-]+):(\d+):(\d+):(\d+):(\d+) -->/);
    if (!match || match[1] !== id.repository || Number(match[2]) !== id.pr) continue;
    const check = await client.request("GET", `/check-runs/${match[3]}`, undefined, { missing: true });
    const source = check && (await trustedCheck(client, check, id.repository, id.pr, runs));
    if (source && comment.body.includes(provenance(source, check.id))) return comment;
  }
  return null;
}
export async function publishReview({ client, id, context, envelope, preparationError = "PREPARATION_FAILED" }) {
  // Cache run provenance only for this invocation. Live PR/check freshness is never cached.
  const runs = new Map();
  const check = await recoverCheck(client, id);
  if (!check) throw new Error("CHECK_NOT_FOUND");
  // Duplicate delivery never rewrites an already completed execution.
  if (check.status === "completed") return { conclusion: check.conclusion, duplicate: true };
  const complete = async (conclusion, summary) =>
    client.request(
      "PATCH",
      `/check-runs/${check.id}`,
      {
        name: CHECK_NAME,
        status: "completed",
        conclusion,
        details_url: runUrl(id),
        output: { title: conclusion === "success" ? "Review passed" : "Review did not pass", summary },
      },
      { retry: true },
    );
  const stale = await freshness(client, id, runs);
  if (stale) {
    await complete(
      "cancelled",
      `${stale}: outdated head, base, or execution. Update the branch to request replacement review.`,
    );
    return { conclusion: "cancelled", stale: true };
  }
  let error = null;
  try {
    if (!context || !envelope) throw new Error(preparationError);
    const { validateEnvelope } = await import("../contracts/validate.mjs");
    validateEnvelope(envelope, context);
    if (
      Object.entries(id).some(
        ([key, value]) =>
          ["repository", "pr", "head", "base", "runId", "runAttempt"].includes(key) && context[key] !== value,
      )
    )
      throw new Error("CONTEXT_MISMATCH");
    if (envelope.status !== "completed") error = envelope.error.code;
  } catch {
    error = "REVIEW_UNAVAILABLE";
    envelope = null;
  }
  const guard = async () => {
    if (await freshness(client, id, runs)) throw new Error("SUPERSEDED");
  };
  const clear = async (label) => {
    await guard();
    await client.request("DELETE", `/issues/${id.pr}/labels/${encodeURIComponent(label)}`, undefined, {
      retry: true,
      missing: true,
    });
  };
  let operation = "clear_result_labels";
  try {
    // Clear obsolete outcomes before advertising a replacement.
    await clear("ai-cr:passed");
    await clear("ai-cr:failed");
    operation = "comment_lookup";
    const existing = await ownedComment(client, id, runs);
    await guard();
    const body = renderComment({ id, checkId: check.id, envelope: error ? null : envelope, error });
    operation = "comment_write";
    if (existing) await client.request("PATCH", `/issues/comments/${existing.id}`, { body }, { retry: true });
    else await client.request("POST", `/issues/${id.pr}/comments`, { body });
    if (!error) {
      operation = "result_label";
      await guard();
      await client.request(
        "POST",
        `/issues/${id.pr}/labels`,
        { labels: [`ai-cr:${envelope.review.verdict === "pass" ? "passed" : "failed"}`] },
        { retry: true },
      );
    }
    await guard();
    operation = "check_completion";
    const conclusion = error
      ? error === "DEADLINE_EXCEEDED"
        ? "timed_out"
        : "failure"
      : envelope.review.verdict === "pass"
        ? "success"
        : "failure";
    await complete(
      conclusion,
      error
        ? `${error}: no code verdict is available.`
        : `Validated code verdict: ${envelope.review.verdict}. Comment and labels published.`,
    );
    return { conclusion };
  } catch (cause) {
    const errorCode = safeGitHubErrorCode(cause);
    const moved = await freshness(client, id, runs);
    if (!moved) {
      // A partial publication cannot leave a result label claiming approval.
      for (const label of ["ai-cr:passed", "ai-cr:failed"]) {
        try {
          await clear(label);
        } catch {
          /* API outages can prevent cleanup; never fabricate success. */
        }
      }
      try {
        const existing = await ownedComment(client, id, runs);
        await guard();
        const body = renderComment({ id, checkId: check.id, error: "PUBLICATION_FAILED" });
        // Never repeat an ambiguous comment POST: an outage may hide its successful creation.
        if (existing) await client.request("PATCH", `/issues/comments/${existing.id}`, { body }, { retry: true });
      } catch {
        /* Keep the failed check authoritative when comment publication is unavailable. */
      }
    }
    await complete(
      moved ? "cancelled" : "failure",
      moved
        ? "SUPERSEDED: a newer review owns publication."
        : `PUBLICATION_FAILED: ${operation} (${errorCode}); no successful review was published.`,
    );
    return { conclusion: moved ? "cancelled" : "failure", errorCode, operation };
  }
}
