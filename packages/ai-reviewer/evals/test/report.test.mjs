import assert from "node:assert/strict";
import test from "node:test";
import { buildReport, costFor, renderHtml, renderSummary } from "../report.mjs";

test("reports distinguish model verdict, evaluation outcome, unknown costs and safe HTML", () => {
  const approval = { approvalId: "a", mode: "comparison", models: ["m"], usdLimit: 1 };
  const matrix = [
    {
      model: "m",
      caseId: "case-01",
      repetition: 1,
      status: "pass",
      expectedVerdict: "pass",
      review: { verdict: "pass", summary: "<script>alert(1)</script>" },
      usage: { inputTokens: 10, outputTokens: 2 },
      costUsd: 0.1,
      reviewerDurationMs: 9,
    },
    {
      model: "m",
      caseId: "case-02",
      repetition: 1,
      status: "fail",
      expectedVerdict: "fail",
      review: { verdict: "pass", summary: "miss" },
      usage: null,
    },
    { model: "m", caseId: "case-03", repetition: 1, status: "error", error: "HTTP_429" },
    { model: "m", caseId: "case-01", repetition: 2, status: "not-run" },
  ];
  const report = buildReport({ matrix, planned: 4, promptDigest: "d".repeat(64), approval });
  assert.deepEqual(report.confusion, {
    tp: 0,
    tn: 1,
    fp: 0,
    fn: 1,
    precision: null,
    recall: 0,
    falseRejectionRate: 0,
    falseAcceptanceRate: 1,
    denominators: { precision: 0, recall: 1, falseRejectionRate: 1, falseAcceptanceRate: 1 },
    contractValidCompleted: 2,
    positiveClass: "review verdict fail / accepted defect",
    falsePositiveDefinition: "review verdict fail on an accepted safe fixture",
  });
  assert.equal(report.totals.errors, 1);
  assert.equal(report.totals.notRun, 1);
  assert.equal(report.cost.unknownUsage, 3);
  assert.equal(
    costFor("m", { inputTokens: 10, outputTokens: 2 }, { models: { m: { inputPerMillion: 1, outputPerMillion: 2 } } }),
    0.000014,
  );
  assert.match(renderHtml(report), /&lt;script&gt;/);
  assert.doesNotMatch(renderHtml(report), /<script>/);
  assert.match(renderSummary(report), /not run/);
});

test("summarizes production reviewer envelope timing separately from whole-run elapsed time", () => {
  const approval = { approvalId: "a", mode: "comparison", models: ["m"], usdLimit: 1 };
  const report = buildReport({
    matrix: [
      { model: "m", caseId: "case-01", repetition: 1, status: "pass", reviewerDurationMs: 40 },
      { model: "m", caseId: "case-02", repetition: 1, status: "error", reviewerDurationMs: 20 },
      { model: "m", caseId: "case-03", repetition: 1, status: "not-run", reviewerDurationMs: null },
    ],
    planned: 3,
    promptDigest: "d".repeat(64),
    approval,
  });
  assert.deepEqual(report.latency.m, { sampleSize: 2, medianMs: 20, p95Ms: 40 });
  assert.equal(report.timing.totalEvaluationElapsedMs, null);
});

test("reports per-model confusion, distinct fixture denominators, and text-only misses separately", () => {
  const approval = {
    approvalId: "a",
    mode: "comparison",
    models: ["m"],
    caseIds: ["case-01"],
    repetitions: 3,
    usdLimit: 1,
  };
  const report = buildReport({
    matrix: [
      {
        model: "m",
        caseId: "case-01",
        repetition: 1,
        expectedVerdict: "fail",
        status: "fail",
        review: { verdict: "fail" },
      },
      {
        model: "m",
        caseId: "case-01",
        repetition: 2,
        expectedVerdict: "fail",
        status: "fail",
        review: { verdict: "fail" },
      },
      {
        model: "m",
        caseId: "case-01",
        repetition: 3,
        expectedVerdict: "fail",
        status: "pass",
        review: { verdict: "pass" },
      },
    ],
    planned: 3,
    promptDigest: "d".repeat(64),
    approval,
    evaluationElapsedMs: 1234,
  });
  assert.equal(report.perModel.m.confusion.tp, 2);
  assert.equal(report.perModel.m.confusion.fn, 1);
  assert.equal(report.perModel.m.distinctCases.acceptedDefects, 1);
  assert.equal(report.perModel.m.distinctCases.knownDefectCasesHit, 1);
  assert.equal(report.perModel.m.distinctCases.cases[0].responseTrials, 3);
  assert.equal(report.perModel.m.verdictErrors, 1);
  assert.equal(report.perModel.m.textAssertionOnlyMisses, 2);
  assert.equal(report.humanReview.status, "pending");
  assert.equal(report.humanReview.unsupportedAllegations, null);
  assert.equal(report.timing.totalEvaluationElapsedMs, 1234);
});
