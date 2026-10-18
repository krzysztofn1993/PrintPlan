import assert from "node:assert/strict";

export async function runWithControlledTime(
  testContext,
  operation,
  { stepMs = 200, maxVirtualMs = 30_000, label = "SDK operation" } = {},
) {
  testContext.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });

  try {
    let settled = false;
    const pending = operation().then(
      (value) => {
        settled = true;
        return { value };
      },
      (error) => {
        settled = true;
        return { error };
      },
    );

    for (let advancedMs = 0; advancedMs < maxVirtualMs && !settled; advancedMs += stepMs) {
      // The installed SDK awaits several promise layers between fetch and its
      // retry timer. Let continuations schedule that timer before advancing it.
      for (let turn = 0; turn < 12 && !settled; turn += 1) await Promise.resolve();
      if (settled) break;
      testContext.mock.timers.tick(stepMs);
    }

    for (let turn = 0; turn < 12 && !settled; turn += 1) await Promise.resolve();
    assert.equal(settled, true, `${label} did not settle within ${maxVirtualMs}ms of virtual time`);

    const result = await pending;
    if ("error" in result) throw result.error;
    return result.value;
  } finally {
    testContext.mock.timers.reset();
  }
}
