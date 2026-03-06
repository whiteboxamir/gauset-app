// Supabase REST client — uses fetch directly, no SDK dependency needed
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function supabaseInsert(table: string, data: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        // Supabase REST API returns JSON with code/message on error
        const errorBody = await res.json().catch(() => ({ code: String(res.status), message: res.statusText }));
        return { error: { code: errorBody.code || String(res.status), message: errorBody.message || res.statusText } };
    }

    return { error: null };
}
