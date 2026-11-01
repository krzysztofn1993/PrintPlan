import { parseReview, validateReview } from "../src/contracts/validate.mjs";

const findingAnchors = Object.freeze({
  "case-02": Object.freeze([
    /getAvailableGrams|spool-availability/i,
    /recordedGrams\s*\+\s*reservedGrams|adds?\s+(?:the\s+)?(?:recorded|reserved)|adds?\b.{0,35}reserv(?:ed|ation)|addition|summ?\s+(?:instead|rather)|reservations?\s+(?:now\s+)?increase\s+(?:available|remaining)|(?:instead of|rather than)\s+subtract/i,
    /overstat(?:e|es|ed|ing)|over-reserv|exceed(?:s|ing)? (?:even )?(?:the )?(?:recorded|available|stock)|inflated|too much|more available|(?:increase|inflate|overstat).{0,45}(?:available|stock)|(?:available|stock).{0,45}(?:increase|inflate|higher|overstat)|counts? reserved.{0,30}(?:as|toward) available|reserved (?:material|grams|stock).{0,40}(?:available|free)|reserved stock.{0,35}(?:counted|treated).{0,30}available/i,
  ]),
  "case-03": Object.freeze([
    /reservation-capacity|resizeReservation|capacity/i,
    /own(?:[- ]|\s+)?(?:reservation|hold)|current hold|double.?count/i,
    /release.{0,40}(?:valid|current|own|reservation)|(?:reservation|current hold).{0,40}(?:released|cancelled|dropped)|valid.{0,30}(?:edit|request|reservation).{0,30}(?:release|cancel|reject|fail)|(?:release|cancel|reject|fail).{0,30}valid.{0,30}(?:edit|request|reservation)|(?:request|requested|edit).{0,45}(?:does not fit|no longer fits|exceeds?.{0,20}(?:capacity|available)|is rejected|is released)|release.{0,120}(?:fit|fits|retain|keeping|retaining|existing|current)|(?:return|returns).{0,45}(?:old|existing|current).{0,15}(?:hold|reservation)|(?:old|existing|current).{0,15}(?:hold|reservation).{0,40}(?:instead|rather than|not the requested)|(?:retain|keep|resize|preserve).{0,45}(?:requested|edited|reservation).{0,45}(?:instead|rather|not)|(?:instead|rather than|not).{0,40}(?:retain|keep|resize|preserve).{0,30}(?:requested|edited|reservation)/i,
  ]),
  "case-04": Object.freeze([
    /remainingStock|settlement-stock/i,
    /clamp|negative|below zero|without.{0,20}zero/i,
    /-30|negative|0\s*g|zero/i,
  ]),
  "case-05": Object.freeze([
    /settle|settlement-replay/i,
    /idempot|replay.{0,50}(?:receipt|request)|(?:existing|saved|previous|prior) receipt.{0,50}(?:return|replay|reuse|early)|(?:return|replay|reuse).{0,50}(?:existing|saved|previous|prior) receipt|early return.{0,50}(?:receipt|state\.receipts)|lookup.{0,50}state\.receipts/i,
    /deduct(?:s|ed|ing)?\b.{0,50}(?:again|twice)|subtract(?:s|ed|ing)?\b.{0,50}(?:again|twice)|(?:second|duplicate) (?:deduction|consumption|charge)|(?:consumption|stock|estimate|recorded).{0,50}(?:again|twice|unchanged|same)|(?:again|twice).{0,50}(?:deduct|subtract|consume)|(?:remain|stay|left).{0,25}(?:unchanged|same)|replayed\s*:\s*false|replace(?:s|d)?\s+(?:the\s+)?(?:saved|existing|previous|original)\s+receipt|(?:every|each) call.{0,80}(?:deduct|subtract|consume|apply)|(?:same|repeated|retried) request.{0,70}(?:deduct|subtract|consume|apply)/i,
  ]),
  "case-06": Object.freeze([
    /cancelUntilFits|reservation-priority/i,
    /newest|oldest|createdAt|order/i,
    /cancel|reservation|60\s*g|50\s*g/i,
  ]),
  "case-07": Object.freeze([
    /cookieOptions/i,
    /secure|https/i,
    /sent over unencrypted|http request|plain[- ]text|insecure transport|without tls/i,
  ]),
  "case-09": Object.freeze([
    /retryListRefresh|refreshList|conflictId|try again/i,
    /bypass|skip|omit|without.{0,30}(?:confirm|confirmation|consent)|(?:no|missing|lacks?).{0,20}(?:confirm|confirmation)|(?:confirm|confirmation).{0,30}(?:bypass|skip|missing|absent)/i,
    /unsaved|unsubmitted|pending.{0,20}(?:edit|input)|(?:edit|input|form).{0,40}(?:lost|discard|overwrit|replac|reset)|(?:lost|discard|overwrit|replac|reset).{0,40}(?:edit|input|form)/i,
  ]),
  "case-11": Object.freeze([
    /DIFF_LIMIT|DIFF_ARGS|diff/i,
    /truncat|limit|rename/i,
    /truncat.{0,40}(?:large|patch|diff|file)|(?:large|patch|diff).{0,40}truncat|move.{0,40}(?:delete|add|miss|obscur)|(?:delete|add).{0,40}move/i,
  ]),
  "case-13": Object.freeze([
    /acceptsReservation|marginPercent|reservation/i,
    /margin|round|ceil|calculation/i,
    /100\s*(?:g|grams)?.{0,30}110|110\s*(?:g|grams)?|under.?reserv|incorrect.{0,30}amount/i,
  ]),
  "case-15": Object.freeze([
    /recoveryMessage|recovery|message/i,
    /conflict|version|retry|original/i,
    /(?:incorrectly|falsely|still|claims?|says?).{0,30}reject|reject.{0,40}(?:even|although|despite|may)|duplicat.{0,30}(?:write|action|request)|(?:write|action|request).{0,30}duplicat/i,
  ]),
  "case-17": Object.freeze([
    /actions|settlement|receipt/i,
    /deleted|printExists|source|saved/i,
    /(?:no|without|loses?|removes?|disappears?).{0,40}(?:review|receipt|access)|(?:review|receipt|access).{0,40}(?:unavailable|lost|disappear|removed)|cannot.{0,30}(?:review|reopen|access)/i,
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
