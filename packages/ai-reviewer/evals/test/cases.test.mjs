import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { assembleInput } from "../../src/core/review.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../cases");
const oracleTerms = /expectedVerdict|mechanism|trigger|incorrectBehavior|unacceptableAllegations|238|91 g|88 g/i;

test("the frozen corpus has exactly three reviewable, path-consistent cases", async () => {
  const ids = (await readdir(root)).sort();
  assert.deepEqual(ids, ["case-01", "case-02", "case-03"]);
  for (const id of ids) {
    const dir = join(root, id);
    const input = JSON.parse(await readFile(join(dir, "input.json"), "utf8"));
    const oracle = JSON.parse(await readFile(join(dir, "oracle.json"), "utf8"));
    const [before, after, patch] = await Promise.all(
      ["before.mjs", "after.mjs", "diff.patch"].map((name) => readFile(join(dir, name), "utf8")),
    );
    assert.ok(before.trim() && after.trim() && input.diff.trim());
    assert.deepEqual(input.paths, [patch.match(/^diff --git a\/([^ ]+) b\/[^\n]+/m)?.[1]]);
    assert.equal(input.paths.length, 1);
    assert.deepEqual(input.unreviewedPaths, []);
    assert.equal((input.diff.match(/^@@ /gm) ?? []).length, 1);
    assert.match(input.diff, /^diff --git /m);
    assert.match(input.diff, /^--- a\//m);
    assert.match(input.diff, /^\+\+\+ b\//m);
    assert.ok(oracle.sourceRevision && oracle.expectedVerdict && oracle.changedLocation && oracle.mechanism);
    assert.ok(oracle.trigger && oracle.expectedBehavior && oracle.incorrectBehavior && oracle.reproduction);
    assert.ok(Array.isArray(oracle.unacceptableAllegations));
    const modelInput = assembleInput(input);
    assert.equal(Object.keys(JSON.parse(modelInput)).sort().join(","), "body,diff,paths,title,unreviewedPaths");
    assert.doesNotMatch(modelInput, oracleTerms);
  }
});

test("frozen before and after sources express the intended witnesses", async () => {
  for (const id of ["case-01", "case-02"]) {
    const base = join(root, id);
    const before = await import(`${base}/before.mjs`);
    const after = await import(`${base}/after.mjs`);
    assert.equal(before.getAvailableGrams({ recordedGrams: 150, reservedGrams: 88 }), 62);
    assert.equal(after.getAvailableGrams({ recordedGrams: 150, reservedGrams: 88 }), id === "case-01" ? 62 : 238);
  }
  const base = join(root, "case-03");
  const before = await import(`${base}/before.mjs`);
  const after = await import(`${base}/after.mjs`);
  const scenario = { recorded: 300, otherHolds: 209, ownHold: 88, requested: 84 };
  assert.deepEqual(before.resizeReservation(scenario), { status: "retained", grams: 84 });
  assert.deepEqual(after.resizeReservation(scenario), { status: "released", grams: 0 });
});
