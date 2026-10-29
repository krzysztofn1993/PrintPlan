import { readFile, writeFile, rm, mkdir, appendFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { readConfig } from "../config.mjs";
import { reviewChange } from "../core/review.mjs";

export async function runReviewCli({ contextPath, inputPath, outputPath, env = process.env, fetchImpl }) {
  const output = resolve(outputPath);
  const reviewPath = `${output}.review.json`;
  await mkdir(dirname(output), { recursive: true });
  await Promise.all([rm(output, { force: true }), rm(reviewPath, { force: true })]);
  const context = JSON.parse(await readFile(contextPath, "utf8"));
  let input;
  try {
    input = JSON.parse(await readFile(inputPath, "utf8"));
  } catch {
    input = null;
  }
  let config;
  try {
    config = readConfig(env);
  } catch {
    config = { model: env.AI_REVIEW_MODEL, apiKey: null };
  }
  const envelope = await reviewChange({ context, input, ...config, fetchImpl });
  await writeFile(output, JSON.stringify(envelope));
  if (envelope.status === "completed") await writeFile(reviewPath, JSON.stringify(envelope.review));
  if (env.GITHUB_OUTPUT)
    await appendFile(
      env.GITHUB_OUTPUT,
      `envelope=${output}\nverdict=${envelope.review?.verdict ?? ""}\nreview=${envelope.review ? reviewPath : ""}\n`,
    );
  return envelope;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [contextPath, inputPath, outputPath] = process.argv.slice(2);
  try {
    const envelope = await runReviewCli({ contextPath, inputPath, outputPath });
    if (envelope.status !== "completed") process.exitCode = 1;
  } catch {
    process.stderr.write("Review could not produce an operational envelope.\n");
    process.exitCode = 1;
  }
}
