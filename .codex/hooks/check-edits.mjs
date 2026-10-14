#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import {
  coveredFile,
  ownedRoot,
  patchFiles,
  payloadCwd,
  readPayload,
  registerCheckout,
  relatedTests,
  reportFailure,
  runLocal,
  runTests,
} from "./shared.mjs";

try {
  const payload = readPayload();
  const filenames = patchFiles(payload);
  if (filenames.length) {
    const root = ownedRoot(payloadCwd(payload));
    if (root) registerCheckout(root, payload);
  }
  const groups = new Map();
  for (const filename of filenames) {
    const absolute = path.resolve(payloadCwd(payload), filename);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    const canonical = realpathSync(absolute);
    const root = ownedRoot(path.dirname(canonical));
    if (!root || !coveredFile(root, canonical)) continue;
    registerCheckout(root, payload);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(canonical);
  }
  const deadline = Date.now() + 55000;
  const reports = [];
  for (const [root, group] of groups) {
    const files = [...group];
    const labels = files.map((file) => path.relative(root, file));
    const lint = runLocal(root, "eslint", ["--quiet", "--no-warn-ignored", "--", ...labels], deadline);
    if (lint.status !== 0) reports.push(`ESLint (${root}): ${labels.join(", ")}\n${lint.output}`);
    const tests = relatedTests(root, files);
    if (tests.length) {
      const result = runTests(root, tests, deadline);
      if (result.status !== 0) reports.push(`Related tests (${root}): ${tests.join(", ")}\n${result.output}`);
    }
  }
  if (reports.length) reportFailure(reports);
} catch (error) {
  reportFailure([error.message]);
}
