import { reviewChange } from "../src/core/review.mjs";
import { assertCase } from "./assertions.mjs";
import { reserveCall, validEvalContext } from "./policy.mjs";

export class ReviewEvalProvider {
  constructor(options = {}) {
    this.model = options.model;
    this.approval = options.approval;
    this.expected = options.expected;
    this.promptDigest = options.promptDigest;
    this.fetchImpl = options.fetchImpl;
    this.used = options.used ?? (() => 0);
    this.usdReserved = options.usdReserved ?? (() => 0);
    this.review = options.review ?? reviewChange;
  }
  id() {
    return `trusted-review:${this.model}`;
  }
  async callApi(prompt, context = {}) {
    const caseId = context.vars?.caseId;
    reserveCall({
      approval: this.approval,
      expected: this.expected,
      model: this.model,
      caseId,
      promptDigest: this.promptDigest,
      used: this.used(),
      usdReserved: this.usdReserved(),
    });
    const input = context.vars?.input;
    const started = Date.now();
    const envelope = await this.review({
      context: validEvalContext(),
      input,
      apiKey: process.env.OPENAI_API_KEY,
      model: this.model,
      fetchImpl: this.fetchImpl,
    });
    const metadata = {
      caseId,
      promptDigest: this.promptDigest,
      requestId: envelope.requestId,
      model: this.model,
      reviewerDurationMs: envelope.timing
        ? Date.parse(envelope.timing.completedAt) - Date.parse(envelope.timing.startedAt)
        : null,
      providerLatencyMs: Date.now() - started,
    };
    if (envelope.status !== "completed")
      return { error: envelope.error.message, tokenUsage: usage(envelope.usage), metadata };
    const result = assertCase(caseId, envelope.review, context.vars.oracle);
    return {
      output: JSON.stringify(envelope.review),
      tokenUsage: usage(envelope.usage),
      metadata: { ...metadata, evalPassed: result.passed },
    };
  }
}

function usage(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.inputTokens) ||
    !Number.isSafeInteger(value.outputTokens) ||
    !Number.isSafeInteger(value.totalTokens)
  )
    return undefined;
  return { prompt: value.inputTokens, completion: value.outputTokens, total: value.totalTokens };
}
