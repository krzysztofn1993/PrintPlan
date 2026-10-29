# PrintPlan AI reviewer

Independent ESM package for static PR review. Requires the Node version in the repository's `.nvmrc`; no application install, generated output, ignored course files, or Actions environment is needed for contract tests.

```sh
npm ci --ignore-scripts --prefix packages/ai-reviewer
npm --prefix packages/ai-reviewer run test:contracts
```

The bundled `code-review` Markdown prompts are resolved relative to the loader module. Edit them while preserving the six criteria and eight-field schema. A SHA-256 digest identifies the exact prompt contents. Unknown identifiers and paths are rejected. Local validation rejects extra fields, nonfinite scores, malformed summaries, and contradictory operational envelopes. Only a validated review's `verdict` gates code; scores never supply an implicit threshold.

`src/config.mjs` requires explicit `OPENAI_API_KEY` and `AI_REVIEW_MODEL` settings. Credentials are transport inputs and must never appear in review envelopes or logs. The reviewer exposes no tools and executes no PR instructions. Operational errors carry a safe diagnostic and no review verdict. Live GitHub/API setup and publication acceptance remain operator tasks; contract fixtures make no network requests.
