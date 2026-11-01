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

export function buildReport({ matrix, planned, promptDigest, approval }) {
  const completed = matrix.filter((row) => row.review);
  const positives = (row) => row.review?.verdict === "fail";
  const expectedPositive = (row) => row.expectedVerdict === "fail";
  const tp = completed.filter((row) => expectedPositive(row) && positives(row)).length;
  const tn = completed.filter((row) => !expectedPositive(row) && !positives(row)).length;
  const fp = completed.filter((row) => !expectedPositive(row) && positives(row)).length;
  const fn = completed.filter((row) => expectedPositive(row) && !positives(row)).length;
  const rows = matrix.map((row) => ({ ...row }));
  const total = {
    planned,
    completed: completed.length,
    passed: matrix.filter((row) => row.status === "pass").length,
    failed: matrix.filter((row) => row.status === "fail").length,
    errors: matrix.filter((row) => row.status === "error").length,
    notRun: matrix.filter((row) => row.status === "not-run").length,
  };
  const latency = Object.fromEntries(
    approval.models.map((model) => {
      const values = rows
        .filter((row) => row.model === model && Number.isFinite(row.providerLatencyMs))
        .map((row) => row.providerLatencyMs)
        .sort((a, b) => a - b);
      const pct = (f) => (values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * f) - 1)] : null);
      return [model, { sampleSize: values.length, medianMs: pct(0.5), p95Ms: pct(0.95) }];
    }),
  );
  return {
    version: 1,
    manifest: { promptDigest, approvalId: approval.approvalId, mode: approval.mode, planned, models: approval.models },
    totals: total,
    confusion: {
      tp,
      tn,
      fp,
      fn,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      falseRejectionRate: ratio(fp, fp + tn),
      falseAcceptanceRate: ratio(fn, fn + tp),
      denominators: { precision: tp + fp, recall: tp + fn, falseRejectionRate: fp + tn, falseAcceptanceRate: fn + tp },
    },
    cost: {
      estimatedUsd: rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
      unknownUsage: rows.filter((row) => !row.usage).length,
      authorizedUsdLimit: approval.usdLimit,
    },
    latency,
    matrix: rows,
  };
}

export function renderHtml(report) {
  const rows = report.matrix
    .map(
      (row) =>
        `<tr><td>${escape(row.caseId)}</td><td>${escape(row.model)}</td><td>${escape(row.repetition)}</td><td>${escape(row.status)}</td><td>${escape(row.review?.verdict)}</td><td>${escape(row.review?.summary)}</td><td>${escape(row.error)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>Reviewer evaluation</title><h1>Reviewer evaluation</h1><p>Prompt digest: ${escape(report.manifest.promptDigest)}</p><p>${escape(JSON.stringify(report.totals))}</p><table><thead><tr><th>Case</th><th>Model</th><th>Run</th><th>Evaluation</th><th>Verdict</th><th>Summary</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderSummary(report) {
  return `## Reviewer evaluation\n\n${report.totals.passed}/${report.totals.planned} passed; ${report.totals.errors} errors; ${report.totals.notRun} not run. Estimated uncached cost: $${report.cost.estimatedUsd.toFixed(6)} of $${report.cost.authorizedUsdLimit.toFixed(2)}. Prompt digest: \`${report.manifest.promptDigest}\`.\n`;
}

export async function writeReport(directory, report) {
  await Promise.all([
    writeFile(`${directory}/report.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
    writeFile(`${directory}/report.html`, renderHtml(report), { mode: 0o600 }),
    writeFile(`${directory}/summary.md`, renderSummary(report), { mode: 0o600 }),
  ]);
}
