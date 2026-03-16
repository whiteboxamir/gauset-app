export const projectStatusValues = ["draft", "active", "archived"] as const;
export type ProjectStatus = (typeof projectStatusValues)[number];

export const worldSourceKindValues = ["upload", "generated", "capture", "demo", "linked", "external", "unknown"] as const;
export type WorldSourceKind = (typeof worldSourceKindValues)[number];

export const laneTruthKindValues = ["preview", "reconstruction", "asset", "mixed", "unknown"] as const;
export type LaneTruthKind = (typeof laneTruthKindValues)[number];

export const deliveryPostureValues = ["preview_only", "review_ready", "world_class_ready", "blocked", "unspecified"] as const;
export type DeliveryPosture = (typeof deliveryPostureValues)[number];

const worldSourceLabels: Record<WorldSourceKind, string> = {
    upload: "Uploaded source",
    generated: "Generated source",
    capture: "Capture session",
    demo: "Demo world",
    linked: "Linked world",
    external: "External package",
    unknown: "Unknown source",
};

const laneTruthLabels: Record<LaneTruthKind, string> = {
    preview: "Preview lane",
    reconstruction: "Reconstruction lane",
    asset: "Asset lane",
    mixed: "Mixed lane",
    unknown: "Lane unknown",
};

const deliveryPostureLabels: Record<DeliveryPosture, string> = {
    preview_only: "Preview only",
    review_ready: "Review-ready",
    world_class_ready: "World-class ready",
    blocked: "Blocked",
    unspecified: "Delivery unspecified",
};

const deliveryPostureSummaries: Record<DeliveryPosture, string> = {
    preview_only: "The linked world is honest about staying in a preview posture and is not production-ready.",
    review_ready: "The linked world is stable enough for collaborative review, but not yet promoted as production delivery.",
    world_class_ready: "The linked world has cleared its project delivery posture and can be treated as a serious downstream handoff candidate.",
    blocked: "The linked world still has blockers before it can be reopened or handed off with confidence.",
    unspecified: "No explicit delivery posture has been recorded for this linked world yet.",
};

export interface WorldTruthSnapshot {
    sourceKind: WorldSourceKind;
    sourceLabel: string | null;
    laneKind: LaneTruthKind;
    laneLabel: string | null;
    deliveryPosture: DeliveryPosture;
    deliveryLabel: string | null;
    deliverySummary: string | null;
}

export interface ProjectWorldLink {
    id: string;
    projectId: string;
    sceneId: string;
    environmentLabel: string | null;
    isPrimary: boolean;
    createdAt: string;
    updatedAt: string;
    lastReopenedAt: string | null;
    reopenCount: number;
    worldTruth: WorldTruthSnapshot;
}

export interface ProjectCard {
    projectId: string;
    ownerEmail: string;
    name: string;
    slug: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;
    lastActivityAt: string | null;
    lastWorldOpenedAt: string | null;
    worldCount: number;
    primarySceneId: string | null;
    primaryEnvironmentLabel: string | null;
    primaryWorldTruth: WorldTruthSnapshot | null;
}

export interface ProjectActivityEvent {
    id: string;
    projectId: string;
    actorEmail: string | null;
    eventType: string;
    summary: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

export interface ProjectDetail {
    project: ProjectCard;
    worldLinks: ProjectWorldLink[];
    activity: ProjectActivityEvent[];
}

function cleanText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

export function formatWorldSourceKind(value: WorldSourceKind) {
    return worldSourceLabels[value];
}

export function formatLaneTruthKind(value: LaneTruthKind) {
    return laneTruthLabels[value];
}

export function formatDeliveryPosture(value: DeliveryPosture) {
    return deliveryPostureLabels[value];
}

export function describeDeliveryPosture(value: DeliveryPosture) {
    return deliveryPostureSummaries[value];
}

export function isWorldSourceKind(value: string): value is WorldSourceKind {
    return (worldSourceKindValues as readonly string[]).includes(value);
}

export function isLaneTruthKind(value: string): value is LaneTruthKind {
    return (laneTruthKindValues as readonly string[]).includes(value);
}

export function isDeliveryPosture(value: string): value is DeliveryPosture {
    return (deliveryPostureValues as readonly string[]).includes(value);
}

export function createWorldTruthSnapshot(input?: Partial<WorldTruthSnapshot>): WorldTruthSnapshot {
    const sourceKind = input?.sourceKind && isWorldSourceKind(input.sourceKind) ? input.sourceKind : "unknown";
    const laneKind = input?.laneKind && isLaneTruthKind(input.laneKind) ? input.laneKind : "unknown";
    const deliveryPosture =
        input?.deliveryPosture && isDeliveryPosture(input.deliveryPosture) ? input.deliveryPosture : "unspecified";

    return {
        sourceKind,
        sourceLabel: cleanText(input?.sourceLabel) ?? formatWorldSourceKind(sourceKind),
        laneKind,
        laneLabel: cleanText(input?.laneLabel) ?? formatLaneTruthKind(laneKind),
        deliveryPosture,
        deliveryLabel: cleanText(input?.deliveryLabel) ?? formatDeliveryPosture(deliveryPosture),
        deliverySummary: cleanText(input?.deliverySummary) ?? describeDeliveryPosture(deliveryPosture),
    };
}
