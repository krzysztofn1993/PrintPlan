import { parseReview, validateReview } from "../src/contracts/validate.mjs";

const findingAnchors = Object.freeze({
  "case-02": Object.freeze([
    /getAvailableGrams|spool-availability/i,
    /adds?\s+(?:the\s+)?(?:recorded|reserved)|addition|adds?\s+the\s+reserved|summ?\s+(?:instead|rather)/i,
    /238|inflated|overstat(?:e|es|ed)|too much|over-reserv/i,
  ]),
  "case-03": Object.freeze([
    /reservation-capacity|resizeReservation|capacity/i,
    /own(?:[- ]|\s+)?(?:reservation|hold)|current hold|double.?count/i,
    /release|3\s*g|91\s*g|84\s*g/i,
  ]),
});

export function evaluateCase(caseId, response, oracle) {
  if (!oracle || !["pass", "fail"].includes(oracle.expectedVerdict)) throw new Error("INVALID_ORACLE");
  const review = typeof response === "string" ? parseReview(response) : validateReview(response);
  const summary = review.summary;
  const patterns = findingAnchors[caseId] ?? [];
  const anchors = patterns.map((pattern) => pattern.test(summary));
  return {
    schemaValid: true,
    verdictMatches: review.verdict === oracle.expectedVerdict,
    findingAnchors: anchors,
    findingComplete: patterns.length === 0 || anchors.every(Boolean),
    passed: review.verdict === oracle.expectedVerdict && (patterns.length === 0 || anchors.every(Boolean)),
  };
}

export function assertCase(caseId, response, oracle) {
  const result = evaluateCase(caseId, response, oracle);
  if (!result.passed) throw new Error("EVAL_ASSERTION_FAILED");
  return result;
}
