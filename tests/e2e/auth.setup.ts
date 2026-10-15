import { expect, test as setup } from "@playwright/test";
import {
  cleanPreviousGeneratedAccount,
  createLocalTestAccount,
  deleteLocalTestAccount,
  removePrivateAuthFiles,
  STORAGE_STATE_FILE,
} from "./helpers/local-account";

setup("provision a confirmed local account and sign in through the UI", async ({ page, baseURL }) => {
  await cleanPreviousGeneratedAccount();
  let account: Awaited<ReturnType<typeof createLocalTestAccount>> | undefined;

  try {
    account = await createLocalTestAccount();

    await page.goto("/auth/signin", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(account.email);
    await page.getByRole("textbox", { name: "Password" }).fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${baseURL}/dashboard`);
    await expect(page.getByText(`Welcome, ${account.email}`)).toBeVisible();
    await page.context().storageState({ path: STORAGE_STATE_FILE });
  } catch (error) {
    try {
      if (account) await deleteLocalTestAccount(account);
      await removePrivateAuthFiles();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "E2E authentication failed and generated-account cleanup also failed.",
        { cause: cleanupError },
      );
    }
    throw new Error("E2E authentication setup failed; generated credentials were withheld.", { cause: error });
  }
});
