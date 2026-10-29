export const review = {
  implementationCorrectness: 8,
  idiomaticity: 7,
  complexity: 9,
  testRiskCoverage: 6,
  documentation: 8,
  securitySafety: 9,
  verdict: "pass",
  summary: "Static review only; tests were not executed.",
};
export const context = {
  repository: "owner/PrintPlan",
  pr: 1,
  head: "a".repeat(40),
  base: "b".repeat(40),
  mergeBase: "c".repeat(40),
  runId: "123",
  runAttempt: 1,
};
export function envelope() {
  return {
    version: 1,
    context: { ...context },
    model: "explicit-test-model",
    requestId: null,
    prompt: { id: "code-review", digest: "d".repeat(64) },
    timing: null,
    usage: null,
    status: "completed",
    review: { ...review },
    error: null,
  };
}
