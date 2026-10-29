import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function loadPrompt(id = "code-review") {
  if (id !== "code-review") throw new Error("UNKNOWN_PROMPT: unsupported prompt identifier");
  const [system, criteria] = await Promise.all(
    ["system.md", "criteria.md"].map((name) =>
      readFile(new URL(`../../prompts/code-review/${name}`, import.meta.url), "utf8"),
    ),
  );
  return {
    id,
    system,
    criteria,
    digest: createHash("sha256")
      .update(JSON.stringify([system, criteria]))
      .digest("hex"),
  };
}
