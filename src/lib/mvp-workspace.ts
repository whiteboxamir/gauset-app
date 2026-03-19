"use client";

import { toProxyUrl } from "./mvp-api.ts";

export type Vector3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];
export type SpatialPinType = "general" | "egress" | "lighting" | "hazard";
export type ReviewIssueSeverity = "low" | "medium" | "high" | "critical";
export type ReviewIssueStatus = "open" | "in_review" | "blocked" | "resolved";

export interface CameraView {
    id: string;
    label: string;
    position: Vector3Tuple;
    target: Vector3Tuple;
    fov: number;
    lens_mm: number;
    note: string;
}

export interface CameraPose {
    position: Vector3Tuple;
    target: Vector3Tuple;
    fov: number;
    lens_mm: number;
    up?: Vector3Tuple;
}

export interface SpatialPin {
    id: string;
    label: string;
    type: SpatialPinType;
    position: Vector3Tuple;
    created_at: string;
}

export interface CameraPathFrame {
    time: number;
    position: Vector3Tuple;
    target: Vector3Tuple;
    rotation: QuaternionTuple;
    fov: number;
}

export interface ViewerState {
    fov: number;
    lens_mm: number;
}

export interface WorldContinuityRecord {
    worldBible: string;
    castContinuity: string;
    lookDevelopment: string;
    shotPlan: string;
}

export interface ReviewMetadata {
    project_name: string;
    scene_title: string;
    location_name: string;
    owner: string;
    notes: string;
    address: string;
    shoot_day: string;
    permit_status: string;
    access_notes: string;
    parking_notes: string;
    power_notes: string;
    safety_notes: string;
}

export interface ReviewApprovalHistoryEntry {
    state?: string;
    updated_at?: string | null;
    updated_by?: string | null;
    note?: string;
}

export interface ReviewApproval {
    state?: string;
    updated_at?: string | null;
    updated_by?: string | null;
    note?: string;
    history?: ReviewApprovalHistoryEntry[];
}

export interface ReviewIssue {
    id: string;
    title: string;
    body: string;
    type: SpatialPinType;
    severity: ReviewIssueSeverity;
    status: ReviewIssueStatus;
    assignee: string;
    author: string;
    anchor_position: Vector3Tuple | null;
    anchor_view_id: string | null;
    version_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface SceneReviewRecord {
    scene_id: string;
    metadata: ReviewMetadata;
    approval: ReviewApproval;
    issues: ReviewIssue[];
}

export interface WorkspaceSceneGraph {
    environment: any;
    assets: any[];
    camera_views: CameraView[];
    pins: SpatialPin[];
    director_path: CameraPathFrame[];
    director_brief: string;
    viewer: ViewerState;
}

export type PersistedSceneGraphV1 = WorkspaceSceneGraph;

export const DEFAULT_FOV = 45;
export const DEFAULT_LENS_MM = 35;
const UNKNOWN_TIMESTAMP = "";

export function createId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashDeterministicIdInput(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function normalizeStableIdToken(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        const normalized = value.map((entry) => normalizeStableIdToken(entry)).filter(Boolean);
        return normalized.length > 0 ? normalized.join("-") : null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : null;
    }

    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }

    if (typeof value !== "string") {
        return null;
    }

    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    return normalized || null;
}

export function createStableId(prefix: string, ...parts: unknown[]) {
    const normalizedParts = parts.map((entry) => normalizeStableIdToken(entry)).filter(Boolean);
    const canonical = normalizedParts.length > 0 ? normalizedParts.join("|") : "default";
    const slug = normalizedParts.slice(0, 3).join("_");
    const hash = hashDeterministicIdInput(`${prefix}|${canonical}`);
    return slug ? `${prefix}_${slug}_${hash}` : `${prefix}_${hash}`;
}

export function nowIso() {
    return new Date().toISOString();
}

export function parseVector3Tuple(input: unknown, fallback: Vector3Tuple): Vector3Tuple {
    if (!Array.isArray(input) || input.length !== 3) return fallback;
    const parsed = input.map((value) => Number(value));
    if (parsed.some((value) => Number.isNaN(value))) return fallback;
    return [parsed[0], parsed[1], parsed[2]];
}

export function parseQuaternionTuple(input: unknown, fallback: QuaternionTuple): QuaternionTuple {
    if (!Array.isArray(input) || input.length !== 4) return fallback;
    const parsed = input.map((value) => Number(value));
    if (parsed.some((value) => Number.isNaN(value))) return fallback;
    return [parsed[0], parsed[1], parsed[2], parsed[3]];
}

export function lensMmToFov(lensMm: number, sensorWidth = 36) {
    const safeLens = Math.max(8, Number.isFinite(lensMm) ? lensMm : DEFAULT_LENS_MM);
    return (2 * Math.atan(sensorWidth / (2 * safeLens)) * 180) / Math.PI;
}

export function fovToLensMm(fov: number, sensorWidth = 36) {
    const radians = ((Number.isFinite(fov) ? fov : DEFAULT_FOV) * Math.PI) / 180;
    return sensorWidth / (2 * Math.tan(radians / 2));
}

export function formatPinTypeLabel(value: SpatialPinType) {
    if (value === "egress") return "Egress";
    if (value === "lighting") return "Lighting";
    if (value === "hazard") return "Hazard";
    return "General";
}

export function defaultViewerState(): ViewerState {
    return {
        fov: DEFAULT_FOV,
        lens_mm: DEFAULT_LENS_MM,
    };
}

export function defaultWorldContinuityRecord(): WorldContinuityRecord {
    return {
        worldBible: "",
        castContinuity: "",
        lookDevelopment: "",
        shotPlan: "",
    };
}

export function normalizeWorldContinuityRecord(input: unknown): WorldContinuityRecord {
    const record = input && typeof input === "object" ? (input as Partial<WorldContinuityRecord>) : {};
    return {
        worldBible: typeof record.worldBible === "string" ? record.worldBible : "",
        castContinuity: typeof record.castContinuity === "string" ? record.castContinuity : "",
        lookDevelopment: typeof record.lookDevelopment === "string" ? record.lookDevelopment : "",
        shotPlan: typeof record.shotPlan === "string" ? record.shotPlan : "",
    };
}

export function countWorldContinuityFields(record: WorldContinuityRecord | null | undefined) {
    if (!record) {
        return 0;
    }

    return [record.worldBible, record.castContinuity, record.lookDevelopment, record.shotPlan].filter((value) => value.trim().length > 0).length;
}

export function hasWorldContinuityContent(record: WorldContinuityRecord | null | undefined) {
    return countWorldContinuityFields(record) > 0;
}

export function createEmptyWorkspaceSceneGraph(): PersistedSceneGraphV1 {
    return {
        environment: null,
        assets: [],
        camera_views: [],
        pins: [],
        director_path: [],
        director_brief: "",
        viewer: defaultViewerState(),
    };
}

export function defaultReviewMetadata(): ReviewMetadata {
    return {
        project_name: "",
        scene_title: "",
        location_name: "",
        owner: "",
        notes: "",
        address: "",
        shoot_day: "",
        permit_status: "",
        access_notes: "",
        parking_notes: "",
        power_notes: "",
        safety_notes: "",
    };
}

export function createDefaultReviewRecord(sceneId?: string | null): SceneReviewRecord {
    return {
        scene_id: sceneId ?? "",
        metadata: defaultReviewMetadata(),
        approval: {
            state: "draft",
            updated_at: null,
            updated_by: null,
            note: "",
            history: [],
        },
        issues: [],
    };
}

function normalizeCameraView(raw: unknown, index: number): CameraView | null {
    if (!raw || typeof raw !== "object") return null;
    const input = raw as Partial<CameraView>;
    const position = parseVector3Tuple(input.position, [5, 4, 6]);
    const target = parseVector3Tuple(input.target, [0, 0, 0]);
    const fov = Number.isFinite(input.fov) ? Number(input.fov) : DEFAULT_FOV;
    const lensMm =
        Number.isFinite(input.lens_mm) && Number(input.lens_mm) > 0 ? Number(input.lens_mm) : fovToLensMm(fov);

    return {
        id:
            typeof input.id === "string" && input.id
                ? input.id
                : createStableId("view", input.label, input.note, position, target, fov, lensMm, index),
        label: typeof input.label === "string" && input.label ? input.label : `View ${index + 1}`,
        position,
        target,
        fov,
        lens_mm: Math.round(lensMm * 10) / 10,
        note: typeof input.note === "string" ? input.note : "",
    };
}

function normalizePin(raw: unknown, index: number): SpatialPin | null {
    if (!raw || typeof raw !== "object") return null;
    const input = raw as Partial<SpatialPin>;
    const type: SpatialPinType =
        input.type === "egress" || input.type === "lighting" || input.type === "hazard" ? input.type : "general";

    return {
        id:
            typeof input.id === "string" && input.id
                ? input.id
                : createStableId("pin", input.label, type, input.position, index),
        label: typeof input.label === "string" && input.label ? input.label : `Pin ${index + 1}`,
        type,
        position: parseVector3Tuple(input.position, [0, 0, 0]),
        created_at: typeof input.created_at === "string" && input.created_at ? input.created_at : UNKNOWN_TIMESTAMP,
    };
}

function normalizePathFrame(raw: unknown): CameraPathFrame | null {
    if (!raw || typeof raw !== "object") return null;
    const input = raw as Partial<CameraPathFrame>;
    return {
        time: Number.isFinite(input.time) ? Number(input.time) : 0,
        position: parseVector3Tuple(input.position, [0, 0, 0]),
        target: parseVector3Tuple(input.target, [0, 0, 0]),
        rotation: parseQuaternionTuple(input.rotation, [0, 0, 0, 1]),
        fov: Number.isFinite(input.fov) ? Number(input.fov) : DEFAULT_FOV,
    };
}

export function normalizeWorkspaceSceneGraph(sceneGraph: unknown): WorkspaceSceneGraph {
    const raw = sceneGraph && typeof sceneGraph === "object" ? (sceneGraph as Record<string, unknown>) : {};
    const viewerInput = raw.viewer && typeof raw.viewer === "object" ? (raw.viewer as Partial<ViewerState>) : {};
    const fov = Number.isFinite(viewerInput.fov) ? Number(viewerInput.fov) : DEFAULT_FOV;
    const lensMm =
        Number.isFinite(viewerInput.lens_mm) && Number(viewerInput.lens_mm) > 0
            ? Number(viewerInput.lens_mm)
            : fovToLensMm(fov);
    const environmentRecord = raw.environment && typeof raw.environment === "object" ? (raw.environment as Record<string, unknown>) : null;
    const environmentUrls =
        environmentRecord?.urls && typeof environmentRecord.urls === "object"
            ? (environmentRecord.urls as Record<string, unknown>)
            : null;

    const environment =
        environmentRecord
            ? {
                  ...environmentRecord,
                  urls: environmentUrls
                      ? {
                            ...environmentUrls,
                            viewer: typeof environmentUrls.viewer === "string" ? toProxyUrl(String(environmentUrls.viewer)) : environmentUrls.viewer,
                            splats: typeof environmentUrls.splats === "string" ? toProxyUrl(String(environmentUrls.splats)) : environmentUrls.splats,
                            cameras: typeof environmentUrls.cameras === "string" ? toProxyUrl(String(environmentUrls.cameras)) : environmentUrls.cameras,
                            metadata:
                                typeof environmentUrls.metadata === "string" ? toProxyUrl(String(environmentUrls.metadata)) : environmentUrls.metadata,
                            preview_projection:
                                typeof environmentUrls.preview_projection === "string"
                                    ? toProxyUrl(String(environmentUrls.preview_projection))
                                    : environmentUrls.preview_projection,
                        }
                      : environmentRecord.urls,
              }
            : raw.environment ?? null;
    const assets = Array.isArray(raw.assets)
        ? raw.assets.map((asset) => {
              if (!asset || typeof asset !== "object") {
                  return asset;
              }
              const assetRecord = asset as Record<string, unknown>;
              return {
                  ...assetRecord,
                  mesh: typeof assetRecord.mesh === "string" ? toProxyUrl(assetRecord.mesh) : assetRecord.mesh,
                  texture: typeof assetRecord.texture === "string" ? toProxyUrl(assetRecord.texture) : assetRecord.texture,
                  preview: typeof assetRecord.preview === "string" ? toProxyUrl(assetRecord.preview) : assetRecord.preview,
              };
          })
        : [];

    return {
        environment,
        assets,
        camera_views: Array.isArray(raw.camera_views)
            ? raw.camera_views.map(normalizeCameraView).filter(Boolean) as CameraView[]
            : [],
        pins: Array.isArray(raw.pins) ? raw.pins.map(normalizePin).filter(Boolean) as SpatialPin[] : [],
        director_path: Array.isArray(raw.director_path)
            ? raw.director_path.map(normalizePathFrame).filter(Boolean) as CameraPathFrame[]
            : [],
        director_brief:
            typeof raw.director_brief === "string"
                ? raw.director_brief
                : typeof raw.sceneDirectionNote === "string"
                  ? raw.sceneDirectionNote
                  : "",
        viewer: {
            fov,
            lens_mm: Math.round(lensMm * 10) / 10,
        },
    };
}

function normalizeReviewIssue(raw: unknown, index: number): ReviewIssue | null {
    if (!raw || typeof raw !== "object") return null;
    const input = raw as Partial<ReviewIssue>;
    const type: SpatialPinType =
        input.type === "egress" || input.type === "lighting" || input.type === "hazard" ? input.type : "general";
    const severity: ReviewIssueSeverity =
        input.severity === "low" || input.severity === "high" || input.severity === "critical" ? input.severity : "medium";
    const status: ReviewIssueStatus =
        input.status === "in_review" || input.status === "blocked" || input.status === "resolved" ? input.status : "open";

    return {
        id:
            typeof input.id === "string" && input.id
                ? input.id
                : createStableId("issue", input.title, input.body, type, input.anchor_position, input.anchor_view_id, index),
        title: typeof input.title === "string" ? input.title : "",
        body: typeof input.body === "string" ? input.body : "",
        type,
        severity,
        status,
        assignee: typeof input.assignee === "string" ? input.assignee : "",
        author: typeof input.author === "string" && input.author ? input.author : "Reviewer",
        anchor_position: Array.isArray(input.anchor_position)
            ? parseVector3Tuple(input.anchor_position, [0, 0, 0])
            : null,
        anchor_view_id: typeof input.anchor_view_id === "string" && input.anchor_view_id ? input.anchor_view_id : null,
        version_id: typeof input.version_id === "string" && input.version_id ? input.version_id : null,
        created_at: typeof input.created_at === "string" && input.created_at ? input.created_at : UNKNOWN_TIMESTAMP,
        updated_at: typeof input.updated_at === "string" && input.updated_at ? input.updated_at : UNKNOWN_TIMESTAMP,
    };
}

export function normalizeReviewRecord(raw: unknown, sceneId?: string | null): SceneReviewRecord {
    const baseline = createDefaultReviewRecord(sceneId);
    if (!raw || typeof raw !== "object") {
        return baseline;
    }

    const input = raw as Partial<SceneReviewRecord>;
    const metadataInput = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const approvalInput = input.approval && typeof input.approval === "object" ? input.approval : {};

    return {
        scene_id: typeof input.scene_id === "string" ? input.scene_id : baseline.scene_id,
        metadata: {
            ...baseline.metadata,
            ...metadataInput,
        },
        approval: {
            ...baseline.approval,
            ...approvalInput,
            history: Array.isArray(approvalInput.history) ? approvalInput.history : [],
        },
        issues: Array.isArray(input.issues) ? input.issues.map(normalizeReviewIssue).filter(Boolean) as ReviewIssue[] : [],
    };
}
