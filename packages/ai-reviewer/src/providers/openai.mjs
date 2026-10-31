import { Buffer } from "node:buffer";
import { setTimeout, clearTimeout } from "node:timers";
import { LIMITS } from "../config.mjs";
import { reviewSchema, parseReview } from "../contracts/validate.mjs";
import { tools, assertTextOnlyOutput } from "../tools/policy.mjs";

export async function requestReview({
  apiKey,
  model,
  prompt,
  input,
  fetchImpl = fetch,
  deadlineMs = LIMITS.deadlineMs,
}) {
  if (!apiKey?.trim() || !model?.trim()) throw new Error("CONFIG_REQUIRED");
  const controller = new globalThis.AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("DEADLINE_EXCEEDED"));
    }, deadlineMs);
  });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        let response;
        try {
          response = await fetchImpl("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              store: false,
              tools,
              max_output_tokens: LIMITS.outputTokens,
              input: [
                { role: "system", content: `${prompt.system}\n\n${prompt.criteria}` },
                { role: "user", content: input },
              ],
              text: { format: { type: "json_schema", name: "code_review", strict: true, schema: reviewSchema } },
            }),
          });
        } catch {
          throw new Error("TRANSPORT_FAILED");
        }
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        let value;
        try {
          value = await response.json();
        } catch {
          throw new Error("INVALID_RESPONSE");
        }
        if (value.status !== "completed") throw new Error("INCOMPLETE_RESPONSE");
        assertTextOnlyOutput(value.output);
        const text = value.output
          .filter((item) => item.type === "message")
          .flatMap((item) => item.content.map((content) => content.text))
          .join("");
        if (!text || Buffer.byteLength(text, "utf8") > LIMITS.outputBytes) throw new Error("OUTPUT_SIZE");
        const review = parseReview(text);
        const usage = value.usage
          ? {
              inputTokens: value.usage.input_tokens,
              outputTokens: value.usage.output_tokens,
              totalTokens: value.usage.total_tokens,
            }
          : null;
        return {
          review,
          requestId: typeof value.id === "string" && /^resp_[A-Za-z0-9_-]+$/.test(value.id) ? value.id : null,
          usage,
        };
      })(),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
