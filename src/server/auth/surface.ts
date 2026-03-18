import { isPlatformDatabaseConfigured } from "../db/client.ts";

import { getAuthConfig } from "./config.ts";

export interface AuthSurfaceStatus {
    operational: boolean;
    authConfigured: boolean;
    databaseConfigured: boolean;
    googleEnabled: boolean;
    tone: "ready" | "warning" | "blocked";
    label: string;
    message: string;
}

export function getAuthSurfaceStatus(env: NodeJS.ProcessEnv = process.env): AuthSurfaceStatus {
    const authConfig = getAuthConfig(env);
    const authConfigured = Boolean(authConfig.supabaseUrl && authConfig.supabaseAnonKey);
    const databaseConfigured = isPlatformDatabaseConfigured(env);
    const operational = authConfigured && databaseConfigured;

    if (!authConfigured) {
        return {
            operational: false,
            authConfigured,
            databaseConfigured,
            googleEnabled: false,
            tone: "blocked",
            label: "Auth env missing in this shell",
            message:
                "Identity routes are landed, but this shell is missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, so it cannot issue or validate email links here.",
        };
    }

    if (!databaseConfigured) {
        return {
            operational: false,
            authConfigured,
            databaseConfigured,
            googleEnabled: authConfig.googleAuthEnabled,
            tone: "warning",
            label: "Invite checks are not operational here",
            message:
                "Supabase auth transport is present, but launch-access checks and studio invite finalization still require SUPABASE_SERVICE_ROLE_KEY. This shell is not authenticated-staging proof.",
        };
    }

    return {
        operational: true,
        authConfigured,
        databaseConfigured,
        googleEnabled: authConfig.googleAuthEnabled,
        tone: "ready",
        label: "Invite-first auth is configured",
        message:
            "Magic-link delivery, launch-access verification, and studio invite finalization can run against the configured Supabase project. This still does not certify staging by itself.",
    };
}
