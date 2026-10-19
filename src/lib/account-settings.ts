import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { MAX_ACCOUNT_SETTINGS_VERSION, type AccountSettingsSaveInput } from "./account-settings-validation.ts";

export const DEFAULT_ACCOUNT_MARGIN_PERCENT = 10;
export const MAX_ACCOUNT_MARGIN_PERCENT = 100;

export interface AccountSettingsDto {
  marginPercent: number;
  version: number;
}

export type AccountSettingsResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "database_error" | "settings_conflict"; error: unknown; status?: number };

type AccountSettingsClient = SupabaseClient<Database>;

/** Read the settings JSON shape shared by server services and browser clients. */
export function readAccountSettingsDto(value: unknown): AccountSettingsDto | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !Object.hasOwn(record, "marginPercent") || !Object.hasOwn(record, "version"))
    return undefined;
  if (
    typeof record.marginPercent !== "number" ||
    !Number.isInteger(record.marginPercent) ||
    record.marginPercent < 0 ||
    record.marginPercent > MAX_ACCOUNT_MARGIN_PERCENT ||
    typeof record.version !== "number" ||
    !Number.isInteger(record.version) ||
    record.version < 0 ||
    record.version > MAX_ACCOUNT_SETTINGS_VERSION ||
    (record.version === 0 && record.marginPercent !== DEFAULT_ACCOUNT_MARGIN_PERCENT)
  ) {
    return undefined;
  }
  return { marginPercent: record.marginPercent, version: record.version };
}

function asRecord(value: Json): Record<string, Json | undefined> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function rpcFailure(error: unknown, status?: number): AccountSettingsResult<never> {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("settings_conflict")) return { ok: false, reason: "settings_conflict", error, status };
  return { ok: false, reason: "database_error", error, status };
}

function invalidReceipt(message: string): AccountSettingsResult<never> {
  return { ok: false, reason: "database_error", error: new Error(message) };
}

export async function getAccountSettings(
  client: AccountSettingsClient,
): Promise<AccountSettingsResult<AccountSettingsDto>> {
  try {
    const { data, error, status } = await client.rpc("get_account_settings", {});
    if (error) return rpcFailure(error, status);
    const record = data === null ? undefined : asRecord(data);
    const settings = readAccountSettingsDto(record);
    if (!settings) return invalidReceipt("The account settings read returned an invalid receipt.");
    return { ok: true, value: settings };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function saveAccountSafetyMargin(
  client: AccountSettingsClient,
  input: AccountSettingsSaveInput,
): Promise<AccountSettingsResult<AccountSettingsDto>> {
  try {
    const { data, error, status } = await client.rpc("save_account_safety_margin", {
      p_margin_percent: input.marginPercent,
      p_expected_version: input.expectedVersion,
    });
    if (error) return rpcFailure(error, status);
    const receipt = data === null ? undefined : asRecord(data);
    const settings = readAccountSettingsDto(receipt);
    if (
      input.expectedVersion >= MAX_ACCOUNT_SETTINGS_VERSION ||
      settings?.marginPercent !== input.marginPercent ||
      settings.version !== input.expectedVersion + 1
    ) {
      return invalidReceipt("The account settings save returned an invalid receipt.");
    }
    return { ok: true, value: settings };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}
