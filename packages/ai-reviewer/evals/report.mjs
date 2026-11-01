import { writeFile } from "node:fs/promises";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const ratio = (a, b) => (b ? a / b : null);

export function costFor(model, usage, pricing) {
  if (!usage || !Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens)) return null;
  const rate = pricing.models[model];
  return rate
    ? (usage.inputTokens * rate.inputPerMillion + usage.outputTokens * rate.outputPerMillion) / 1_000_000
    : null;
}

const confusionFor = (rows) => {
  const completed = rows.filter(
    (row) => row.review && (row.review.verdict === "pass" || row.review.verdict === "fail"),
  );
  const positives = (row) => row.review.verdict === "fail";
  const expectedPositive = (row) => row.expectedVerdict === "fail";
  const tp = completed.filter((row) => expectedPositive(row) && positives(row)).length;
  const tn = completed.filter((row) => !expectedPositive(row) && !positives(row)).length;
  const fp = completed.filter((row) => !expectedPositive(row) && positives(row)).length;
  const fn = completed.filter((row) => expectedPositive(row) && !positives(row)).length;
  return {
    tp,
    tn,
    fp,
    fn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    falseRejectionRate: ratio(fp, fp + tn),
    falseAcceptanceRate: ratio(fn, fn + tp),
    denominators: { precision: tp + fp, recall: tp + fn, falseRejectionRate: fp + tn, falseAcceptanceRate: fn + tp },
    contractValidCompleted: completed.length,
    positiveClass: "review verdict fail / accepted defect",
    falsePositiveDefinition: "review verdict fail on an accepted safe fixture",
  };
};

export function buildReport({
  matrix,
  planned,
  promptDigest,
  approval,
  evaluationElapsedMs = null,
  runType = "inference",
  identity = {},
  startedAt = null,
  completedAt = null,
  reservedAllowanceUsd = null,
}) {
  const completed = matrix.filter((row) => row.review);
  const rows = matrix.map((row) => ({
    ...row,
    humanAudit:
      row.review && runType !== "offline-fake-execution"
        ? (row.humanAudit ?? {
            status: "pending",
            reviewer: null,
            reviewedAt: null,
            unsupportedAllegations: null,
            notes: null,
          })
        : null,
  }));
  const total = {
    planned,
    completed: completed.length,
    passed: matrix.filter((row) => row.status === "pass").length,
    failed: matrix.filter((row) => row.status === "fail").length,
    errors: matrix.filter((row) => row.status === "error").length,
    operationalErrors: matrix.filter((row) => row.status === "error").length,
    notRun: matrix.filter((row) => row.status === "not-run").length,
    requestAttempts: rows.filter((row) => row.requestAttempted === true).length,
    requestsNotAttempted: planned - rows.filter((row) => row.requestAttempted === true).length,
  };
  const latency = Object.fromEntries(
    approval.models.map((model) => {
      const values = rows
        .filter((row) => row.model === model && Number.isFinite(row.reviewerDurationMs))
        .map((row) => row.reviewerDurationMs)
        .sort((a, b) => a - b);
      const pct = (f) => (values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * f) - 1)] : null);
      return [model, { sampleSize: values.length, medianMs: pct(0.5), p95Ms: pct(0.95) }];
    }),
  );
  const perModel = Object.fromEntries(
    approval.models.map((model) => {
      const modelRows = rows.filter((row) => row.model === model);
      const caseGroups = new Map();
      for (const row of modelRows) {
        const group = caseGroups.get(row.caseId) ?? {
          caseId: row.caseId,
          fixtureClass: row.fixtureClass ?? (row.expectedVerdict === "fail" ? "accepted-defect" : "accepted-safe"),
          expectedVerdict: row.expectedVerdict ?? null,
          plannedRepetitions: approval.repetitions ?? 3,
          responseTrials: 0,
          validVerdicts: 0,
          verdictErrors: 0,
          assertionFailures: 0,
          operationalErrors: 0,
          notRun: 0,
          knownDefectHits: 0,
          textAssertionOnlyMisses: 0,
        };
        if (row.review) {
          group.responseTrials++;
          group.validVerdicts++;
          const correct = row.review.verdict === row.expectedVerdict;
          if (!correct) group.verdictErrors++;
          if (row.status === "fail") group.assertionFailures++;
          if (row.expectedVerdict === "fail" && row.review.verdict === "fail") group.knownDefectHits++;
          if (correct && row.status === "fail") group.textAssertionOnlyMisses++;
        } else if (row.status === "error") group.operationalErrors++;
        else if (row.status === "not-run") group.notRun++;
        caseGroups.set(row.caseId, group);
      }
      const cases = [...caseGroups.values()];
      return [
        model,
        {
          confusion: confusionFor(modelRows),
          distinctCases: {
            planned: cases.length,
            withValidVerdict: cases.filter((item) => item.validVerdicts > 0).length,
            acceptedDefects: cases.filter((item) => item.fixtureClass === "accepted-defect").length,
            acceptedSafeCases: cases.filter((item) => item.fixtureClass === "accepted-safe").length,
            knownDefectCasesHit: cases.filter(
              (item) => item.fixtureClass === "accepted-defect" && item.knownDefectHits > 0,
            ).length,
            cases,
            repetitionCountsAreResponseTrials: true,
          },
          verdictErrors: modelRows.filter((row) => row.review && row.review.verdict !== row.expectedVerdict).length,
          textAssertionOnlyMisses: modelRows.filter(
            (row) => row.review && row.review.verdict === row.expectedVerdict && row.status === "fail",
          ).length,
          operationalErrors: modelRows.filter((row) => row.status === "error").length,
        },
      ];
    }),
  );
  const reviewedSummaries = rows.filter((row) => row.humanAudit?.status === "reviewed");
  const humanReview =
    runType === "offline-fake-execution"
      ? {
          status: "not-applicable",
          reviewedSummaries: 0,
          summariesToReview: 0,
          unsupportedAllegations: null,
          note: "Synthetic outputs are only for offline matrix verification.",
        }
      : {
          status: reviewedSummaries.length === completed.length ? "complete" : "pending",
          reviewedSummaries: reviewedSummaries.length,
          summariesToReview: Math.max(0, completed.length - reviewedSummaries.length),
          unsupportedAllegationsComplete: reviewedSummaries.length === completed.length,
          unsupportedAllegationResponses:
            reviewedSummaries.length === completed.length
              ? reviewedSummaries.filter(
                  (row) =>
                    Array.isArray(row.humanAudit.unsupportedAllegations) &&
                    row.humanAudit.unsupportedAllegations.length > 0,
                ).length
              : null,
          unsupportedAllegations:
            reviewedSummaries.length === completed.length
              ? reviewedSummaries.reduce(
                  (sum, row) =>
                    sum +
                    (Array.isArray(row.humanAudit.unsupportedAllegations)
                      ? row.humanAudit.unsupportedAllegations.length
                      : 0),
                  0,
                )
              : null,
          note: "Every completed summary requires human review against its accepted oracle; deterministic anchors are filters, not semantic proof.",
        };
  return {
    version: 2,
    runType,
    manifest: {
      promptDigest,
      approvalId: approval.approvalId,
      mode: approval.mode,
      planned,
      models: approval.models,
      caseIds: approval.caseIds,
      repetitions: approval.repetitions ?? 3,
      inferencePerformed: runType === "inference",
      trustedRunnerSha: identity.workflowSha ?? identity.runnerSha ?? null,
      runnerDigest: identity.runnerDigest ?? null,
      candidateHead: identity.head ?? null,
      candidateBase: identity.base ?? null,
      repository: identity.repository ?? null,
      pullRequest: identity.pr ?? null,
      runId: identity.runId ?? null,
      runAttempt: identity.runAttempt ?? null,
      checkId: identity.checkId ?? null,
      corpusDigest: identity.corpusDigest ?? null,
      schemaDigest: identity.schemaDigest ?? null,
      configurationDigest: identity.configurationDigest ?? null,
      pricingDigest: identity.pricingDigest ?? null,
      invocationId: approval.invocationId ?? null,
      issueAt: approval.issuedAt ?? null,
      expiryAt: approval.expiresAt ?? null,
      requestCount: approval.requestCount,
      maxInputTokens: approval.maxInputTokens ?? null,
      maxOutputTokens: approval.maxOutputTokens ?? null,
      maxPromptBytes: approval.maxPromptBytes ?? null,
    },
    timing: {
      totalEvaluationElapsedMs: Number.isFinite(evaluationElapsedMs) ? evaluationElapsedMs : null,
      startedAt,
      completedAt,
      scope:
        runType === "saved-matrix-replay"
          ? "Promptfoo assertion replay only; no model inference was performed"
          : "Promptfoo matrix execution only; excludes queue, dependency installation, and publication",
      reviewerDurationField: "reviewerDurationMs (production reviewer envelope)",
    },
    totals: total,
    confusion: confusionFor(rows),
    perModel,
    verdictErrors: rows.filter((row) => row.review && row.review.verdict !== row.expectedVerdict).length,
    textAssertionOnlyMisses: rows.filter(
      (row) => row.review && row.review.verdict === row.expectedVerdict && row.status === "fail",
    ).length,
    humanReview,
    cost: {
      estimatedUsd: runType === "inference" ? rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : 0,
      sourceHistoricalUsd:
        runType === "saved-matrix-replay"
          ? rows.reduce((sum, row) => sum + (row.sourceHistoricalCostUsd ?? 0), 0)
          : null,
      unknownUsage: rows.filter((row) => !row.usage).length,
      unknownAttemptedUsage: rows.filter((row) => row.requestAttempted === true && !row.usage).length,
      reservedAllowanceUsd,
      authorizedUsdLimit: runType === "inference" ? approval.usdLimit : null,
    },
    latency,
    matrix: rows,
  };
}

export function renderHtml(report) {
  const rows = report.matrix
    .map(
      (row) =>
        `<tr><td>${escape(row.caseId)}</td><td>${escape(row.model)}</td><td>${escape(row.repetition)}</td><td>${escape(row.status)}</td><td>${escape(row.requestAttempted === true ? "yes" : "no")}</td><td>${escape(row.requestId)}</td><td>${escape(row.review?.verdict)}</td><td>${escape(row.review?.summary)}</td><td>${escape(JSON.stringify(row.humanAudit ?? null))}</td><td>${escape(row.error)}</td><td>${escape(JSON.stringify(row.diagnostics ?? null))}</td></tr>`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>Reviewer evaluation</title><h1>Reviewer evaluation</h1><p>Prompt digest: ${escape(report.manifest.promptDigest)}</p><p>Run type: ${escape(report.runType)}; total evaluation elapsed: ${escape(report.timing.totalEvaluationElapsedMs)} ms.</p><p>Human summary audit: ${escape(report.humanReview.status)} (${escape(report.humanReview.reviewedSummaries)}/${escape(report.humanReview.reviewedSummaries + report.humanReview.summariesToReview)} reviewed; ${escape(report.humanReview.summariesToReview)} pending).</p><p>${escape(JSON.stringify(report.totals))}</p><table><thead><tr><th>Case</th><th>Model</th><th>Run</th><th>Evaluation</th><th>Request attempted</th><th>Provider request ID</th><th>Verdict</th><th>Summary</th><th>Human audit</th><th>Error</th><th>Diagnostics</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderSummary(report) {
  const costSummary =
    report.runType === "saved-matrix-replay"
      ? `No inference cost incurred during replay; saved responses reported $${report.cost.sourceHistoricalUsd.toFixed(6)} historically.`
      : report.runType === "offline-fake-execution"
        ? "Synthetic offline execution made no model requests and incurred no inference cost."
        : `Estimated uncached cost: $${report.cost.estimatedUsd.toFixed(6)}; conservative reserved allowance: ${report.cost.reservedAllowanceUsd == null ? "unknown" : `$${report.cost.reservedAllowanceUsd.toFixed(6)}`} of $${report.cost.authorizedUsdLimit.toFixed(2)}.`;
  return `## Reviewer evaluation\n\n${report.totals.passed}/${report.totals.planned} passed; ${report.totals.failed} failed assertions; ${report.totals.operationalErrors} operational errors; ${report.totals.requestAttempts} requests attempted; ${report.totals.requestsNotAttempted} requests not attempted; ${report.totals.notRun} cells not run. Total evaluation elapsed: ${report.timing.totalEvaluationElapsedMs ?? "unknown"} ms. ${costSummary} Unknown usage for ${report.cost.unknownAttemptedUsage} attempted requests. Prompt digest: \`${report.manifest.promptDigest}\`.\n\nHuman summary audit: ${report.humanReview.status}; ${report.humanReview.reviewedSummaries} reviewed and ${report.humanReview.summariesToReview} remain pending. Unsupported allegations are human-scored separately from verdict errors and anchor misses. Deterministic anchors are filters, not semantic proof. Per-model confusion matrices and case-level denominators are in the JSON report. Repetitions are response trials, not independent fixtures.\n`;
}

export async function writeReport(directory, report, { prefix = "" } = {}) {
  await Promise.all([
    writeFile(`${directory}/${prefix}report.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
    writeFile(`${directory}/${prefix}report.html`, renderHtml(report), { mode: 0o600 }),
    writeFile(`${directory}/${prefix}summary.md`, renderSummary(report), { mode: 0o600 }),
  ]);
}
