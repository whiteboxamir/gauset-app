import { requirePlatformDatabaseConfig } from "./client.ts";
import { buildSupabaseProjectApiHeaders } from "../../lib/supabaseApiHeaders.ts";

type Primitive = string | number | boolean | null;

function buildSupabaseRestUrl(pathname: string, searchParams?: URLSearchParams) {
    const { supabaseUrl } = requirePlatformDatabaseConfig();
    if (!supabaseUrl) {
        throw new Error("Supabase URL is required for REST access.");
    }

    const url = new URL(`/rest/v1/${pathname.replace(/^\//, "")}`, supabaseUrl);
    if (searchParams) {
        searchParams.forEach((value, key) => {
            url.searchParams.set(key, value);
        });
    }
    return url;
}

function createHeaders(prefer?: string) {
    const { supabaseServiceRoleKey } = requirePlatformDatabaseConfig();
    if (!supabaseServiceRoleKey) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for platform REST access.");
    }

    const headers = buildSupabaseProjectApiHeaders({
        apiKey: supabaseServiceRoleKey,
    });
    if (prefer) {
        headers.set("Prefer", prefer);
    }
    return headers;
}

function createFilterParams(filters?: Record<string, string | Primitive>) {
    const params = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
        if (value === undefined) return;
        params.set(key, String(value));
    });
    return params;
}

async function parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Supabase REST request failed with ${response.status}.`);
    }
    if (response.status === 204) {
        return null as T;
    }
    return (await response.json()) as T;
}

export async function restSelect<T>(table: string, options?: { select?: string; filters?: Record<string, string | Primitive> }) {
    const params = createFilterParams(options?.filters);
    params.set("select", options?.select ?? "*");
    const response = await fetch(buildSupabaseRestUrl(table, params), {
        headers: createHeaders(),
        cache: "no-store",
    });
    return parseResponse<T>(response);
}

export async function restInsert<T>(table: string, payload: Record<string, unknown> | Array<Record<string, unknown>>) {
    const response = await fetch(buildSupabaseRestUrl(table), {
        method: "POST",
        headers: createHeaders("return=representation"),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    return parseResponse<T>(response);
}

export async function restUpsert<T>(
    table: string,
    payload: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: {
        onConflict?: string;
    },
) {
    const params = new URLSearchParams();
    if (options?.onConflict) {
        params.set("on_conflict", options.onConflict);
    }

    const response = await fetch(buildSupabaseRestUrl(table, params), {
        method: "POST",
        headers: createHeaders("resolution=merge-duplicates,return=representation"),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    return parseResponse<T>(response);
}

export async function restUpdate<T>(
    table: string,
    payload: Record<string, unknown>,
    filters: Record<string, string | Primitive>,
) {
    const response = await fetch(buildSupabaseRestUrl(table, createFilterParams(filters)), {
        method: "PATCH",
        headers: createHeaders("return=representation"),
        body: JSON.stringify(payload),
        cache: "no-store",
    });
    return parseResponse<T>(response);
}

export async function restDelete<T>(table: string, filters: Record<string, string | Primitive>) {
    const response = await fetch(buildSupabaseRestUrl(table, createFilterParams(filters)), {
        method: "DELETE",
        headers: createHeaders("return=representation"),
        cache: "no-store",
    });
    return parseResponse<T>(response);
}

export async function restRpc<T>(fn: string, payload?: Record<string, unknown>) {
    const response = await fetch(buildSupabaseRestUrl(`rpc/${fn}`), {
        method: "POST",
        headers: createHeaders("return=representation"),
        body: JSON.stringify(payload ?? {}),
        cache: "no-store",
    });
    return parseResponse<T>(response);
}
