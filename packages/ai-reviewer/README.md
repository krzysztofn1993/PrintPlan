# PrintPlan AI reviewer

Independent ESM package for static PR review. Requires the Node version in the repository's `.nvmrc`; no application install, generated output, ignored course files, or Actions environment is needed for contract tests.

```sh
npm ci --ignore-scripts --prefix packages/ai-reviewer
npm --prefix packages/ai-reviewer run test:contracts
```

The bundled `code-review` Markdown prompts are resolved relative to the loader module. Edit them while preserving the six criteria and eight-field schema. A SHA-256 digest identifies the exact prompt contents. Unknown identifiers and paths are rejected. Local validation rejects extra fields, nonfinite scores, malformed summaries, and contradictory operational envelopes. Only a validated review's `verdict` gates code; scores never supply an implicit threshold.

`src/config.mjs` requires explicit `OPENAI_API_KEY` and `AI_REVIEW_MODEL` settings. Credentials are transport inputs and must never appear in review envelopes or logs. The reviewer exposes no tools and executes no PR instructions. Operational errors carry a safe diagnostic and no review verdict. Live GitHub/API setup and publication acceptance remain operator tasks; contract fixtures make no network requests.

The offline adapter suite uses injected fake HTTP only:

```sh
npm --prefix packages/ai-reviewer run test:adapter
```

For configured hosted inference, `src/cli/review.mjs` accepts three positional paths: trusted context JSON, bounded input JSON, and a new operational-envelope JSON path. Input is `{title, body, diff, paths, unreviewedPaths}`; context is the immutable version-1 contract. The composite action accepts `context`, `input`, `model`, and `output`, with the API key supplied only in the inference step environment. It exports `envelope`, `verdict`, and `review`; the latter two are empty on operational failure. The caller must upload the envelope with always-run handling even after CLI failure. Invalid context or inaccessible storage can prevent envelope creation; completion must recover through trusted preparation metadata.

Input rejects more than 200 changed paths, binary-only/empty diffs, and assembled UTF-8 JSON above 256 KiB without truncation. Mixed diffs explicitly list omitted paths in `unreviewedPaths` for static-review disclosure. One Responses API request uses an explicit model, strict JSON Schema, no tools, at most 8,000 output tokens, a 64 KiB final object, and a ten-minute abortable deadline. Refusals, incomplete responses, unexpected tool output, transport errors, and invalid reviews never become code approval. There are no inference retries. Response bodies, prompts, authorization headers, and raw exceptions are not logged or exported.
