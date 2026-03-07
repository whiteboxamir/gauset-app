export const MVP_API_BASE_URL = "/api/mvp";

type ErrorPayload = {
    detail?: string;
    message?: string;
    checklist?: string[];
};

export async function extractApiError(response: Response, fallback: string) {
    try {
        const payload = (await response.json()) as ErrorPayload;
        const primary = payload.detail || payload.message || fallback;
        const checklist =
            Array.isArray(payload.checklist) && payload.checklist.length > 0
                ? `\n\nNext steps:\n- ${payload.checklist.join("\n- ")}`
                : "";
        return `${primary}${checklist}`;
    } catch {
        return fallback;
    }
}

export function toProxyUrl(urlOrPath?: string) {
    if (!urlOrPath) return "";
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) return urlOrPath;
    if (urlOrPath.startsWith(MVP_API_BASE_URL)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return `${MVP_API_BASE_URL}${urlOrPath}`;
    return `${MVP_API_BASE_URL}/${urlOrPath}`;
}
