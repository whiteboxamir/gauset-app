const SUPABASE_JWT_KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function isSupabaseJwtApiKey(apiKey: string) {
    return SUPABASE_JWT_KEY_PATTERN.test(apiKey.trim());
}

export function buildSupabaseProjectApiHeaders({
    apiKey,
    contentType = "application/json",
}: {
    apiKey: string;
    contentType?: string;
}) {
    const headers = new Headers({
        apikey: apiKey,
        "Content-Type": contentType,
    });

    // New publishable/secret keys are not JWTs and must not be sent as Bearer tokens.
    if (isSupabaseJwtApiKey(apiKey)) {
        headers.set("Authorization", `Bearer ${apiKey}`);
    }

    return headers;
}
