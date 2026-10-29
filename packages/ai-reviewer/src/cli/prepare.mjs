import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubClient } from "../github/client.mjs";
import { eligible, execution, prepareCheck } from "../github/prepare.mjs";
export async function runPrepare({ env = process.env, mode, directory, fetchImpl }) {
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  if (!eligible(event, env.AI_REVIEW_OWNER)) return null;
  const id = execution(event, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
  const client = new GitHubClient({ token: env.GITHUB_TOKEN, repository: id.repository, fetchImpl });
  await mkdir(directory, { recursive: true });
  if (mode === "pending")
    return prepareCheck({
      client,
      event,
      owner: env.AI_REVIEW_OWNER,
      runId: id.runId,
      runAttempt: id.runAttempt,
      persist: async (identity) => {
        await writeFile(`${directory}/identity.json`, JSON.stringify(identity));
        if (env.GITHUB_OUTPUT)
          await appendFile(env.GITHUB_OUTPUT, `eligible=${!identity.completed}\ncheck=${identity.checkId}\n`);
      },
    });
  if (mode !== "input") throw new Error("INVALID_PREPARE_MODE");
  if (!env.AI_REVIEW_MODEL?.trim()) throw new Error("MODEL_REQUIRED");
  const { collectDiff } = await import("../input/diff.mjs");
  const { mergeBase, input } = collectDiff({
    cwd: env.TRUSTED_CHECKOUT,
    head: id.head,
    base: id.base,
    title: event.pull_request.title,
    body: event.pull_request.body,
  });
  const context = {
    repository: id.repository,
    pr: id.pr,
    head: id.head,
    base: id.base,
    mergeBase,
    runId: id.runId,
    runAttempt: id.runAttempt,
  };
  await writeFile(`${directory}/context.json`, JSON.stringify(context));
  await writeFile(`${directory}/input.json`, JSON.stringify(input));
  return context;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runPrepare({ mode: process.argv[2], directory: process.argv[3] });
  } catch {
    process.stderr.write("Trusted review preparation failed. Completion will recover the check identity.\n");
    process.exitCode = 1;
  }
}
