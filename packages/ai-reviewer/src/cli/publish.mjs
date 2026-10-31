import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubClient, safeGitHubErrorCode } from "../github/client.mjs";
import { eligible, execution } from "../github/prepare.mjs";
import { publishReview } from "../github/publish.mjs";
export async function runPublish({ env = process.env, directory, fetchImpl }) {
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  if (!eligible(event, env.AI_REVIEW_OWNER)) return null;
  const id = execution(event, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
  const client = new GitHubClient({ token: env.GITHUB_TOKEN, repository: id.repository, fetchImpl });
  let context = null;
  let envelope = null;
  try {
    context = JSON.parse(await readFile(`${directory}/context.json`, "utf8"));
    envelope = JSON.parse(await readFile(`${directory}/envelope.json`, "utf8"));
  } catch {
    /* Missing preparation or inference artifacts are operational failure, never a skipped success. */
  }
  return publishReview({ client, id, context, envelope });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runPublish({ directory: process.argv[2] });
    if (result && result.conclusion !== "success") {
      if (result.errorCode)
        process.stderr.write(`Review publication failed: ${result.operation} (${result.errorCode}).\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`Review publication failed (${safeGitHubErrorCode(error)}). No success was created.\n`);
    process.exitCode = 1;
  }
}
