import { readFile } from "node:fs/promises";
import { test as teardown } from "@playwright/test";
import {
  CREDENTIALS_FILE,
  deleteLocalTestAccount,
  removePrivateAuthFiles,
  type LocalTestAccount,
} from "./helpers/local-account";

teardown("delete the generated local account and private auth artifacts", async () => {
  let accountContents: string;
  try {
    accountContents = await readFile(CREDENTIALS_FILE, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw new Error("Could not read private E2E account credentials during teardown.", { cause: error });
  }

  let account: LocalTestAccount;
  try {
    account = JSON.parse(accountContents) as LocalTestAccount;
  } catch (error) {
    throw new Error("Private E2E account credentials are unreadable; account cleanup was not attempted.", {
      cause: error,
    });
  }

  await deleteLocalTestAccount(account);
  await removePrivateAuthFiles();
});
