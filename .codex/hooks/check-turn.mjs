#!/usr/bin/env node
import path from "node:path";
import {
  changedFiles,
  coveredFile,
  ownedRoot,
  payloadCwd,
  readPayload,
  reportFailure,
  runLocal,
  sessionCheckouts,
} from "./shared.mjs";

try {
  const payload = readPayload();
  if (!payload || payload.stop_hook_active === true) {
    process.stdout.write("{}\n");
  } else {
    const root = ownedRoot(payloadCwd(payload));
    if (!root) throw new Error("Cannot resolve the session checkout for the end-of-turn checks.");
    const reports = [];
    const deadline = Date.now() + 110000;
    for (const checkout of sessionCheckouts(root, payload)) {
      const changed = changedFiles(checkout);
      const files = changed.filter((file) => coveredFile(checkout, path.join(checkout, file)));
      if (!files.length) continue;
      const lint = runLocal(checkout, "eslint", ["--quiet", "--no-warn-ignored", "--", ...files], deadline);
      if (lint.status !== 0) reports.push(`ESLint changed files (${checkout}): ${files.join(", ")}\n${lint.output}`);
    }
    if (reports.length) reportFailure(reports);
    else process.stdout.write("{}\n");
  }
} catch (error) {
  reportFailure([error.message]);
}
