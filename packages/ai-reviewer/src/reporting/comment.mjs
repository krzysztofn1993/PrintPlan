import schema from "../contracts/review.schema.json" with { type: "json" };
const scoreFields = Object.keys(schema.properties).filter((field) => !["verdict", "summary"].includes(field));
import { runUrl } from "../github/prepare.mjs";
export const MARKER = "<!-- printplan-ai-code-review:v1 -->";
export function provenance(id, checkId) {
  return `<!-- provenance:${id.repository}:${id.pr}:${checkId}:${id.runId}:${id.runAttempt} -->`;
}
export function renderComment({ id, checkId, envelope, error }) {
  const review = envelope?.status === "completed" ? envelope.review : null;
  return [
    MARKER,
    provenance(id, checkId),
    "## AI Code Review",
    `Head: \`${id.head}\` · Base: \`${id.base}\``,
    `[Run ${id.runId}, attempt ${id.runAttempt}](${runUrl(id)})`,
    `Operation: **${review ? "completed" : "error"}**`,
    ...(review
      ? [
          `Verdict: **${review.verdict}**`,
          "",
          "| Criterion | Score |",
          "| --- | --- |",
          ...scoreFields.map((field) => `| ${field} | ${review[field]} |`),
          "",
          review.summary,
        ]
      : [`${error ?? envelope?.error?.code ?? "REVIEW_UNAVAILABLE"}: No code verdict is available.`]),
    "",
    "Static text review only. Tests were not executed. Binary paths and context outside the supplied diff are not reviewed. A changed base requires updating the PR branch; synchronize automatically requests a new review.",
  ].join("\n");
}
