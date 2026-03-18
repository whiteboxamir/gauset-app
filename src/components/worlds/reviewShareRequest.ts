export interface BuildProjectReviewShareCreateRequestInput {
    projectId: string;
    sceneId: string;
    versionId: string;
    expiresInHours: number;
    label?: string | null;
    note?: string | null;
}

export interface BuildProjectReviewShareCreateRequest {
    projectId: string;
    sceneId: string;
    versionId: string;
    expiresInHours: number;
    label?: string;
    note?: string;
}

function normalizeOptionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}

export function buildProjectReviewShareCreateRequest({
    projectId,
    sceneId,
    versionId,
    expiresInHours,
    label,
    note,
}: BuildProjectReviewShareCreateRequestInput): BuildProjectReviewShareCreateRequest {
    return {
        projectId,
        sceneId,
        versionId,
        expiresInHours,
        label: normalizeOptionalText(label),
        note: normalizeOptionalText(note),
    };
}
