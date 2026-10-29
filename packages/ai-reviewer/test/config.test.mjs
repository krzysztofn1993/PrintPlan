import test from "node:test";
import assert from "node:assert/strict";
import { readConfig, LIMITS } from "../src/config.mjs";

test("explicit model and API key are required; no login, provider, model or subscription fallback", () => {
  for (const env of [
    {},
    { OPENAI_API_KEY: "fake" },
    { AI_REVIEW_MODEL: "model" },
    { OPENAI_API_KEY: " ", AI_REVIEW_MODEL: "model" },
    { OPENAI_API_KEY: "fake", AI_REVIEW_MODEL: " " },
    { CODEX_ACCESS_TOKEN: "fake", AI_REVIEW_MODEL: "model" },
  ])
    assert.throws(() => readConfig(env), /CONFIG_REQUIRED/);
  assert.deepEqual(readConfig({ OPENAI_API_KEY: " fake ", AI_REVIEW_MODEL: " selected " }), {
    apiKey: "fake",
    model: "selected",
  });
  assert.equal(LIMITS.deadlineMs, 600000);
  assert.equal(LIMITS.outputTokens, 8000);
  assert.equal(LIMITS.outputBytes, 65536);
  assert.equal(LIMITS.changedPaths, 200);
});
