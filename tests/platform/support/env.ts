import { existsSync } from "node:fs";

import * as nextEnv from "@next/env";

const defaultLoadEnvConfig = (nextEnv as {
    default?: {
        loadEnvConfig?: typeof nextEnv.loadEnvConfig;
    };
}).default?.loadEnvConfig;

const loadEnvConfig =
    typeof nextEnv.loadEnvConfig === "function"
        ? nextEnv.loadEnvConfig
        : typeof defaultLoadEnvConfig === "function"
          ? defaultLoadEnvConfig
          : null;

if (!loadEnvConfig) {
    throw new Error("Unable to resolve loadEnvConfig from @next/env.");
}

loadEnvConfig(process.cwd());

const ownerEmail = (process.env.GAUSET_PLATFORM_E2E_OWNER_EMAIL ?? process.env.GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL ?? "").trim().toLowerCase();
const ownerPassword = (process.env.GAUSET_PLATFORM_E2E_OWNER_PASSWORD ?? process.env.GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD ?? "").trim();
const ownerStorageStatePath = (process.env.GAUSET_PLATFORM_E2E_STORAGE_STATE ?? "").trim();
const ownerStorageStateReady = ownerStorageStatePath ? existsSync(ownerStorageStatePath) : false;

export const platformE2EEnv = {
    baseUrl: (process.env.GAUSET_PLATFORM_E2E_BASE_URL ?? process.env.GAUSET_PLATFORM_BASE_URL ?? "https://gauset-app.vercel.app").trim(),
    supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
    ownerEmail,
    ownerPassword,
    ownerStorageStatePath,
    ownerStorageStateReady,
    planCode: (process.env.GAUSET_PLATFORM_FIXTURE_PLAN_CODE ?? "studio_monthly").trim(),
    studioSlug: (process.env.GAUSET_PLATFORM_FIXTURE_STUDIO_SLUG ?? "platform-cert-staging").trim(),
};

export function canRunAuthenticatedPlatformE2E() {
    return Boolean(
        platformE2EEnv.supabaseUrl &&
            platformE2EEnv.supabaseAnonKey &&
            platformE2EEnv.ownerEmail &&
            (platformE2EEnv.ownerPassword || platformE2EEnv.ownerStorageStateReady),
    );
}

export function getAuthenticatedPlatformE2EBlocker() {
    const missing: string[] = [];
    if (!platformE2EEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!platformE2EEnv.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (!platformE2EEnv.ownerEmail) missing.push("GAUSET_PLATFORM_FIXTURE_OWNER_EMAIL");
    if (platformE2EEnv.ownerStorageStatePath && !platformE2EEnv.ownerStorageStateReady) {
        missing.push(`existing GAUSET_PLATFORM_E2E_STORAGE_STATE file (${platformE2EEnv.ownerStorageStatePath})`);
    }
    if (!platformE2EEnv.ownerPassword && !platformE2EEnv.ownerStorageStateReady) {
        missing.push("GAUSET_PLATFORM_FIXTURE_OWNER_PASSWORD or a GAUSET_PLATFORM_E2E_STORAGE_STATE captured via `node scripts/capture_platform_storage_state.mjs`");
    }

    return missing.length > 0 ? `Missing authenticated platform E2E inputs: ${missing.join(", ")}.` : "";
}
