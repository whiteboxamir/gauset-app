// Supabase REST client — uses fetch directly, no SDK dependency needed
import { getPlatformDatabaseConfig } from "../server/db/client.ts";
import { buildSupabaseProjectApiHeaders } from "./supabaseApiHeaders.ts";

function normalizeEnvValue(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

function requireSupabaseRestConfig(env: NodeJS.ProcessEnv = process.env) {
    const config = getPlatformDatabaseConfig(env);
    const supabaseUrl = config.supabaseUrl ?? normalizeEnvValue(env.SUPABASE_URL);

    if (!supabaseUrl || !config.supabaseServiceRoleKey) {
        throw new Error(
            "Supabase REST access is not configured. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
        );
    }

    return {
        supabaseUrl,
        supabaseServiceRoleKey: config.supabaseServiceRoleKey,
    };
}

function buildSupabaseRestUrl(table: string, searchParams?: URLSearchParams) {
    const { supabaseUrl } = requireSupabaseRestConfig();
    const url = new URL(`/rest/v1/${table.replace(/^\//, "")}`, supabaseUrl);
    if (searchParams) {
        searchParams.forEach((value, key) => {
            url.searchParams.set(key, value);
        });
    }
    return url;
}

function createSupabaseHeaders(prefer?: string) {
    const { supabaseServiceRoleKey } = requireSupabaseRestConfig();
    const headers = buildSupabaseProjectApiHeaders({
        apiKey: supabaseServiceRoleKey,
    });
    if (prefer) {
        headers.set("Prefer", prefer);
    }
    return headers;
}

export async function supabaseInsert(table: string, data: Record<string, unknown>) {
    const headers = createSupabaseHeaders("return=representation");

    const res = await fetch(buildSupabaseRestUrl(table), {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        // Supabase REST API returns JSON with code/message on error
        const errorBody = await res.json().catch(() => ({ code: String(res.status), message: res.statusText }));
        return { error: { code: errorBody.code || String(res.status), message: errorBody.message || res.statusText } };
    }

    return { error: null };
}

export async function supabaseSelect<T>(table: string, options?: { select?: string; filters?: Record<string, string> }) {
    const params = new URLSearchParams();
    params.set("select", options?.select ?? "*");
    Object.entries(options?.filters ?? {}).forEach(([key, value]) => {
        params.set(key, value);
    });

    const res = await fetch(buildSupabaseRestUrl(table, params), {
        method: "GET",
        headers: createSupabaseHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ code: String(res.status), message: res.statusText }));
        throw new Error(errorBody.message || res.statusText);
    }

    return (await res.json()) as T;
}
