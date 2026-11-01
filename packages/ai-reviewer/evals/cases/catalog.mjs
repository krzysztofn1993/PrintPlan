export const DEVELOPMENT_CASE_IDS = Object.freeze(["case-01", "case-02", "case-03", "case-04", "case-05", "case-06"]);

export const HOLDOUT_CASE_IDS = Object.freeze([
  "case-07",
  "case-08",
  "case-09",
  "case-10",
  "case-11",
  "case-12",
  "case-13",
  "case-14",
  "case-15",
  "case-16",
  "case-17",
  "case-18",
]);

export const ALL_CASE_IDS = Object.freeze([...DEVELOPMENT_CASE_IDS, ...HOLDOUT_CASE_IDS]);

export function validCaseSet(caseIds) {
  return (
    Array.isArray(caseIds) &&
    caseIds.length > 0 &&
    new Set(caseIds).size === caseIds.length &&
    caseIds.every((id) => ALL_CASE_IDS.includes(id))
  );
}
