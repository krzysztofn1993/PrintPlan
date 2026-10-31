import { CHECK_NAME, BOT, trustedCheck, checks, freshness, recoverCheck, runUrl } from "./prepare.mjs";
import { MARKER, provenance, renderComment } from "../reporting/comment.mjs";

export async function ownedComment(client, id) {
  const comments = await client.pages(`/issues/${id.pr}/comments`);
  const trusted = await checks(client, id);
  for (const comment of comments) {
    if (
      comment.user?.login !== BOT ||
      comment.user?.type !== "Bot" ||
      !comment.body?.startsWith(MARKER) ||
      comment.issue_url !== `https://api.github.com/repos/${id.repository}/issues/${id.pr}`
    )
      continue;
    for (const check of trusted) {
      const source = await trustedCheck(client, check, id.repository, id.pr);
      if (source && comment.body.includes(provenance(source, check.id))) return comment;
    }
    // Comments from earlier head SHAs retain verifiable check provenance.
    const match = comment.body.match(/<!-- provenance:([\w.-]+\/[\w.-]+):(\d+):(\d+):(\d+):(\d+) -->/);
    if (!match || match[1] !== id.repository || Number(match[2]) !== id.pr) continue;
    const check = await client.request("GET", `/check-runs/${match[3]}`, undefined, { missing: true });
    const source = check && (await trustedCheck(client, check, id.repository, id.pr));
    if (source && comment.body.includes(provenance(source, check.id))) return comment;
  }
  return null;
}
export async function publishReview({ client, id, context, envelope, preparationError = "PREPARATION_FAILED" }) {
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
  const stale = await freshness(client, id);
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
    if (await freshness(client, id)) throw new Error("SUPERSEDED");
  };
  const clear = async (label) => {
    await guard();
    await client.request("DELETE", `/issues/${id.pr}/labels/${encodeURIComponent(label)}`, undefined, {
      retry: true,
      missing: true,
    });
  };
  try {
    // Clear obsolete outcomes before advertising a replacement.
    await clear("ai-cr:passed");
    await clear("ai-cr:failed");
    const existing = await ownedComment(client, id);
    await guard();
    const body = renderComment({ id, checkId: check.id, envelope: error ? null : envelope, error });
    if (existing) await client.request("PATCH", `/issues/comments/${existing.id}`, { body }, { retry: true });
    else await client.request("POST", `/issues/${id.pr}/comments`, { body });
    if (!error) {
      await guard();
      await client.request(
        "POST",
        `/issues/${id.pr}/labels`,
        { labels: [`ai-cr:${envelope.review.verdict === "pass" ? "passed" : "failed"}`] },
        { retry: true },
      );
    }
    await guard();
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
  } catch {
    const moved = await freshness(client, id);
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
        const existing = await ownedComment(client, id);
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
        : "PUBLICATION_FAILED: no successful review was published.",
    );
    return { conclusion: moved ? "cancelled" : "failure" };
  }
}
