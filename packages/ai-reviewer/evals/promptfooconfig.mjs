import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { URL } from "node:url";
import { createDeterministicAssertion } from "./provider.mjs";

const runtimePath = process.env.EVAL_RUNTIME_FILE;
if (!runtimePath) throw new Error("TRUSTED_RUN_CONTEXT_REQUIRED");
const runtime = JSON.parse(await readFile(resolve(runtimePath), "utf8"));
runtime.replayRows = Object.fromEntries(
  (runtime.replayMatrix ?? []).map((row) => [`${row.model}\n${row.caseId}\n${row.repetition}`, row]),
);
const tests = await Promise.all(
  runtime.approval.caseIds.map(async (caseId) => {
    const base = new URL(`./cases/${caseId}/`, import.meta.url);
    const [input, oracle] = await Promise.all(
      ["input.json", "oracle.json"].map((name) => readFile(new URL(name, base), "utf8").then(JSON.parse)),
    );
    return {
      vars: { caseId, input, oracle },
      assert: [{ type: "javascript", value: createDeterministicAssertion() }],
    };
  }),
);

export default {
  description: "Trusted PrintPlan reviewer matrix with deterministic local assertions",
  providers: runtime.approval.models.map((model) => ({
    "file://./provider.mjs": {
      id: `trusted-review:${model}`,
      config: { model, runtime },
    },
  })),
  tests,
  prompts: ["Evaluate this synthetic code-review fixture using the trusted production review contract."],
  evaluateOptions: { maxConcurrency: 1, repeat: 3, cache: false },
  sharing: false,
  outputPath: process.env.EVAL_PROMPTFOO_OUTPUT ?? "./reports/promptfoo.json",
};
