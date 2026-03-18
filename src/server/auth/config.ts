import { z } from "zod";

const authEnvSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_GAuset_ENABLE_GOOGLE_AUTH: z.string().optional(),
    NEXT_PUBLIC_GAUSET_ENABLE_GOOGLE_AUTH: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

function normalize(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export interface AuthConfig {
    supabaseUrl: string | null;
    supabaseAnonKey: string | null;
    serviceRoleKey: string | null;
    googleAuthEnabled: boolean;
    appUrl: string | null;
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
    const parsed = authEnvSchema.parse(env);

    return {
        supabaseUrl: normalize(parsed.NEXT_PUBLIC_SUPABASE_URL),
        supabaseAnonKey: normalize(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        serviceRoleKey: normalize(parsed.SUPABASE_SERVICE_ROLE_KEY),
        googleAuthEnabled:
            (normalize(parsed.NEXT_PUBLIC_GAUSET_ENABLE_GOOGLE_AUTH) ??
                normalize(parsed.NEXT_PUBLIC_GAuset_ENABLE_GOOGLE_AUTH) ??
                "0") === "1",
        appUrl: normalize(parsed.NEXT_PUBLIC_APP_URL) ?? normalize(parsed.NEXT_PUBLIC_SITE_URL),
    };
}

export interface RequiredAuthConfig extends AuthConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
}

export function requireAuthConfig(env: NodeJS.ProcessEnv = process.env): RequiredAuthConfig {
    const config = getAuthConfig(env);
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error("Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }
    return {
        ...config,
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
    };
}
