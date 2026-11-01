export const LIMITS = Object.freeze({
  inputBytes: 1024 * 1024,
  changedPaths: 200,
  outputTokens: 8000,
  outputBytes: 64 * 1024,
  summaryCharacters: 12000,
  deadlineMs: 10 * 60 * 1000,
});

export function readConfig(env = process.env) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.AI_REVIEW_MODEL?.trim();
  if (!apiKey || !model) throw new Error("CONFIG_REQUIRED: explicit API key and model are required");
  return { apiKey, model };
}
