import { readFile, mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadPrompt } from "../src/prompts/load.mjs";
import { reviewChange } from "../src/core/review.mjs";
import { evaluateCase } from "./assertions.mjs";
import { consumeComparisonApproval, digest, reserveCall, validEvalContext, validateApproval } from "./policy.mjs";
import { buildReport, writeReport } from "./report.mjs";
import { ALL_CASE_IDS, HOLDOUT_CASE_IDS } from "./cases/catalog.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export const runnerIdentityFiles = Object.freeze([
  "runner.mjs",
  "policy.mjs",
  "assertions.mjs",
  "report.mjs",
  "provider.mjs",
  "promptfooconfig.mjs",
  "package.json",
  "package-lock.json",
  "../package.json",
  "../package-lock.json",
  "cases/catalog.mjs",
  "approval.schema.json",
  "../src/config.mjs",
  "../src/core/review.mjs",
  "../src/providers/openai.mjs",
  "../src/prompts/load.mjs",
  "../src/tools/policy.mjs",
  "../src/contracts/validate.mjs",
  "../src/contracts/review.schema.json",
]);

export async function runnerDigest(baseDir = root) {
  const entries = await Promise.all(
    runnerIdentityFiles.map(async (path) => [path, await readFile(resolve(baseDir, path), "utf8")]),
  );
  return digest(entries);
}

async function runPromptfooMatrix({
  approval,
  expected,
  promptDigest,
  promptContents,
  mode = "inference",
  replayFixture,
  fakeReview,
  fakeUsage,
  identity = {},
}) {
  const reportDirectory = resolve(root, "reports");
  await mkdir(reportDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(resolve(reportDirectory, ".promptfoo-run-"));
  const runtimeFile = resolve(temporaryDirectory, "runtime.json");
  const resultsFile = resolve(temporaryDirectory, "matrix.jsonl");
  const promptfooOutput = resolve(temporaryDirectory, "promptfoo.json");
  const runtime = {
    mode,
    approval,
    expected,
    promptDigest,
    promptContents,
    resultsFile,
    ...(mode === "fake" ? { fakeReview, fakeUsage } : {}),
    ...(replayFixture ? { replayMatrix: replayFixture.matrix } : {}),
  };
  await writeFile(runtimeFile, `${JSON.stringify(runtime)}\n`, { mode: 0o600 });
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  let exitCode;
  let stdout = "";
  let stderr = "";
  try {
    exitCode = await new Promise((resolveExit, reject) => {
      const child = spawn(
        process.execPath,
        [
          resolve(root, "node_modules/promptfoo/dist/src/entrypoint.js"),
          "eval",
          "-c",
          resolve(root, "promptfooconfig.mjs"),
          "--max-concurrency",
          "1",
          "--repeat",
          "3",
          "--no-cache",
          "--no-progress-bar",
          "--no-share",
          "--no-write",
          "--output",
          promptfooOutput,
        ],
        {
          cwd: root,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            EVAL_RUNTIME_FILE: runtimeFile,
            EVAL_PROMPTFOO_OUTPUT: promptfooOutput,
            PROMPTFOO_DISABLE_TELEMETRY: "1",
            PROMPTFOO_DISABLE_UPDATE: "1",
            ...(mode === "replay" || mode === "fake" ? { OPENAI_API_KEY: undefined } : {}),
            ...(mode === "replay" || mode === "fake"
              ? { NODE_OPTIONS: `--import=${resolve(root, "../test/offline.mjs")}` }
              : {}),
          },
        },
      );
      child.once("error", (error) => reject(new Error("PROMPTFOO_SPAWN_FAILED", { cause: error })));
      // Keep a bounded diagnostic tail for failures. Promptfoo's normal output can
      // contain model text, so never include these buffers verbatim in reports/errors.
      const captureTail = (current, chunk) => `${current}${chunk.toString("utf8")}`.slice(-16_384);
      child.stdout?.on("data", (chunk) => {
        stdout = captureTail(stdout, chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr = captureTail(stderr, chunk);
      });
      child.once("close", (code) => resolveExit(Number.isInteger(code) ? code : 1));
    });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const serializedRows = await readFile(resultsFile, "utf8").catch(() => "");
  const recorded = serializedRows
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  let promptfooExport;
  try {
    promptfooExport = JSON.parse(await readFile(promptfooOutput, "utf8"));
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    const combinedOutput = `${stdout}\n${stderr}`;
    const category = /ConfigResolutionError|No promptfooconfig|TRUSTED_RUN_CONTEXT_REQUIRED/i.test(combinedOutput)
      ? "configuration"
      : /AssertionError|assertion failed|failed assertion/i.test(combinedOutput)
        ? "assertion"
        : /Unsupported output file format|output writes failed|EACCES|ENOENT/i.test(combinedOutput)
          ? "export"
          : /ProviderError|API_KEY_REQUIRED|REPLAY_MATRIX_MISMATCH|OFFLINE_TEST_NETWORK_FORBIDDEN/i.test(combinedOutput)
            ? "provider"
            : "unknown";
    const streamState = `stdout=${stdout.length > 0 ? "present" : "empty"},stderr=${stderr.length > 0 ? "present" : "empty"}`;
    throw new Error(`PROMPTFOO_REPORT_UNAVAILABLE (exit=${exitCode}; category=${category}; ${streamState})`, {
      cause: error,
    });
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
  const observed = new Map(recorded.map((row) => [`${row.model}\n${row.caseId}\n${row.repetition}`, row]));
  const matrix = [];
  for (const model of approval.models)
    for (const caseId of approval.caseIds) {
      const oracle = JSON.parse(await readFile(resolve(root, "cases", caseId, "oracle.json"), "utf8"));
      for (let repetition = 1; repetition <= (approval.repetitions ?? 3); repetition++) {
        const key = `${model}\n${caseId}\n${repetition}`;
        matrix.push(
          observed.get(key) ?? {
            model,
            caseId,
            repetition,
            expectedVerdict: oracle.expectedVerdict,
            fixtureClass: oracle.expectedVerdict === "fail" ? "accepted-defect" : "accepted-safe",
            status: "not-run",
            requestAttempted: false,
            promptDigest,
            timing: null,
            diagnostics: null,
          },
        );
      }
    }
  const promptfooResults = promptfooExport.results?.results;
  if (!Array.isArray(promptfooResults)) throw new Error("PROMPTFOO_REPORT_INVALID");
  for (const result of promptfooResults) {
    const metadata = result.response?.metadata ?? result.metadata ?? {};
    const caseId = metadata.caseId ?? result.testCase?.vars?.caseId ?? result.vars?.caseId;
    const providerId = result.provider?.id ?? "";
    const model = metadata.model ?? providerId.replace(/^trusted-review:/, "");
    const repetition =
      metadata.repetition ?? (Number.isSafeInteger(result.repeatIndex) ? result.repeatIndex + 1 : null);
    if (!caseId || !model || !Number.isSafeInteger(repetition)) continue;
    const row = observed.get(`${model}\n${caseId}\n${repetition}`);
    if (!row) continue;
    row.promptfoo = { success: result.success === true, failureReason: result.failureReason ?? null };
    if (result.failureReason === 2 || (result.response?.error && row.status !== "error")) row.status = "error";
    else row.status = result.success === true ? "pass" : "fail";
  }
  if (matrix.every((row) => row.status === "not-run"))
    throw new Error(`PROMPTFOO_FAILED_WITHOUT_RESULTS (exit=${exitCode})`);
  const completedAtIso = new Date().toISOString();
  const reservedAllowanceUsd =
    Number.isSafeInteger(approval.maxInputTokens) && Number.isSafeInteger(approval.maxOutputTokens)
      ? approval.models.reduce((sum, model) => {
          const rate = expected.pricing?.models?.[model];
          if (!rate) return sum;
          const perRequest =
            (approval.maxInputTokens * rate.inputPerMillion + approval.maxOutputTokens * rate.outputPerMillion) /
            1_000_000;
          return sum + perRequest * approval.caseIds.length * (approval.repetitions ?? 3);
        }, 0)
      : null;
  const report = buildReport({
    matrix,
    planned: matrix.length,
    promptDigest,
    approval,
    evaluationElapsedMs: elapsedMs,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    identity: { ...identity, ...expected },
    reservedAllowanceUsd,
    runType: mode === "replay" ? "saved-matrix-replay" : mode === "fake" ? "offline-fake-execution" : "inference",
  });
  report.evaluationEngine = { name: "Promptfoo CLI", version: "0.125.1", exitCode };
  return report;
}

export async function runOfflineFakeMatrix({ mode = "comparison", models = ["gpt-6-luna", "gpt-6.1-sol"] } = {}) {
  if (!(
    ["comparison", "gate"].includes(mode) && (mode === "gate" ? models.length === 1 : [2, 3].includes(models.length))
  ))
    throw new Error("INVALID_FAKE_MATRIX");
  const prompt = await loadPrompt();
  const promptDigest = digest(JSON.stringify([prompt.system, prompt.criteria]));
  const caseIds = mode === "gate" ? ALL_CASE_IDS : HOLDOUT_CASE_IDS;
  const approval = {
    enabled: false,
    mode,
    models,
    caseIds,
    requestCount: models.length * caseIds.length * 3,
    repetitions: 3,
    approvalId: "offline-fake-eval",
    usdLimit: null,
  };
  const pricing = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
  const report = await runPromptfooMatrix({
    approval,
    expected: { pricing },
    promptDigest,
    promptContents: { system: prompt.system, criteria: prompt.criteria },
    mode: "fake",
    fakeReview: {
      implementationCorrectness: 8,
      idiomaticity: 8,
      complexity: 8,
      testRiskCoverage: 8,
      documentation: 8,
      securitySafety: 8,
      verdict: "pass",
      summary: "Synthetic offline result used to validate the evaluation matrix.",
    },
    fakeUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  });
  report.manifest.mode = mode;
  return report;
}
export async function runEvaluation({
  approval,
  mode,
  expected,
  fetchImpl,
  reviewer = reviewChange,
  models,
  promptContents,
  maxCalls = 162,
}) {
  const prompt = promptContents ?? (await loadPrompt());
  const promptDigest = digest(JSON.stringify([prompt.system, prompt.criteria]));
  const matrix = [];
  let reservedUsd = 0;
  let calls = 0;
  const modelList = models ?? approval.models;
  const cases = approval.caseIds;
  if (approval.mode !== mode) throw new Error("APPROVAL_MISMATCH");
  if (mode === "gate" && (cases.length !== ALL_CASE_IDS.length || ALL_CASE_IDS.some((id) => !cases.includes(id))))
    throw new Error("APPROVAL_MISMATCH");
  const planned = cases.length * modelList.length * 3;
  if (planned > maxCalls || planned !== approval.requestCount) throw new Error("REQUEST_LIMIT");
  const admissionPricing = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
  const fullRunReserveUsd = modelList.reduce((sum, model) => {
    const rate = admissionPricing.models[model];
    if (!rate) throw new Error("UNKNOWN_RATE");
    const perRequest =
      (approval.maxInputTokens * rate.inputPerMillion + approval.maxOutputTokens * rate.outputPerMillion) / 1_000_000;
    return sum + perRequest * cases.length * 3;
  }, 0);
  if (!Number.isFinite(fullRunReserveUsd) || fullRunReserveUsd > approval.usdLimit) throw new Error("BUDGET_LIMIT");
  const evaluationStartedAt = Date.now();
  const evaluationStartedAtIso = new Date(evaluationStartedAt).toISOString();
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
          fixtureClass: oracle.expectedVerdict === "fail" ? "accepted-defect" : "accepted-safe",
          requestAttempted: false,
          timing: null,
          diagnostics: null,
        };
        let diagnostics = null;
        let returnedEnvelope = null;
        let phase = "request_reservation";
        let budgetReservation = null;
        let pricing = null;
        let responseCostAccounted = false;
        const cellStartedAt = Date.now();
        try {
          pricing = admissionPricing;
          const rate = pricing.models[model];
          budgetReservation = {
            approvalId: approval.approvalId,
            requestCount: approval.requestCount,
            requestSlot: calls + 1,
            authorizedRequestsRemaining: approval.requestCount - calls - 1,
            pricingIdentity: pricing.identity,
            pricingAsOf: pricing.asOf,
            pricingDigest: expected.pricingDigest,
            maxInputTokens: approval.maxInputTokens,
            maxOutputTokens: approval.maxOutputTokens,
            inputUsdPerMillion: rate?.inputPerMillion ?? null,
            outputUsdPerMillion: rate?.outputPerMillion ?? null,
            requestWorstCaseUsd: rate
              ? (approval.maxInputTokens * rate.inputPerMillion + approval.maxOutputTokens * rate.outputPerMillion) /
                1_000_000
              : null,
            reservedUsdBeforeRequest: reservedUsd,
            usdLimit: approval.usdLimit,
          };
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
          phase = "review_request";
          const envelope = await reviewer({
            context: validEvalContext(),
            input,
            apiKey: process.env.OPENAI_API_KEY,
            model,
            fetchImpl,
            promptContents: prompt,
            onDiagnostic: (value) => {
              diagnostics = { ...value, budgetReservation };
            },
          });
          returnedEnvelope = envelope;
          phase = "usage_accounting";
          const u = envelope.usage;
          if (envelope.status !== "completed") {
            throw Object.assign(new Error(envelope.error?.code ?? "REVIEW_FAILED"), {
              usage: u,
              requestId: envelope.requestId,
              timing: envelope.timing,
              operationCode: diagnostics?.errorCode,
            });
          }
          if (
            !u ||
            !Number.isSafeInteger(u.inputTokens) ||
            !Number.isSafeInteger(u.outputTokens) ||
            !Number.isSafeInteger(u.totalTokens)
          )
            throw new Error("UNKNOWN_USAGE");
          if (u.inputTokens > approval.maxInputTokens || u.outputTokens > approval.maxOutputTokens)
            throw Object.assign(new Error("TOKEN_LIMIT_EXCEEDED"), { usage: u });
          const prices = pricing.models[model];
          if (!prices) throw new Error("UNKNOWN_RATE");
          const cost = (u.inputTokens * prices.inputPerMillion + u.outputTokens * prices.outputPerMillion) / 1e6;
          if (!Number.isFinite(cost)) throw new Error("UNKNOWN_COST");
          if (reservedUsd + cost > approval.usdLimit)
            throw Object.assign(new Error("BUDGET_LIMIT"), { usage: u, costUsd: cost });
          reservedUsd += cost;
          responseCostAccounted = true;
          diagnostics = {
            ...(diagnostics ?? {}),
            budgetReservation,
            budgetSettlement: { observedCostUsd: cost, reservedUsdAfterRequest: reservedUsd, withinLimit: true },
          };
          phase = "oracle_assertion";
          const assertion = evaluateCase(caseId, envelope.review, oracle);
          row = {
            ...row,
            status: assertion.passed ? "pass" : "fail",
            requestAttempted: diagnostics?.requestAttempted ?? true,
            review: envelope.review,
            assertion,
            usage: u,
            costUsd: cost,
            requestId: envelope.requestId,
            diagnostics,
            timing: envelope.timing,
            reviewerDurationMs: envelope.timing
              ? Date.parse(envelope.timing.completedAt) - Date.parse(envelope.timing.startedAt)
              : null,
          };
        } catch (error) {
          const timing = error.timing ?? returnedEnvelope?.timing ?? null;
          const errorCode = error.operationCode ?? error.message;
          const safeErrorCode =
            typeof errorCode === "string" && errorCode.length <= 64 && /^[A-Z0-9_]+$/.test(errorCode)
              ? errorCode
              : "REVIEW_FAILED";
          const usage = error.usage ?? returnedEnvelope?.usage ?? null;
          const rate = pricing?.models?.[model];
          const observedCostUsd =
            usage && rate && Number.isSafeInteger(usage.inputTokens) && Number.isSafeInteger(usage.outputTokens)
              ? (usage.inputTokens * rate.inputPerMillion + usage.outputTokens * rate.outputPerMillion) / 1_000_000
              : null;
          const errorCostUsd = Number.isFinite(error.costUsd) ? error.costUsd : observedCostUsd;
          if (Number.isFinite(observedCostUsd) && !responseCostAccounted) reservedUsd += observedCostUsd;
          diagnostics ??= {
            version: 1,
            category: "evaluation",
            phase,
            errorCode: safeErrorCode,
            internalCode: null,
            startedAt: new Date(cellStartedAt).toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: Math.max(0, Date.now() - cellStartedAt),
            requestAttempted: false,
            request: null,
            http: null,
            provider: null,
            usage,
            budgetReservation,
            causeChain: [],
            aborted: false,
          };
          diagnostics = {
            ...diagnostics,
            evaluationFailure: { phase, errorCode: safeErrorCode },
            budgetSettlement: {
              observedCostUsd: errorCostUsd,
              reservedUsdAfterRequest: reservedUsd,
              withinLimit: reservedUsd <= approval.usdLimit,
            },
          };
          row = {
            ...row,
            status: "error",
            error: safeErrorCode,
            usage,
            costUsd: errorCostUsd,
            requestAttempted: diagnostics?.requestAttempted ?? false,
            requestId: error.requestId ?? returnedEnvelope?.requestId ?? null,
            diagnostics,
            timing,
            reviewerDurationMs:
              timing && Number.isFinite(Date.parse(timing.completedAt))
                ? Date.parse(timing.completedAt) - Date.parse(timing.startedAt)
                : (diagnostics?.durationMs ?? null),
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
                  matrix.push({
                    model: restModel,
                    caseId: restCase,
                    repetition: rep,
                    status: "not-run",
                    promptDigest,
                    requestAttempted: false,
                    timing: null,
                    diagnostics: null,
                  });
          break evaluation;
        }
      }
    }
  const report = buildReport({
    matrix,
    planned,
    promptDigest,
    approval,
    evaluationElapsedMs: Math.max(0, Date.now() - evaluationStartedAt),
    startedAt: evaluationStartedAtIso,
    completedAt: new Date().toISOString(),
    identity: expected,
    reservedAllowanceUsd: fullRunReserveUsd,
  });
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
      availableCases: ALL_CASE_IDS.length,
      holdoutCases: 12,
      repetitions: 3,
      defaultPolicyEnabled: false,
      pricingDate: pricing.asOf,
    };
  }
  if (!["compare", "gate", "replay"].includes(command))
    throw new Error("USAGE: runner.mjs preflight|compare|gate|replay");
  const isReplay = command === "replay";
  if (!isReplay && command === "compare" && process.env.GITHUB_ACTIONS === "true")
    throw new Error("HOSTED_COMPARISON_UNAVAILABLE: local ledger does not protect isolated workflow reruns");
  if (!isReplay && !process.env.EVAL_APPROVAL_FILE) throw new Error("APPROVAL_REQUIRED");
  const approval = isReplay ? null : JSON.parse(await readFile(process.env.EVAL_APPROVAL_FILE, "utf8"));
  const policy = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
  const promptContents = process.env.EVAL_PROMPT_DIRECTORY
    ? {
        system: await readFile(resolve(process.env.EVAL_PROMPT_DIRECTORY, "system.md"), "utf8"),
        criteria: await readFile(resolve(process.env.EVAL_PROMPT_DIRECTORY, "criteria.md"), "utf8"),
      }
    : undefined;
  const corpusInputs = await Promise.all(
    ALL_CASE_IDS.map(async (id) => ({
      id,
      files: await Promise.all(
        ["input.json", "oracle.json", "before.mjs", "after.mjs", "diff.patch"].map(async (name) => [
          name,
          await readFile(resolve(root, "cases", id, name), "utf8"),
        ]),
      ),
    })),
  );
  const expected = {
    runnerDigest: await runnerDigest(),
    corpusDigest: digest(corpusInputs),
    schemaDigest: digest((await readFile(resolve(root, "../src/contracts/review.schema.json"))).toString("utf8")),
    configurationDigest: digest(await readFile(resolve(root, "promptfooconfig.mjs"), "utf8")),
    pricingDigest: digest(policy),
    pricing: policy,
  };
  const prompt = promptContents ?? (await loadPrompt());
  const promptDigest = digest(JSON.stringify([prompt.system, prompt.criteria]));
  const evalIdentity = process.env.EVAL_IDENTITY_FILE
    ? JSON.parse(await readFile(process.env.EVAL_IDENTITY_FILE, "utf8"))
    : {};
  if (evalIdentity.promptDigest && evalIdentity.promptDigest !== promptDigest)
    throw new Error("PROMPT_IDENTITY_MISMATCH");
  const reportIdentity = {
    ...evalIdentity,
    workflowSha: evalIdentity.workflowSha ?? process.env.GITHUB_SHA ?? null,
  };
  let replayFixture;
  let approvedRun = approval;
  let mode = "inference";
  if (isReplay) {
    replayFixture = JSON.parse(await readFile(resolve(root, "test/fixtures/saved-holdout-responses.json"), "utf8"));
    if (
      replayFixture.version !== 1 ||
      replayFixture.inferencePerformed !== false ||
      replayFixture.matrix.length !== 72 ||
      replayFixture.repetitions !== 3
    )
      throw new Error("REPLAY_MATRIX_MISMATCH");
    approvedRun = {
      enabled: false,
      mode: "comparison",
      models: replayFixture.models,
      caseIds: replayFixture.caseIds,
      requestCount: replayFixture.matrix.length,
      repetitions: replayFixture.repetitions,
      approvalId: replayFixture.sourceApprovalId,
      usdLimit: null,
      issuedAt: null,
      expiresAt: null,
      runnerDigest: expected.runnerDigest,
      corpusDigest: expected.corpusDigest,
      schemaDigest: expected.schemaDigest,
      pricingDigest: expected.pricingDigest,
      promptDigest: replayFixture.sourcePromptDigest,
    };
    mode = "replay";
  } else {
    const approvalMode = command === "compare" ? "comparison" : command;
    const approvalExpected = { ...expected, ...(approvalMode === "comparison" ? { promptDigest } : {}) };
    validateApproval(approval, approvalExpected);
    if (approvalMode === "gate") {
      const candidateBytes = Buffer.byteLength(JSON.stringify([prompt.system, prompt.criteria]), "utf8");
      if (candidateBytes > approval.maxPromptBytes) throw new Error("PROMPT_SIZE_LIMIT");
    }
    const conservativeReserve = approval.models.reduce((sum, model) => {
      const rate = policy.models[model];
      if (!rate) throw new Error("UNKNOWN_RATE");
      const perRequest =
        (approval.maxInputTokens * rate.inputPerMillion + approval.maxOutputTokens * rate.outputPerMillion) / 1_000_000;
      return sum + perRequest * approval.caseIds.length * approval.repetitions;
    }, 0);
    if (!Number.isFinite(conservativeReserve) || conservativeReserve > approval.usdLimit)
      throw new Error("BUDGET_LIMIT");
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("API_KEY_REQUIRED");
    if (approvalMode === "comparison") await consumeComparisonApproval(approval);
  }
  const report = await runPromptfooMatrix({
    approval: approvedRun,
    expected,
    promptDigest: isReplay ? replayFixture.sourcePromptDigest : promptDigest,
    promptContents: promptContents ?? { system: prompt.system, criteria: prompt.criteria },
    mode,
    replayFixture,
    identity: reportIdentity,
  });
  await mkdir(resolve(root, "reports"), { recursive: true });
  await writeReport(resolve(root, "reports"), report, { prefix: isReplay ? "replay-" : "" });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  cli()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (
        report.runType === "inference" &&
        (report.totals.failed > 0 || report.totals.operationalErrors > 0 || report.totals.notRun > 0)
      )
        process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
