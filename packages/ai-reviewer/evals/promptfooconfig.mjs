import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import { ReviewEvalProvider } from "./provider.mjs";

const ids = ["case-01", "case-02", "case-03"];
const tests = await Promise.all(
  ids.map(async (caseId) => {
    const base = new URL(`./cases/${caseId}/`, import.meta.url);
    const [input, oracle] = await Promise.all(
      ["input.json", "oracle.json"].map((name) => readFile(new URL(name, base), "utf8").then(JSON.parse)),
    );
    return { vars: { caseId, input, oracle }, assert: [] };
  }),
);
const models = (process.env.EVAL_MODELS ?? "").split(",").filter(Boolean);
export default {
  description: "PrintPlan trusted static reviewer evaluation",
  providers: models.map((model) => new ReviewEvalProvider({ model })),
  tests,
  evaluateOptions: { maxConcurrency: 1, repeat: 3, cache: false },
  prompts: ["Evaluate the supplied synthetic case using the production reviewer prompt."],
  outputPath: "./reports/promptfoo.json",
};
