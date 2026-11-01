import { appendFile } from "node:fs/promises";
import { reviewChange } from "../src/core/review.mjs";
import { evaluateCase, assertCase } from "./assertions.mjs";
import { reserveCall, validEvalContext } from "./policy.mjs";

const runStates = new Map();

function sharedRunState(runtime) {
  const runKey = runtime.resultsFile ?? runtime.approval?.invocationId;
  if (typeof runKey !== "string" || runKey.length === 0) throw new Error("TRUSTED_RUN_IDENTITY_REQUIRED");
  let state = runStates.get(runKey);
  if (!state) {
    state = {
      repetitions: Object.create(null),
      calls: 0,
      actualCostUsd: 0,
      reservedUsd: 0,
      stopped: false,
      rows: [],
    };
    runStates.set(runKey, state);
  }
  return state;
}

export class ReviewEvalProvider {
  constructor(options = {}) {
    const config = options.config ?? options;
    this.model = config.model;
    this.runtime = config.runtime ? { ...config.runtime, state: sharedRunState(config.runtime) } : null;
    this.approval = config.approval ?? this.runtime?.approval;
    this.expected = config.expected ?? this.runtime?.expected;
    this.promptDigest = config.promptDigest ?? this.runtime?.promptDigest;
    this.fetchImpl = config.fetchImpl;
    this.used = config.used ?? (() => 0);
    this.usdReserved = config.usdReserved ?? (() => 0);
    this.review = config.review ?? reviewChange;
  }

  id() {
    return `trusted-review:${this.model}`;
  }

  async callApi(prompt, context = {}) {
    if (this.runtime) return this.callManaged(context);

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
    const envelope = await this.review({
      context: validEvalContext(),
      input: context.vars?.input,
      apiKey: process.env.OPENAI_API_KEY,
      model: this.model,
      fetchImpl: this.fetchImpl,
    });
    const metadata = {
      caseId,
      promptDigest: this.promptDigest,
      requestId: envelope.requestId,
      model: this.model,
      reviewerDurationMs: reviewerDuration(envelope),
    };
    if (envelope.status !== "completed")
      return {
        error: envelope.error?.message ?? "Review request failed.",
        tokenUsage: usage(envelope.usage),
        metadata,
      };
    const result = assertCase(caseId, envelope.review, context.vars.oracle);
    return {
      output: JSON.stringify(envelope.review),
      tokenUsage: usage(envelope.usage),
      metadata: { ...metadata, evalPassed: result.passed },
    };
  }

  async callManaged(context) {
    const runtime = this.runtime;
    const vars = context.vars ?? {};
    const caseId = vars.caseId;
    const input = vars.input;
    const oracle = vars.oracle;
    const cellKey = `${this.model}\n${caseId}`;
    const repetition = (runtime.state.repetitions[cellKey] ?? 0) + 1;
    runtime.state.repetitions[cellKey] = repetition;
    const base = {
      model: this.model,
      caseId,
      repetition,
      expectedVerdict: oracle?.expectedVerdict,
      fixtureClass: oracle?.expectedVerdict === "fail" ? "accepted-defect" : "accepted-safe",
      promptDigest: runtime.promptDigest,
      requestAttempted: false,
      timing: null,
      diagnostics: null,
    };

    if (runtime.mode === "fake") {
      const review = runtime.fakeReview;
      const assertion = evaluateCase(caseId, review, oracle);
      const row = {
        ...base,
        status: assertion.passed ? "pass" : "fail",
        requestAttempted: false,
        review,
        assertion,
        usage: runtime.fakeUsage,
        costUsd: null,
        reviewerDurationMs: null,
      };
      await this.record(row);
      return {
        output: JSON.stringify(review),
        tokenUsage: usage(runtime.fakeUsage),
        metadata: { caseId, model: this.model, repetition, offlineFake: true, evalPassed: assertion.passed },
      };
    }

    if (runtime.mode === "replay") {
      const saved = runtime.replayRows[`${this.model}\n${caseId}\n${repetition}`];
      if (!saved || saved.expectedVerdict !== oracle?.expectedVerdict) throw new Error("REPLAY_MATRIX_MISMATCH");
      const assertion = evaluateCase(caseId, saved.review, oracle);
      const row = {
        ...base,
        status: assertion.passed ? "pass" : "fail",
        review: saved.review,
        assertion,
        usage: saved.usage ?? null,
        costUsd: null,
        sourceHistoricalCostUsd: saved.costUsd ?? null,
        sourceRequestId: saved.requestId ?? null,
        requestId: saved.requestId ?? null,
        reviewerDurationMs: saved.reviewerDurationMs ?? null,
      };
      await this.record(row);
      return {
        output: JSON.stringify(saved.review),
        tokenUsage: usage(saved.usage),
        metadata: { caseId, model: this.model, repetition, replay: true, evalPassed: assertion.passed },
      };
    }

    const state = runtime.state;
    if (state.stopped)
      return { error: "Evaluation stopped after an operational error.", metadata: { caseId, model: this.model } };
    let worstCaseUsd;
    try {
      const rate = runtime.expected.pricing?.models?.[this.model];
      if (!rate) throw new Error("UNKNOWN_RATE");
      worstCaseUsd =
        (runtime.approval.maxInputTokens * rate.inputPerMillion +
          runtime.approval.maxOutputTokens * rate.outputPerMillion) /
        1_000_000;
      reserveCall({
        approval: runtime.approval,
        expected: runtime.expected,
        model: this.model,
        caseId,
        promptDigest: runtime.promptDigest,
        used: state.calls,
        usdReserved: state.actualCostUsd + state.reservedUsd,
      });
      state.calls++;
      state.reservedUsd += worstCaseUsd;
    } catch (error) {
      state.stopped = true;
      return this.operationalFailure(base, error.message);
    }

    let diagnostics = null;
    let envelope = null;
    let reservationHeld = true;
    let observedCostUsd = null;
    try {
      envelope = await this.review({
        context: validEvalContext(),
        input,
        apiKey: process.env.OPENAI_API_KEY,
        model: this.model,
        fetchImpl: runtime.fetchImpl,
        promptContents: runtime.promptContents,
        onDiagnostic: (value) => {
          diagnostics = value;
        },
      });
      if (envelope.status !== "completed") throw new Error(envelope.error?.code ?? "REVIEW_FAILED");
      const tokenUsage = envelope.usage;
      if (
        !tokenUsage ||
        !Number.isSafeInteger(tokenUsage.inputTokens) ||
        !Number.isSafeInteger(tokenUsage.outputTokens) ||
        !Number.isSafeInteger(tokenUsage.totalTokens)
      )
        throw new Error("UNKNOWN_USAGE");
      const rate = runtime.expected.pricing.models[this.model];
      const costUsd =
        (tokenUsage.inputTokens * rate.inputPerMillion + tokenUsage.outputTokens * rate.outputPerMillion) / 1_000_000;
      if (!Number.isFinite(costUsd)) throw new Error("UNKNOWN_COST");
      observedCostUsd = costUsd;
      state.reservedUsd -= worstCaseUsd;
      reservationHeld = false;
      state.actualCostUsd += costUsd;
      if (
        tokenUsage.inputTokens > runtime.approval.maxInputTokens ||
        tokenUsage.outputTokens > runtime.approval.maxOutputTokens
      )
        throw Object.assign(new Error("TOKEN_LIMIT_EXCEEDED"), { usage: tokenUsage, costUsd });
      if (state.actualCostUsd + state.reservedUsd > runtime.approval.usdLimit) throw new Error("BUDGET_LIMIT");
      const assertion = evaluateCase(caseId, envelope.review, oracle);
      const row = {
        ...base,
        status: assertion.passed ? "pass" : "fail",
        requestAttempted: diagnostics?.requestAttempted ?? true,
        review: envelope.review,
        assertion,
        usage: tokenUsage,
        costUsd,
        requestId: envelope.requestId,
        diagnostics,
        timing: envelope.timing,
        reviewerDurationMs: reviewerDuration(envelope),
      };
      await this.record(row);
      return {
        output: JSON.stringify(envelope.review),
        tokenUsage: usage(tokenUsage),
        metadata: {
          caseId,
          model: this.model,
          repetition,
          promptDigest: runtime.promptDigest,
          requestId: envelope.requestId,
          reviewerDurationMs: row.reviewerDurationMs,
          evalPassed: assertion.passed,
        },
      };
    } catch (error) {
      state.stopped = true;
      if (reservationHeld && Number.isFinite(worstCaseUsd) && state.reservedUsd >= worstCaseUsd)
        state.reservedUsd -= worstCaseUsd;
      const code = safeCode(error?.message);
      const usageValue = error?.usage ?? envelope?.usage ?? null;
      const row = {
        ...base,
        status: "error",
        error: code,
        requestAttempted: diagnostics?.requestAttempted ?? Boolean(envelope),
        usage: usageValue,
        costUsd: Number.isFinite(error?.costUsd) ? error.costUsd : observedCostUsd,
        requestId: envelope?.requestId ?? null,
        diagnostics,
        timing: envelope?.timing ?? null,
        reviewerDurationMs: reviewerDuration(envelope),
      };
      await this.record(row);
      return {
        error: `Evaluation stopped (${code}).`,
        tokenUsage: usage(usageValue),
        metadata: { caseId, model: this.model },
      };
    }
  }

  async operationalFailure(base, code) {
    const row = { ...base, status: "error", error: safeCode(code), requestAttempted: false };
    await this.record(row);
    return { error: `Evaluation stopped (${row.error}).`, metadata: { caseId: base.caseId, model: this.model } };
  }

  async record(row) {
    this.runtime.state.rows.push(row);
    await appendFile(this.runtime.resultsFile, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  }
}

export default ReviewEvalProvider;

export function createDeterministicAssertion() {
  return (output, context) => {
    try {
      const result = evaluateCase(context.vars.caseId, JSON.parse(output), context.vars.oracle);
      return { pass: result.passed, score: result.passed ? 1 : 0, reason: JSON.stringify(result) };
    } catch {
      return {
        pass: false,
        score: 0,
        reason: "The reviewer output did not satisfy the deterministic fixture assertions.",
      };
    }
  };
}

function safeCode(value) {
  return typeof value === "string" && value.length <= 64 && /^[A-Z0-9_]+$/.test(value) ? value : "REVIEW_FAILED";
}

function reviewerDuration(envelope) {
  return envelope?.timing ? Date.parse(envelope.timing.completedAt) - Date.parse(envelope.timing.startedAt) : null;
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
