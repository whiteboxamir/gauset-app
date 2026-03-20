export function extractSceneIdFromProxyPath(pathname: string) {
    const directSceneMatch = pathname.match(/^scene\/([^/]+)(?:\/|$)/);
    if (directSceneMatch?.[1]) {
        return directSceneMatch[1];
    }

    const storageSceneMatch = pathname.match(/^storage\/scenes\/([^/]+)(?:\/|$)/);
    if (storageSceneMatch?.[1]) {
        return storageSceneMatch[1];
    }

    return null;
}

function extractSceneIdFromJobPayload(payload: Record<string, unknown>) {
    if (typeof payload.scene_id === "string" && payload.scene_id) {
        return payload.scene_id;
    }

    const result = payload.result;
    if (result && typeof result === "object" && typeof (result as { scene_id?: unknown }).scene_id === "string") {
        return String((result as { scene_id?: string }).scene_id);
    }

    if (payload.type === "environment" && typeof payload.id === "string" && payload.id.startsWith("scene_")) {
        return payload.id;
    }

    return null;
}

export function extractSceneIdFromProxyResponse(pathname: string, payload: Record<string, unknown>) {
    return extractSceneIdFromProxyPath(pathname) ?? extractSceneIdFromJobPayload(payload);
}
