import {
    appendMeshAssetToSceneDocument,
    createEmptySceneDocumentV2,
    replaceEnvironmentOnSceneDocument,
    sceneDocumentToWorkspaceAssets,
    sceneDocumentToWorkspaceEnvironment,
    setDirectorBriefOnSceneDocument,
} from "@/lib/scene-graph/document.ts";
import { describeEnvironment, resolveEnvironmentRenderState } from "@/lib/mvp-product";
import { countWorldContinuityFields } from "@/lib/mvp-workspace";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";

export type MvpActivityTone = "neutral" | "info" | "success" | "warning";

export interface MvpActivityEntry {
    id: string;
    at: string;
    label: string;
    detail: string;
    tone: MvpActivityTone;
}

export interface MvpChangeSummary {
    persistent: string[];
    sceneDirection: string[];
}

export interface WorkspaceContinuitySummary {
    hasWorld: boolean;
    hasRenderableWorld: boolean;
    isReferenceOnlyDemo: boolean;
    isLegacyDemoWorld: boolean;
    worldTitle: string;
    worldStateLabel: string;
    worldSummary: string;
    worldTruth: string;
    worldTruthLabel: string | null;
    assetCount: number;
    cameraViewCount: number;
    pinCount: number;
    directorPathCount: number;
    hasDirectorBrief: boolean;
    directionStatusLabel: string;
    directionSummary: string;
    viewerTruthSummary: string;
}

export interface DemoWorldPreset {
    title: string;
    summary: string;
    inputLabel: string;
    sceneDocument: SceneDocumentV2;
    assetsList: any[];
}

const DEMO_REFERENCE_IMAGE = "/images/hero/interior_daylight.png";

function readDirectorBrief(sceneDocument: SceneDocumentV2) {
    return sceneDocument.direction.directorBrief.trim();
}

function getEnvironmentId(sceneDocument: SceneDocumentV2) {
    const splat = Object.values(sceneDocument.splats)[0] ?? null;
    if (!splat) {
        return null;
    }

    if (typeof splat.sceneId === "string" && splat.sceneId) {
        return splat.sceneId;
    }

    const metadataId = (splat.metadata as { id?: unknown } | null | undefined)?.id;
    return typeof metadataId === "string" && metadataId ? metadataId : null;
}

function getAssetCount(sceneDocument: SceneDocumentV2) {
    return Object.keys(sceneDocument.meshes).length;
}

const createActivityId = () => `activity_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const formatPlural = (count: number, singular: string, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`;

function formatCountDelta(current: number, baseline: number, singular: string, plural = `${singular}s`) {
    const delta = current - baseline;
    if (delta === 0) return null;
    const amount = Math.abs(delta);
    return `${amount} ${amount === 1 ? singular : plural} ${delta > 0 ? "added" : "removed"}`;
}

export function createDemoWorldPreset(): DemoWorldPreset {
    const demoAssets = [
        {
            id: "asset_counter_sign",
            name: "Counter sign",
            preview: DEMO_REFERENCE_IMAGE,
            instanceId: "inst_counter_sign",
            position: [1.6, 1.2, -1.1],
            rotation: [0, 0.18, 0],
            scale: [0.6, 0.6, 0.6],
        },
        {
            id: "asset_bar_stool",
            name: "Bar stool",
            preview: DEMO_REFERENCE_IMAGE,
            instanceId: "inst_bar_stool",
            position: [-0.9, 0, 0.85],
            rotation: [0, 0.42, 0],
            scale: [0.92, 0.92, 0.92],
        },
    ];

    let sceneDocument = createEmptySceneDocumentV2();
    sceneDocument = replaceEnvironmentOnSceneDocument(sceneDocument, {
        id: "demo_world_cafe",
        label: "Neighborhood cafe",
        previewImage: DEMO_REFERENCE_IMAGE,
        sourceLabel: "Demo world still",
        statusLabel: "Demo world loaded",
    });
    demoAssets.forEach((asset) => {
        sceneDocument = appendMeshAssetToSceneDocument(sceneDocument, asset);
    });
    sceneDocument = setDirectorBriefOnSceneDocument(
        sceneDocument,
        "Wide shot from the doorway. Keep the counter, stools, and daylight feeling fixed while you change only framing and blocking.",
    );

    return {
        title: "Neighborhood cafe",
        summary: "A preloaded world that shows the persistent room state before you upload anything.",
        inputLabel: "Demo world still",
        sceneDocument,
        assetsList: demoAssets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            preview: asset.preview,
        })),
    };
}

export function createActivityEntry(label: string, detail: string, tone: MvpActivityTone = "neutral"): MvpActivityEntry {
    return {
        id: createActivityId(),
        at: new Date().toISOString(),
        label,
        detail,
        tone,
    };
}

export function describeWorkspaceContinuity(sceneDocument: SceneDocumentV2): WorkspaceContinuitySummary {
    const environment = sceneDocumentToWorkspaceEnvironment(sceneDocument);
    const assets = sceneDocumentToWorkspaceAssets(sceneDocument);
    const environmentState = describeEnvironment(environment);
    const renderState = resolveEnvironmentRenderState(environment);
    const environmentRecord = environment as Record<string, unknown> | null;
    const assetCount = assets.length;
    const cameraViewCount = sceneDocument.direction.cameraViews.length;
    const pinCount = sceneDocument.direction.pins.length;
    const directorPathCount = sceneDocument.direction.directorPath.length;
    const hasDirectorBrief = Boolean(readDirectorBrief(sceneDocument));
    const continuityFieldCount = countWorldContinuityFields(sceneDocument.continuity);
    const worldTitle =
        (typeof environment?.name === "string" && environment.name) ||
        environmentState.label;
    const worldTruthLabel = typeof environmentRecord?.truth_label === "string" ? environmentRecord.truth_label : null;
    const worldTruth =
        environmentState.detail ||
        worldTruthLabel ||
        (renderState.isReferenceOnlyDemo
            ? "Reference-only onboarding state."
            : renderState.isLegacyDemoWorld
              ? "Legacy demo world state."
              : renderState.hasRenderableOutput
                ? "Renderable world output is available."
                : "World output is still pending.");
    const worldSummary = !environment
        ? continuityFieldCount > 0
            ? "No persistent world is loaded yet, but continuity memory is already being recorded for the first save."
            : "No persistent world loaded yet. Open the demo, import a still, or recover a saved draft."
        : renderState.isReferenceOnlyDemo
          ? "Reference imagery is visible, but this state is only for shell onboarding and fallback direction."
          : renderState.isLegacyDemoWorld
            ? "A legacy demo world is loaded. Replace it with a real preview or saved world before review handoff."
            : renderState.hasRenderableOutput
              ? `${formatPlural(assetCount, "placed asset")} stay attached to this world across scene revisions. ${continuityFieldCount > 0 ? `${continuityFieldCount} continuity block${continuityFieldCount === 1 ? "" : "s"} are already recorded.` : "Continuity memory is ready to be recorded against the saved world."}`
              : "The world source is present, but renderable output has not finished loading yet.";
    const directionStatusLabel =
        cameraViewCount || pinCount || directorPathCount || hasDirectorBrief ? "Scene direction in progress" : "Scene direction idle";
    const directionSummary =
        cameraViewCount || pinCount || directorPathCount || hasDirectorBrief
            ? [
                  `${formatPlural(cameraViewCount, "saved view")}`,
                  `${formatPlural(pinCount, "scene note")}`,
                  directorPathCount > 0 ? `${formatPlural(directorPathCount, "path frame")}` : null,
                  hasDirectorBrief ? "director brief set" : null,
              ]
                  .filter(Boolean)
                  .join(" · ")
            : "No per-scene direction yet. Save a view, place a note, or write the director brief after the world loads.";
    const viewerTruthSummary = renderState.hasRenderableOutput
        ? "Live rendering stays host-dependent. The workspace only shows premium live when the required WebGL path actually starts."
        : renderState.referenceImage
          ? "Reference imagery can still support directing and interactive fallback, but it does not prove premium live rendering."
          : "Viewer stays in standby until the workspace has renderable world content.";

    return {
        hasWorld: Boolean(environment),
        hasRenderableWorld: renderState.hasRenderableOutput,
        isReferenceOnlyDemo: renderState.isReferenceOnlyDemo,
        isLegacyDemoWorld: renderState.isLegacyDemoWorld,
        worldTitle,
        worldStateLabel: environmentState.label,
        worldSummary,
        worldTruth,
        worldTruthLabel,
        assetCount,
        cameraViewCount,
        pinCount,
        directorPathCount,
        hasDirectorBrief,
        directionStatusLabel,
        directionSummary,
        viewerTruthSummary,
    };
}

const formatDelta = (count: number, singular: string, plural = `${singular}s`) => {
    if (count > 0) return `${count} ${count === 1 ? singular : plural} added`;
    return `${Math.abs(count)} ${Math.abs(count) === 1 ? singular : plural} removed`;
};

export function buildChangeSummary(
    currentSceneDocument: SceneDocumentV2,
    baselineSceneDocument: SceneDocumentV2 | null,
    currentInputLabel?: string | null,
    lastOutputInputLabel?: string | null,
): MvpChangeSummary | null {
    if (!baselineSceneDocument) return null;

    const persistent: string[] = [];
    const sceneDirection: string[] = [];

    const baselineEnvironmentId = getEnvironmentId(baselineSceneDocument);
    const currentEnvironmentId = getEnvironmentId(currentSceneDocument);
    if (baselineEnvironmentId !== currentEnvironmentId) {
        persistent.push(currentEnvironmentId ? "Persistent world source changed" : "Persistent world removed");
    }

    if (currentInputLabel && lastOutputInputLabel && currentInputLabel !== lastOutputInputLabel) {
        persistent.push(`Reference still changed from ${lastOutputInputLabel} to ${currentInputLabel}`);
    }

    const assetDelta = getAssetCount(currentSceneDocument) - getAssetCount(baselineSceneDocument);
    if (assetDelta !== 0) {
        persistent.push(formatDelta(assetDelta, "world asset"));
    }

    const baselineDirection = readDirectorBrief(baselineSceneDocument);
    const currentDirection = readDirectorBrief(currentSceneDocument);
    if (baselineDirection !== currentDirection) {
        sceneDirection.push(currentDirection ? "Director brief updated" : "Director brief cleared");
    }

    if (currentSceneDocument.continuity.worldBible !== baselineSceneDocument.continuity.worldBible) {
        persistent.push(currentSceneDocument.continuity.worldBible.trim() ? "World bible updated" : "World bible cleared");
    }

    if (currentSceneDocument.continuity.castContinuity !== baselineSceneDocument.continuity.castContinuity) {
        persistent.push(currentSceneDocument.continuity.castContinuity.trim() ? "Cast continuity updated" : "Cast continuity cleared");
    }

    if (currentSceneDocument.continuity.lookDevelopment !== baselineSceneDocument.continuity.lookDevelopment) {
        persistent.push(currentSceneDocument.continuity.lookDevelopment.trim() ? "Look development updated" : "Look development cleared");
    }

    if (currentSceneDocument.continuity.shotPlan !== baselineSceneDocument.continuity.shotPlan) {
        sceneDirection.push(currentSceneDocument.continuity.shotPlan.trim() ? "Shot list updated" : "Shot list cleared");
    }

    const cameraViewDelta = formatCountDelta(
        currentSceneDocument.direction.cameraViews.length,
        baselineSceneDocument.direction.cameraViews.length,
        "saved view",
    );
    if (cameraViewDelta) {
        sceneDirection.push(cameraViewDelta);
    }

    const pinDelta = formatCountDelta(
        currentSceneDocument.direction.pins.length,
        baselineSceneDocument.direction.pins.length,
        "scene note",
    );
    if (pinDelta) {
        sceneDirection.push(pinDelta);
    }

    const currentDirectorPathCount = currentSceneDocument.direction.directorPath.length;
    const baselineDirectorPathCount = baselineSceneDocument.direction.directorPath.length;
    if (currentDirectorPathCount !== baselineDirectorPathCount) {
        sceneDirection.push(
            currentDirectorPathCount > 0
                ? baselineDirectorPathCount > 0
                    ? "Director path updated"
                    : "Director path recorded"
                : "Director path cleared",
        );
    }

    const baselineLensMm = Math.round(baselineSceneDocument.viewer.lens_mm);
    const currentLensMm = Math.round(currentSceneDocument.viewer.lens_mm);
    if (baselineLensMm !== currentLensMm) {
        sceneDirection.push(`Lens moved from ${baselineLensMm}mm to ${currentLensMm}mm`);
    }

    if (persistent.length === 0 && sceneDirection.length === 0) {
        return null;
    }

    return {
        persistent: persistent.slice(0, 4),
        sceneDirection: sceneDirection.slice(0, 4),
    };
}
