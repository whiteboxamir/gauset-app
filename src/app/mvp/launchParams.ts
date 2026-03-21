import type { WorkspaceLaunchSourceKind } from "./_hooks/mvpWorkspaceSessionShared";

export function normalizeLaunchSceneId(value?: string) {
    const normalized = value?.trim();
    if (!normalized) {
        return null;
    }

    return /^[a-z0-9_-]{1,160}$/i.test(normalized) ? normalized : null;
}

export function normalizeLaunchProjectId(value?: string) {
    const normalized = value?.trim();
    if (!normalized) {
        return null;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

export function normalizeLaunchIntent(value?: string) {
    const normalized = value?.trim();
    if (normalized === "generate" || normalized === "capture" || normalized === "import") {
        return normalized;
    }

    return null;
}

export function normalizeLaunchText(value?: string, max = 500) {
    const normalized = value?.trim();
    if (!normalized) {
        return null;
    }

    return normalized.slice(0, max);
}

export function normalizeLaunchSourceKind(value?: string): WorkspaceLaunchSourceKind | null {
    switch (value?.trim()) {
        case "upload":
        case "provider_generated_still":
        case "capture_session":
        case "demo_world":
        case "linked_scene_version":
        case "external_world_package":
        case "third_party_world_model_output":
            return value.trim() as WorkspaceLaunchSourceKind;
        default:
            return null;
    }
}

export function normalizeLaunchEntryMode(value?: string) {
    return value?.trim() === "workspace" ? "workspace" : null;
}
