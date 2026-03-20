import { z } from "zod";

import type { PlatformDatabaseConfig } from "./types.ts";

const platformDatabaseEnvSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    DATABASE_URL: z.string().min(1).optional(),
    PLATFORM_DATABASE_URL: z.string().min(1).optional(),
    PLATFORM_ADMIN_DATABASE_URL: z.string().min(1).optional(),
});

function normalizeValue(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

export function getPlatformDatabaseConfig(env: NodeJS.ProcessEnv = process.env): PlatformDatabaseConfig {
    const parsed = platformDatabaseEnvSchema.parse(env);

    return {
        supabaseUrl: normalizeValue(parsed.NEXT_PUBLIC_SUPABASE_URL),
        supabaseAnonKey: normalizeValue(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        supabaseServiceRoleKey: normalizeValue(parsed.SUPABASE_SERVICE_ROLE_KEY),
        databaseUrl: normalizeValue(parsed.PLATFORM_DATABASE_URL) ?? normalizeValue(parsed.DATABASE_URL),
        adminDatabaseUrl:
            normalizeValue(parsed.PLATFORM_ADMIN_DATABASE_URL) ??
            normalizeValue(parsed.PLATFORM_DATABASE_URL) ??
            normalizeValue(parsed.DATABASE_URL),
    };
}

export function hasPlatformRestConfig(env: NodeJS.ProcessEnv = process.env) {
    const config = getPlatformDatabaseConfig(env);
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey);
}

export function hasPlatformDirectDatabaseUrls(env: NodeJS.ProcessEnv = process.env) {
    const config = getPlatformDatabaseConfig(env);
    return Boolean(config.databaseUrl && config.adminDatabaseUrl);
}

export function isPlatformDatabaseConfigured(env: NodeJS.ProcessEnv = process.env) {
    return hasPlatformRestConfig(env);
}

export function requirePlatformDatabaseConfig(env: NodeJS.ProcessEnv = process.env) {
    const config = getPlatformDatabaseConfig(env);
    if (!isPlatformDatabaseConfigured(env)) {
        throw new Error(
            "Platform database is not configured for the current REST-backed services. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY before enabling account routes.",
        );
    }
    return config;
}
