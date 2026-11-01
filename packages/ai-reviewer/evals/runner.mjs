import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadPrompt } from "../src/prompts/load.mjs";
import { reviewChange } from "../src/core/review.mjs";
import { evaluateCase } from "./assertions.mjs";
import { digest, reserveCall, validEvalContext } from "./policy.mjs";
import { buildReport, writeReport } from "./report.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cases = ["case-01", "case-02", "case-03"];
export async function runEvaluation({
  approval,
  mode,
  expected,
  fetchImpl,
  reviewer = reviewChange,
  models,
  promptContents,
  maxCalls = 27,
}) {
  const prompt = promptContents ?? (await loadPrompt());
  const promptDigest = digest(JSON.stringify([prompt.system, prompt.criteria]));
  const matrix = [];
  let reservedUsd = 0;
  let calls = 0;
  const modelList = models ?? approval.models;
  if (approval.mode !== mode) throw new Error("APPROVAL_MISMATCH");
  const planned = cases.length * modelList.length * 3;
  if (planned > maxCalls || planned !== approval.requestCount) throw new Error("REQUEST_LIMIT");
  evaluation: for (const model of modelList)
    for (const caseId of cases) {
      const dir = resolve(root, "cases", caseId);
      const input = JSON.parse(await readFile(resolve(dir, "input.json"), "utf8"));
      const oracle = JSON.parse(await readFile(resolve(dir, "oracle.json"), "utf8"));
      for (let repetition = 1; repetition <= 3; repetition++) {
        let row = {
          model,
          caseId,
          repetition,
          status: "not-run",
          promptDigest,
          expectedVerdict: oracle.expectedVerdict,
        };
        try {
          const pricing = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
          reserveCall({
            approval,
            expected: { ...expected, pricing },
            model,
            caseId,
            promptDigest,
            used: calls,
            usdReserved: reservedUsd,
          });
          calls++;
          const envelope = await reviewer({
            context: validEvalContext(),
            input,
            apiKey: process.env.OPENAI_API_KEY,
            model,
            fetchImpl,
          });
          const u = envelope.usage;
          if (envelope.status !== "completed")
            throw Object.assign(new Error(envelope.error?.code ?? "REVIEW_FAILED"), { usage: u });
          if (
            !u ||
            !Number.isSafeInteger(u.inputTokens) ||
            !Number.isSafeInteger(u.outputTokens) ||
            !Number.isSafeInteger(u.totalTokens)
          )
            throw new Error("UNKNOWN_USAGE");
          const prices = pricing.models[model];
          if (!prices) throw new Error("UNKNOWN_RATE");
          const cost = (u.inputTokens * prices.inputPerMillion + u.outputTokens * prices.outputPerMillion) / 1e6;
          if (!Number.isFinite(cost) || reservedUsd + cost > approval.usdLimit) throw new Error("BUDGET_LIMIT");
          reservedUsd += cost;
          const assertion = evaluateCase(caseId, envelope.review, oracle);
          row = {
            ...row,
            status: assertion.passed ? "pass" : "fail",
            review: envelope.review,
            assertion,
            usage: u,
            costUsd: cost,
            requestId: envelope.requestId,
            reviewerDurationMs: envelope.timing
              ? Date.parse(envelope.timing.completedAt) - Date.parse(envelope.timing.startedAt)
              : null,
          };
        } catch (error) {
          row = {
            ...row,
            status: "error",
            error: /^[A-Z0-9_]+$/.test(error.message) ? error.message : "REVIEW_FAILED",
            usage: error.usage ?? null,
          };
        }
        matrix.push(row);
        if (row.status === "error") {
          for (const restModel of modelList)
            for (const restCase of cases)
              for (let rep = 1; rep <= 3; rep++)
                if (
                  !matrix.some(
                    (item) => item.model === restModel && item.caseId === restCase && item.repetition === rep,
                  )
                )
                  matrix.push({ model: restModel, caseId: restCase, repetition: rep, status: "not-run", promptDigest });
          break evaluation;
        }
      }
    }
  const report = buildReport({ matrix, planned, promptDigest, approval });
  return report;
}

export async function cli(args = process.argv.slice(2)) {
  const command = args[0];
  if (command === "preflight") {
    const prompt = await loadPrompt();
    const pricing = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
    return {
      status: "no-key-preflight",
      promptDigest: prompt.digest,
      cases: cases.length,
      repetitions: 3,
      defaultPolicyEnabled: false,
      pricingDate: pricing.asOf,
    };
  }
  if (!["compare", "gate"].includes(command)) throw new Error("USAGE: runner.mjs preflight|compare|gate");
  if (!process.env.EVAL_APPROVAL_FILE) throw new Error("APPROVAL_REQUIRED");
  const approval = JSON.parse(await readFile(process.env.EVAL_APPROVAL_FILE, "utf8"));
  const policy = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
  const corpusInputs = await Promise.all(cases.map((id) => readFile(resolve(root, "cases", id, "input.json"))));
  const expected = {
    runnerDigest: digest(await readFile(fileURLToPath(import.meta.url))),
    corpusDigest: digest(corpusInputs.map((item) => item.toString("utf8"))),
    schemaDigest: digest(await readFile(resolve(root, "../src/contracts/review.schema.json"))),
    pricingDigest: digest(policy),
    pricing: policy,
  };
  const report = await runEvaluation({ approval, mode: command, expected });
  await mkdir(resolve(root, "reports"), { recursive: true });
  await writeReport(resolve(root, "reports"), report);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  cli()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
