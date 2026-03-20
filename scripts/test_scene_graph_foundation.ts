import assert from "node:assert/strict";
import * as THREE from "three";

import {
    DEFAULT_TRANSFORM_SNAP_SETTINGS,
    buildTransformSessionDrafts,
    createSelectionTransformControlMatrix,
    createTransformSessionNodeState,
    quantizeTransformPatchForMode,
} from "../src/lib/render/transformSessions.ts";
import { createSceneNodeRegistry } from "../src/lib/render/sceneNodeRegistry.ts";
import { createSceneRuntime } from "../src/lib/render/sceneRuntime.ts";
import { createEmptyWorkspaceSceneGraph, normalizeReviewRecord, normalizeWorkspaceSceneGraph } from "../src/lib/mvp-workspace.ts";
import { cloneSceneDocument, removeSceneNodeFromSceneDocument, setSceneNodeVisibility } from "../src/lib/scene-graph/document.ts";
import { migratePersistedSceneGraphV1ToSceneDocumentV2, migrateSceneDocumentToWorkspace, migrateSceneGraphToSceneDocument } from "../src/lib/scene-graph/migrate.ts";
import {
    normalizePersistedSceneGraph,
    SCENE_DOCUMENT_V2_FIELD,
    serializeSceneDocumentToNormalizedPersistedSceneGraph,
    serializeSceneDocumentToPersistedSceneGraph,
} from "../src/lib/scene-graph/workspaceAdapter.ts";
import { createMvpEditorSessionStore, getMvpEditorSessionStoreActions } from "../src/state/mvpEditorSessionStore.ts";
import { createRenderableSceneDocumentSnapshotGetter } from "../src/state/mvpRenderableSceneDocument.ts";
import { selectRenderableSceneDocument } from "../src/state/mvpSceneSelectors.ts";
import { createMvpSceneStore, getSceneStoreActions } from "../src/state/mvpSceneStore.ts";
import { selectCompatibilityWorkspaceSceneGraphFromDocument } from "../src/state/mvpSceneWorkspace.ts";

function createSampleWorkspaceSceneGraph() {
    const sceneGraph = createEmptyWorkspaceSceneGraph();
    sceneGraph.environment = {
        id: "scene_sample",
        sourceLabel: "Scout still",
        urls: {
            viewer: "/api/mvp/storage/scenes/scene_sample/environment",
            splats: "/api/mvp/storage/scenes/scene_sample/environment/splats.ply",
            cameras: "/api/mvp/storage/scenes/scene_sample/environment/cameras.json",
            metadata: "/api/mvp/storage/scenes/scene_sample/environment/metadata.json",
            preview_projection: "/api/mvp/storage/scenes/scene_sample/environment/preview-projection.png",
        },
        metadata: {
            viewer_renderer: "sharp_gaussian_direct",
        },
    };
    sceneGraph.assets = [
        {
            id: "asset_chair",
            name: "Chair",
            mesh: "/api/mvp/storage/assets/asset_chair/mesh.glb",
            texture: "/api/mvp/storage/assets/asset_chair/texture.png",
            preview: "/api/mvp/storage/assets/asset_chair/preview.png",
            position: [1, 2, 3],
            rotation: [0.1, 0.2, 0.3],
            scale: [1.2, 1.2, 1.2],
        },
    ];
    sceneGraph.camera_views = [
        {
            id: "view_a",
            label: "Hero View",
            position: [4, 5, 6],
            target: [0, 1, 0],
            fov: 40,
            lens_mm: 45,
            note: "Main angle",
        },
    ];
    sceneGraph.pins = [
        {
            id: "pin_a",
            label: "Key note",
            type: "general",
            position: [0, 0, 0],
            created_at: "2026-03-12T00:00:00.000Z",
        },
    ];
    sceneGraph.director_path = [
        {
            time: 0,
            position: [1, 1, 1],
            target: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            fov: 45,
        },
    ];
    sceneGraph.director_brief = "Hold the frame on the chair.";
    sceneGraph.viewer = {
        fov: 50,
        lens_mm: 32,
    };
    return sceneGraph;
}

function assertNumberClose(actual: number, expected: number, label: string) {
    assert.ok(Math.abs(actual - expected) <= 1e-6, `${label}: expected ${expected}, received ${actual}`);
}

function assertTupleClose(actual: number[] | undefined, expected: number[], label: string) {
    assert.ok(actual, `${label}: expected tuple`);
    assert.equal(actual!.length, expected.length, `${label}: expected tuple length ${expected.length}`);
    actual!.forEach((value, index) => {
        assertNumberClose(value, expected[index] ?? Number.NaN, `${label}[${index}]`);
    });
}

function createTransformSessionPayload(document: ReturnType<typeof cloneSceneDocument>, nodeIds: string[]) {
    const registry = createSceneNodeRegistry(document);
    const runtimeNodes = nodeIds.map((nodeId) => registry.byId[nodeId]).filter(Boolean);
    const nodes = Object.fromEntries(
        runtimeNodes.flatMap((node) => {
            const nodeState = createTransformSessionNodeState(node);
            return nodeState ? [[node.nodeId, nodeState]] : [];
        }),
    );
    const anchorWorldMatrix = Array.from(createSelectionTransformControlMatrix(runtimeNodes, "world").elements);

    return {
        registry,
        nodes,
        anchorWorldMatrix,
    };
}

function testMigrationRoundTrip() {
    const workspaceGraph = createSampleWorkspaceSceneGraph();
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(workspaceGraph);
    const secondDocument = migratePersistedSceneGraphV1ToSceneDocumentV2(workspaceGraph);

    assert.equal(document.version, 2);
    assert.equal(document.direction.cameraViews.length, 1);
    assert.equal(document.direction.pins.length, 1);
    assert.equal(document.direction.directorPath.length, 1);
    assert.equal(document.direction.directorBrief, "Hold the frame on the chair.");
    assert.equal(document.viewer.fov, 50);
    assert.equal(document.viewer.lens_mm, 32);

    const rootKinds = document.rootIds.map((nodeId) => document.nodes[nodeId]?.kind).sort();
    assert.deepEqual(rootKinds, ["camera", "mesh", "splat"]);

    const workspaceRoundTrip = migrateSceneDocumentToWorkspace(document);
    const secondWorkspaceRoundTrip = migrateSceneDocumentToWorkspace(secondDocument);
    assert.equal(workspaceRoundTrip.camera_views[0]?.label, "Hero View");
    assert.equal(workspaceRoundTrip.pins[0]?.label, "Key note");
    assert.equal(workspaceRoundTrip.director_brief, "Hold the frame on the chair.");
    assert.equal(workspaceRoundTrip.viewer.fov, 50);
    assert.equal(workspaceRoundTrip.assets[0]?.instanceId, secondWorkspaceRoundTrip.assets[0]?.instanceId);
    assert.equal(workspaceRoundTrip.environment?.urls?.splats, "/api/mvp/storage/scenes/scene_sample/environment/splats.ply");
    assert.equal(
        workspaceRoundTrip.environment?.urls?.preview_projection,
        "/api/mvp/storage/scenes/scene_sample/environment/preview-projection.png",
    );
    assert.equal(workspaceRoundTrip.assets[0]?.mesh, "/api/mvp/storage/assets/asset_chair/mesh.glb");
}

function testEmptyWorkspaceMigrationUsesDeterministicViewerCameraId() {
    const firstDocument = migrateSceneGraphToSceneDocument(createEmptyWorkspaceSceneGraph());
    const secondDocument = migrateSceneGraphToSceneDocument(createEmptyWorkspaceSceneGraph());

    assert.deepEqual(firstDocument.rootIds, secondDocument.rootIds);
    assert.equal(firstDocument.rootIds.length, 1);
    assert.equal(firstDocument.viewer.activeCameraNodeId, secondDocument.viewer.activeCameraNodeId);
    assert.equal(firstDocument.viewer.activeCameraNodeId, firstDocument.rootIds[0]);
    assert.equal(firstDocument.nodes[firstDocument.rootIds[0]]?.name, "Viewer Camera");
    assert.match(firstDocument.rootIds[0]!, /^camera_viewer_/);
}

function testWorkspaceNormalizationUsesDeterministicFallbackIds() {
    const workspaceGraph = {
        ...createEmptyWorkspaceSceneGraph(),
        camera_views: [
            {
                label: "Fallback view",
                position: [4, 5, 6],
                target: [0, 0, 0],
                fov: 36,
                lens_mm: 50,
                note: "No explicit id",
            },
        ],
        pins: [
            {
                label: "Fallback pin",
                type: "lighting",
                position: [1, 2, 3],
            },
        ],
    };

    const firstNormalized = normalizeWorkspaceSceneGraph(workspaceGraph);
    const secondNormalized = normalizeWorkspaceSceneGraph(workspaceGraph);

    assert.equal(firstNormalized.camera_views[0]?.id, secondNormalized.camera_views[0]?.id);
    assert.equal(firstNormalized.pins[0]?.id, secondNormalized.pins[0]?.id);
    assert.equal(firstNormalized.pins[0]?.created_at, "");
    assert.match(firstNormalized.camera_views[0]?.id ?? "", /^view_/);
    assert.match(firstNormalized.pins[0]?.id ?? "", /^pin_/);
}

function testReviewNormalizationUsesDeterministicFallbackIssueIdentity() {
    const rawReview = {
        issues: [
            {
                title: "Missing practical",
                body: "Check the back corner light.",
                type: "lighting",
                anchor_position: [2, 1, 0],
            },
        ],
    };

    const firstNormalized = normalizeReviewRecord(rawReview, "scene_sample");
    const secondNormalized = normalizeReviewRecord(rawReview, "scene_sample");

    assert.equal(firstNormalized.issues[0]?.id, secondNormalized.issues[0]?.id);
    assert.equal(firstNormalized.issues[0]?.created_at, "");
    assert.equal(firstNormalized.issues[0]?.updated_at, "");
    assert.match(firstNormalized.issues[0]?.id ?? "", /^issue_/);
}

function testDocumentPassthroughClone() {
    const sourceDocument = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const migratedDocument = migrateSceneGraphToSceneDocument(sourceDocument);

    assert.deepEqual(migratedDocument, sourceDocument);
    assert.notEqual(migratedDocument, sourceDocument);
}

function testPersistedSceneGraphEmbedsDocument() {
    const sourceDocument = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const persistedGraph = serializeSceneDocumentToNormalizedPersistedSceneGraph(sourceDocument);

    assert.equal((persistedGraph as Record<string, unknown>)[SCENE_DOCUMENT_V2_FIELD] !== undefined, true);

    const normalizedPersistedGraph = normalizePersistedSceneGraph(persistedGraph);
    const restoredDocument = migrateSceneGraphToSceneDocument(normalizedPersistedGraph);

    assert.equal(restoredDocument.version, 2);
    assert.deepEqual(restoredDocument.rootIds, sourceDocument.rootIds);
    assert.equal(restoredDocument.direction.directorBrief, sourceDocument.direction.directorBrief);
    assert.equal(restoredDocument.direction.cameraViews[0]?.id, sourceDocument.direction.cameraViews[0]?.id);
    assert.equal(restoredDocument.direction.pins[0]?.id, sourceDocument.direction.pins[0]?.id);
    assert.equal(restoredDocument.viewer.lens_mm, sourceDocument.viewer.lens_mm);
    assert.equal(restoredDocument.splats[sourceDocument.rootIds[0]]?.metadata.urls?.preview_projection, sourceDocument.splats[sourceDocument.rootIds[0]]?.metadata.urls?.preview_projection);
    assert.equal(restoredDocument.meshes[sourceDocument.rootIds[1]]?.meshUrl, sourceDocument.meshes[sourceDocument.rootIds[1]]?.meshUrl);
}

function testEmbeddedDocumentReconcilesOuterProjection() {
    const sourceDocument = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const persistedGraph = serializeSceneDocumentToPersistedSceneGraph(sourceDocument);
    const shareToken = "share_abc123";

    persistedGraph.environment = {
        ...persistedGraph.environment,
        urls: {
            ...(persistedGraph.environment?.urls ?? {}),
            splats: `/api/mvp/storage/scenes/scene_sample/environment/splats.ply?share=${shareToken}`,
            preview_projection: `/api/mvp/storage/scenes/scene_sample/environment/preview-projection.png?share=${shareToken}`,
        },
    };
    persistedGraph.assets = persistedGraph.assets.map((asset) => ({
        ...asset,
        mesh: `${asset.mesh}?share=${shareToken}`,
    }));

    const reconciledDocument = migrateSceneGraphToSceneDocument(persistedGraph);
    const environmentNodeId = reconciledDocument.rootIds.find((nodeId) => reconciledDocument.nodes[nodeId]?.kind === "splat");
    const meshNodeId = reconciledDocument.rootIds.find((nodeId) => reconciledDocument.nodes[nodeId]?.kind === "mesh");

    assert.ok(environmentNodeId, "Expected environment node");
    assert.ok(meshNodeId, "Expected mesh node");
    assert.equal(
        reconciledDocument.splats[environmentNodeId!]?.splatUrl,
        `/api/mvp/storage/scenes/scene_sample/environment/splats.ply?share=${shareToken}`,
    );
    assert.equal(
        (reconciledDocument.splats[environmentNodeId!]?.metadata.urls as { preview_projection?: string } | undefined)?.preview_projection,
        `/api/mvp/storage/scenes/scene_sample/environment/preview-projection.png?share=${shareToken}`,
    );
    assert.equal(reconciledDocument.meshes[meshNodeId!]?.meshUrl, `/api/mvp/storage/assets/asset_chair/mesh.glb?share=${shareToken}`);
}

function testStoreDraftCommitUndoRedo() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const meshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");

    assert.ok(meshNodeId, "Expected mesh node");

    actions.updateDraftTransform(meshNodeId!, {
        position: [9, 8, 7],
    });
    assert.deepEqual(store.getState().draftTransforms[meshNodeId!]?.position, [9, 8, 7]);
    assert.deepEqual(store.getState().document.nodes[meshNodeId!]?.transform.position, [1, 2, 3]);

    actions.commitDraftTransforms();
    assert.deepEqual(store.getState().document.nodes[meshNodeId!]?.transform.position, [9, 8, 7]);
    assert.equal(store.getState().history.length, 1);

    actions.undo();
    assert.deepEqual(store.getState().document.nodes[meshNodeId!]?.transform.position, [1, 2, 3]);
    assert.equal(store.getState().future.length, 1);

    actions.redo();
    assert.deepEqual(store.getState().document.nodes[meshNodeId!]?.transform.position, [9, 8, 7]);
}

function testStoreSelectionState() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const meshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");

    assert.ok(meshNodeId, "Expected mesh node");

    actions.selectNodes([meshNodeId!]);
    assert.deepEqual(store.getState().selectedNodeIds, [meshNodeId!]);
    assert.equal(store.getState().selectedPinId, null);
    assert.equal(store.getState().selectedViewId, null);

    actions.selectPin("pin_a");
    assert.deepEqual(store.getState().selectedNodeIds, []);
    assert.equal(store.getState().selectedPinId, "pin_a");
    assert.equal(store.getState().selectedViewId, null);

    actions.selectView("view_a");
    assert.deepEqual(store.getState().selectedNodeIds, []);
    assert.equal(store.getState().selectedPinId, null);
    assert.equal(store.getState().selectedViewId, "view_a");

    actions.selectPin(null);
    assert.equal(store.getState().selectedPinId, null);
    assert.equal(store.getState().selectedViewId, "view_a");

    actions.clearSelection();
    assert.deepEqual(store.getState().selectedNodeIds, []);
    assert.equal(store.getState().selectedPinId, null);
    assert.equal(store.getState().selectedViewId, null);
}

function testStoreMultiSelectionModes() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const meshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");
    const cameraNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "camera");

    assert.ok(meshNodeId, "Expected mesh node");
    assert.ok(cameraNodeId, "Expected camera node");

    actions.selectNodes([meshNodeId!]);
    actions.selectNodes([cameraNodeId!], { mode: "add" });
    assert.deepEqual(store.getState().selectedNodeIds, [meshNodeId!, cameraNodeId!]);

    actions.selectNodes([meshNodeId!], { mode: "toggle" });
    assert.deepEqual(store.getState().selectedNodeIds, [cameraNodeId!]);

    actions.selectNodes([cameraNodeId!], { mode: "remove" });
    assert.deepEqual(store.getState().selectedNodeIds, []);
}

function testEditorSessionStoreState() {
    const store = createMvpEditorSessionStore();
    const actions = getMvpEditorSessionStoreActions(store);

    actions.requestFocus({
        position: [4, 5, 6],
        target: [0, 0, 0],
        fov: 45,
        lens_mm: 35,
    });
    assert.deepEqual(store.getState().focusRequest?.position, [4, 5, 6]);
    assert.equal(typeof store.getState().focusRequest?.token, "number");

    actions.requestViewCapture();
    assert.equal(store.getState().captureRequestKey, 1);

    actions.setPinPlacementEnabled(true);
    actions.setPinType("egress");
    actions.setRecordingPathEnabled(true);
    actions.setViewerReady(false);
    assert.equal(store.getState().isPinPlacementEnabled, false);
    assert.equal(store.getState().pinType, "egress");
    assert.equal(store.getState().isRecordingPath, false);
    assert.equal(store.getState().viewerReady, false);

    actions.setViewerReady(true);
    assert.equal(store.getState().viewerReady, true);

    actions.resetSession();
    assert.equal(store.getState().focusRequest, null);
    assert.equal(store.getState().captureRequestKey, 0);
    assert.equal(store.getState().pinType, "general");
}

function testRenderableDocumentUsesDraftTransforms() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const meshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");

    assert.ok(meshNodeId, "Expected mesh node");

    actions.updateDraftTransform(meshNodeId!, {
        position: [3, 4, 5],
        scale: [1.5, 1.5, 1.5],
    });

    const renderableDocument = selectRenderableSceneDocument(store.getState());
    assert.deepEqual(renderableDocument.nodes[meshNodeId!]?.transform.position, [3, 4, 5]);
    assert.deepEqual(renderableDocument.nodes[meshNodeId!]?.transform.scale, [1.5, 1.5, 1.5]);
    assert.deepEqual(store.getState().document.nodes[meshNodeId!]?.transform.position, [1, 2, 3]);
}

function testRenderableSceneSnapshotGetterCachesAndUsesDraftTransforms() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const getRenderableSceneDocumentSnapshot = createRenderableSceneDocumentSnapshotGetter(store);
    const meshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");

    assert.ok(meshNodeId, "Expected mesh node");

    const firstSnapshot = getRenderableSceneDocumentSnapshot();
    const secondSnapshot = getRenderableSceneDocumentSnapshot();
    assert.equal(secondSnapshot, firstSnapshot);

    actions.updateDraftTransform(meshNodeId!, {
        position: [7, 8, 9],
    });

    const thirdSnapshot = getRenderableSceneDocumentSnapshot();
    assert.notEqual(thirdSnapshot, firstSnapshot);
    assert.deepEqual(thirdSnapshot.nodes[meshNodeId!]?.transform.position, [7, 8, 9]);

    const fourthSnapshot = getRenderableSceneDocumentSnapshot();
    assert.equal(fourthSnapshot, thirdSnapshot);
}

function testCompatibilityWorkspaceSceneGraphSelectorUsesRenderableDocument() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const meshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");

    assert.ok(meshNodeId, "Expected mesh node");

    actions.updateDraftTransform(meshNodeId!, {
        position: [3, 4, 5],
    });

    const renderableDocument = createRenderableSceneDocumentSnapshotGetter(store)();
    const workspaceSceneGraph = selectCompatibilityWorkspaceSceneGraphFromDocument(renderableDocument);

    assert.deepEqual(workspaceSceneGraph.assets[0]?.position, [3, 4, 5]);
    assert.equal(workspaceSceneGraph.viewer.fov, 50);
    assert.equal(workspaceSceneGraph.camera_views[0]?.id, "view_a");
    assert.equal(workspaceSceneGraph.pins[0]?.id, "pin_a");
}

function testStoreDirectSceneActions() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const nextAssetInstanceId = "inst_stage_lamp";

    actions.appendAsset({
        id: "asset_stage_lamp",
        name: "Stage lamp",
        instanceId: nextAssetInstanceId,
        mesh: "/api/mvp/storage/assets/asset_stage_lamp/mesh.glb",
        position: [2, 0, 1],
        rotation: [0, 0.4, 0],
        scale: [1, 1, 1],
    });
    actions.appendPin({
        id: "pin_b",
        label: "Backlight",
        type: "lighting",
        position: [2, 1, -1],
        created_at: "2026-03-12T10:00:00.000Z",
    });
    assert.equal(store.getState().selectedPinId, "pin_b");
    assert.equal(store.getState().selectedViewId, null);
    actions.appendCameraView({
        id: "view_b",
        label: "Tighter",
        position: [3, 3, 4],
        target: [0, 0, 0],
        fov: 22,
        lens_mm: 85,
        note: "Push tighter",
    });
    assert.equal(store.getState().selectedPinId, null);
    assert.equal(store.getState().selectedViewId, "view_b");
    actions.patchViewer({
        fov: 22,
        lens_mm: 85,
    });
    actions.setDirectorPath([
        {
            time: 0,
            position: [3, 3, 4],
            target: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            fov: 22,
        },
        {
            time: 0.8,
            position: [2.5, 3.2, 3.7],
            target: [0, 0, 0],
            rotation: [0, 0.1, 0, 0.99],
            fov: 22,
        },
    ]);
    actions.updateDraftTransformByAssetInstanceId(nextAssetInstanceId, {
        position: [7, 7, 7],
    });

    const renderableDocument = selectRenderableSceneDocument(store.getState());
    const appendedMeshNodeId = Object.entries(renderableDocument.meshes).find(
        ([, mesh]) => mesh.metadata.instanceId === nextAssetInstanceId,
    )?.[0];

    assert.ok(appendedMeshNodeId, "Expected appended asset node");
    assert.deepEqual(renderableDocument.nodes[appendedMeshNodeId!]?.transform.position, [7, 7, 7]);

    actions.commitDraftTransforms();

    const workspaceRoundTrip = migrateSceneDocumentToWorkspace(store.getState().document);
    const appendedAsset = workspaceRoundTrip.assets.find((asset) => asset.instanceId === nextAssetInstanceId);
    assert.ok(appendedAsset, "Expected appended asset in workspace graph");
    assert.deepEqual(appendedAsset?.position, [7, 7, 7]);
    assert.equal(workspaceRoundTrip.pins.at(-1)?.id, "pin_b");
    assert.equal(workspaceRoundTrip.camera_views.at(-1)?.id, "view_b");
    assert.equal(workspaceRoundTrip.viewer.lens_mm, 85);
    assert.equal(workspaceRoundTrip.director_path.length, 2);
}

function testStoreStructuralSceneActions() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const originalAsset = migrateSceneDocumentToWorkspace(store.getState().document).assets[0];
    const originalMeshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");

    assert.ok(originalAsset?.instanceId, "Expected initial asset instanceId");
    assert.ok(originalMeshNodeId, "Expected initial mesh node");

    actions.selectNodes([originalMeshNodeId!]);
    actions.selectPin("pin_a");
    actions.selectView("view_a");

    actions.duplicateAsset(originalAsset!.instanceId);
    actions.setDirectorBrief("Reframe to the practical and keep the doorway clean.");
    actions.removePin("pin_a");
    actions.removeCameraView("view_a");

    let workspaceRoundTrip = migrateSceneDocumentToWorkspace(store.getState().document);
    const duplicatedAssets = workspaceRoundTrip.assets.filter((asset) => asset.id === originalAsset?.id);

    assert.equal(duplicatedAssets.length, 2);
    assert.equal(workspaceRoundTrip.director_brief, "Reframe to the practical and keep the doorway clean.");
    assert.equal(workspaceRoundTrip.pins.length, 0);
    assert.equal(workspaceRoundTrip.camera_views.length, 0);
    assert.equal(store.getState().selectedPinId, null);
    assert.equal(store.getState().selectedViewId, null);

    actions.removeAsset(originalAsset!.instanceId);
    workspaceRoundTrip = migrateSceneDocumentToWorkspace(store.getState().document);

    assert.equal(workspaceRoundTrip.assets.length, 1);
    assert.notEqual(workspaceRoundTrip.assets[0]?.instanceId, originalAsset?.instanceId);
    assert.deepEqual(store.getState().selectedNodeIds, []);

    actions.setEnvironment({
        id: "scene_reframed",
        sourceLabel: "Reframed still",
        lane: "preview",
        urls: {
            viewer: "/api/mvp/storage/scenes/scene_reframed/environment",
            splats: "/api/mvp/storage/scenes/scene_reframed/environment/splats.ply",
            cameras: "/api/mvp/storage/scenes/scene_reframed/environment/cameras.json",
            metadata: "/api/mvp/storage/scenes/scene_reframed/environment/metadata.json",
        },
        metadata: {
            viewer_renderer: "sharp_gaussian_direct",
        },
    });
    workspaceRoundTrip = migrateSceneDocumentToWorkspace(store.getState().document);
    assert.equal(workspaceRoundTrip.environment?.id, "scene_reframed");
    assert.equal(workspaceRoundTrip.environment?.sourceLabel, "Reframed still");

    actions.setEnvironment(null);
    workspaceRoundTrip = migrateSceneDocumentToWorkspace(store.getState().document);
    assert.equal(workspaceRoundTrip.environment, null);
}

function testGroupedNodeProjectionAndEmbeddedRestore() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const meshNodeId = Object.keys(store.getState().document.meshes)[0];

    assert.ok(meshNodeId, "Expected initial mesh node");

    actions.appendGroup({ name: "Layout Group" });
    const groupNodeId = store.getState().selectedNodeIds[0];

    assert.ok(groupNodeId, "Expected appended group node");

    actions.updateNodeTransform(groupNodeId!, {
        position: [10, 0, 0],
    });
    actions.setNodeLocked(groupNodeId!, true);
    actions.reparentNode(meshNodeId!, groupNodeId!);

    let workspaceRoundTrip = migrateSceneDocumentToWorkspace(store.getState().document);
    const groupedAsset = workspaceRoundTrip.assets.find((asset) => asset.id === "asset_chair");

    assert.ok(groupedAsset, "Expected grouped asset in compatibility projection");
    assert.deepEqual(groupedAsset?.position, [11, 2, 3]);
    assert.equal(groupedAsset?.locked, true);
    assert.equal(Array.isArray(groupedAsset?.parentWorldMatrix), true);

    actions.setNodeVisibility(groupNodeId!, false);
    workspaceRoundTrip = migrateSceneDocumentToWorkspace(store.getState().document);

    assert.equal(workspaceRoundTrip.assets.some((asset) => asset.id === "asset_chair"), false);

    const persistedGraph = serializeSceneDocumentToPersistedSceneGraph(store.getState().document);
    const restoredDocument = migrateSceneGraphToSceneDocument(persistedGraph);

    assert.equal(restoredDocument.nodes[groupNodeId!]?.visible, false);
    assert.equal(restoredDocument.nodes[groupNodeId!]?.locked, true);
    assert.equal(restoredDocument.nodes[meshNodeId!]?.parentId, groupNodeId);
    assert.ok(restoredDocument.meshes[meshNodeId!], "Expected hidden grouped asset to survive embedded restore");
}

function testStoreNodeAuthoringActions() {
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);

    actions.appendGroup({ name: "Lighting Rig" });
    const groupNodeId = store.getState().selectedNodeIds[0];
    assert.ok(groupNodeId, "Expected group node selection");
    assert.equal(store.getState().document.nodes[groupNodeId!]?.name, "Lighting Rig");

    actions.appendCamera({
        name: "Shot Camera",
        parentId: groupNodeId!,
        camera: {
            role: "shot",
            fov: 28,
            lens_mm: 65,
        },
    });
    const cameraNodeId = store.getState().selectedNodeIds[0];
    assert.ok(cameraNodeId, "Expected camera node selection");
    actions.patchCameraNode(cameraNodeId!, {
        near: 0.05,
        far: 800,
    });

    actions.appendLight({
        name: "Key Light",
        parentId: groupNodeId!,
        light: {
            lightType: "spot",
            intensity: 2.5,
            color: "#ffaa33",
        },
    });
    const lightNodeId = store.getState().selectedNodeIds[0];
    assert.ok(lightNodeId, "Expected light node selection");

    actions.reparentNode(lightNodeId!, null);
    actions.renameNode(lightNodeId!, "Hero Key Light");
    actions.updateNodeTransform(lightNodeId!, {
        position: [1, 2, 3],
        scale: [1.2, 1.2, 1.2],
    });
    actions.setNodeVisibility(lightNodeId!, false);
    actions.setNodeLocked(lightNodeId!, true);
    actions.updateNodeTransform(lightNodeId!, {
        position: [9, 9, 9],
    });
    actions.patchLightNode(lightNodeId!, {
        intensity: 3.1,
    });
    actions.removeNode(cameraNodeId!);

    const nextDocument = store.getState().document;

    assert.equal(nextDocument.nodes[groupNodeId!]?.name, "Lighting Rig");
    assert.equal(nextDocument.nodes[lightNodeId!]?.name, "Hero Key Light");
    assert.equal(nextDocument.nodes[lightNodeId!]?.parentId, null);
    assert.equal(nextDocument.nodes[lightNodeId!]?.visible, false);
    assert.equal(nextDocument.nodes[lightNodeId!]?.locked, true);
    assert.deepEqual(nextDocument.nodes[lightNodeId!]?.transform.position, [1, 2, 3]);
    assert.deepEqual(nextDocument.nodes[lightNodeId!]?.transform.scale, [1.2, 1.2, 1.2]);
    assert.equal(nextDocument.lights[lightNodeId!]?.lightType, "spot");
    assert.equal(nextDocument.lights[lightNodeId!]?.intensity, 3.1);
    assert.equal(nextDocument.lights[lightNodeId!]?.color, "#ffaa33");
    assert.equal(nextDocument.cameras[cameraNodeId!], undefined);
    assert.equal(nextDocument.nodes[cameraNodeId!], undefined);
    assert.equal(nextDocument.nodes[groupNodeId!]?.childIds.includes(cameraNodeId!), false);
}

function createRuntimeSampleDocument() {
    const store = createMvpSceneStore(migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph()));
    const actions = getSceneStoreActions(store);
    const meshNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "mesh");
    const splatNodeId = store.getState().document.rootIds.find((nodeId) => store.getState().document.nodes[nodeId]?.kind === "splat");

    assert.ok(meshNodeId, "Expected mesh node");
    assert.ok(splatNodeId, "Expected splat node");

    actions.appendGroup({ name: "Runtime Group" });
    const groupNodeId = store.getState().selectedNodeIds[0];
    assert.ok(groupNodeId, "Expected group node");

    actions.updateNodeTransform(groupNodeId!, {
        position: [10, 0, 0],
    });
    actions.reparentNode(meshNodeId!, groupNodeId!);

    actions.appendCamera({
        name: "Scout Camera",
        parentId: groupNodeId!,
        camera: {
            role: "utility",
            fov: 38,
            lens_mm: 50,
        },
    });
    const cameraNodeId = store.getState().selectedNodeIds[0];
    assert.ok(cameraNodeId, "Expected camera node");

    actions.appendLight({
        name: "Key Light",
        parentId: groupNodeId!,
        light: {
            lightType: "spot",
            intensity: 2.2,
            color: "#ffaa33",
        },
    });
    const lightNodeId = store.getState().selectedNodeIds[0];
    assert.ok(lightNodeId, "Expected light node");

    return {
        document: store.getState().document,
        meshNodeId: meshNodeId!,
        splatNodeId: splatNodeId!,
        groupNodeId: groupNodeId!,
        cameraNodeId: cameraNodeId!,
        lightNodeId: lightNodeId!,
    };
}

function createDisposableRuntimeObject() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    let geometryDisposeCount = 0;
    let materialDisposeCount = 0;
    geometry.addEventListener("dispose", () => {
        geometryDisposeCount += 1;
    });
    material.addEventListener("dispose", () => {
        materialDisposeCount += 1;
    });

    return {
        object: new THREE.Mesh(geometry, material),
        getGeometryDisposeCount: () => geometryDisposeCount,
        getMaterialDisposeCount: () => materialDisposeCount,
    };
}

function testSceneNodeRegistryProjectsRuntimeNodes() {
    const { document, meshNodeId, splatNodeId, groupNodeId, cameraNodeId, lightNodeId } = createRuntimeSampleDocument();
    const registry = createSceneNodeRegistry(document);
    const meshNode = registry.byId[meshNodeId];
    const splatNode = registry.byId[splatNodeId];
    const groupNode = registry.byId[groupNodeId];
    const cameraNode = registry.byId[cameraNodeId];
    const lightNode = registry.byId[lightNodeId];

    assert.equal(registry.primarySplatNodeId, splatNodeId);
    assert.equal(meshNode?.kind, "mesh");
    assert.equal(splatNode?.kind, "splat");
    assert.equal(groupNode?.kind, "group");
    assert.equal(cameraNode?.kind, "camera");
    assert.equal(lightNode?.kind, "light");
    assert.equal(meshNode?.parentId, groupNodeId);
    assert.deepEqual(meshNode?.worldTransform.position, [11, 2, 3]);
    assert.equal(Array.isArray(meshNode?.parentWorldMatrix), true);
    assert.equal(meshNode?.parentWorldMatrix?.length, 16);
    assert.equal(splatNode?.environment?.urls?.splats, "/api/mvp/storage/scenes/scene_sample/environment/splats.ply");
    assert.equal(cameraNode?.camera.role, "utility");
    assert.equal(lightNode?.light.lightType, "spot");
}

function testSceneRuntimeReusesBindingsAcrossEquivalentSceneLoads() {
    const { document, meshNodeId } = createRuntimeSampleDocument();
    const runtime = createSceneRuntime(createSceneNodeRegistry(document));
    const meshNode = runtime.getRegistry().byId[meshNodeId];
    const disposable = createDisposableRuntimeObject();

    assert.equal(meshNode?.kind, "mesh");
    runtime.bindObject(meshNodeId, meshNode!.lifecycleKey, disposable.object);
    runtime.syncRegistry(createSceneNodeRegistry(cloneSceneDocument(document)));

    assert.equal(runtime.getBoundObject(meshNodeId), disposable.object);
    assert.equal(disposable.getGeometryDisposeCount(), 0);
    assert.equal(disposable.getMaterialDisposeCount(), 0);

    runtime.dispose();
}

function testSceneRuntimePreservesBindingsAcrossVisibilityChanges() {
    const { document, meshNodeId } = createRuntimeSampleDocument();
    const runtime = createSceneRuntime(createSceneNodeRegistry(document));
    const meshNode = runtime.getRegistry().byId[meshNodeId];
    const disposable = createDisposableRuntimeObject();

    assert.equal(meshNode?.kind, "mesh");
    runtime.bindObject(meshNodeId, meshNode!.lifecycleKey, disposable.object);
    runtime.syncRegistry(createSceneNodeRegistry(setSceneNodeVisibility(document, meshNodeId, false)));

    assert.equal(runtime.getBoundObject(meshNodeId), disposable.object);
    assert.equal(disposable.getGeometryDisposeCount(), 0);
    assert.equal(disposable.getMaterialDisposeCount(), 0);

    runtime.dispose();
}

function testSceneRuntimeDisposesRemovedBindings() {
    const { document, meshNodeId } = createRuntimeSampleDocument();
    const runtime = createSceneRuntime(createSceneNodeRegistry(document));
    const meshNode = runtime.getRegistry().byId[meshNodeId];
    const disposable = createDisposableRuntimeObject();

    assert.equal(meshNode?.kind, "mesh");
    runtime.bindObject(meshNodeId, meshNode!.lifecycleKey, disposable.object);
    runtime.syncRegistry(createSceneNodeRegistry(removeSceneNodeFromSceneDocument(document, meshNodeId)));

    assert.equal(runtime.getBoundObject(meshNodeId), null);
    assert.equal(disposable.getGeometryDisposeCount(), 1);
    assert.equal(disposable.getMaterialDisposeCount(), 1);
}

function testSceneRuntimeDisposesBindingsWhenLifecycleChanges() {
    const { document, meshNodeId } = createRuntimeSampleDocument();
    const runtime = createSceneRuntime(createSceneNodeRegistry(document));
    const meshNode = runtime.getRegistry().byId[meshNodeId];
    const disposable = createDisposableRuntimeObject();

    assert.equal(meshNode?.kind, "mesh");
    runtime.bindObject(meshNodeId, meshNode!.lifecycleKey, disposable.object);

    const nextDocument = cloneSceneDocument(document);
    nextDocument.meshes[meshNodeId] = {
        ...nextDocument.meshes[meshNodeId],
        meshUrl: "/api/mvp/storage/assets/asset_chair/mesh-v2.glb",
    };
    runtime.syncRegistry(createSceneNodeRegistry(nextDocument));

    assert.equal(runtime.getBoundObject(meshNodeId), null);
    assert.equal(disposable.getGeometryDisposeCount(), 1);
    assert.equal(disposable.getMaterialDisposeCount(), 1);
}

function testTransformSessionCommitsSingleUndoEntry() {
    const { document, meshNodeId } = createRuntimeSampleDocument();
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const { nodes, anchorWorldMatrix } = createTransformSessionPayload(store.getState().document, [meshNodeId]);

    actions.selectNodes([meshNodeId]);
    actions.beginTransformSession({
        nodeIds: [meshNodeId],
        mode: "translate",
        space: "world",
        anchorWorldMatrix,
        nodes,
    });
    actions.updateTransformSessionDrafts({
        [meshNodeId]: {
            position: [2, 2, 3],
        },
    });
    actions.updateTransformSessionDrafts({
        [meshNodeId]: {
            position: [3, 2, 3],
        },
    });

    assert.equal(store.getState().history.length, 0);
    assertTupleClose(store.getState().draftTransforms[meshNodeId]?.position, [3, 2, 3], "draft position");

    actions.commitTransformSession();

    assert.equal(store.getState().history.length, 1);
    assert.equal(store.getState().transformSession, null);
    assertTupleClose(store.getState().document.nodes[meshNodeId]?.transform.position, [3, 2, 3], "committed position");

    actions.undo();
    assertTupleClose(store.getState().document.nodes[meshNodeId]?.transform.position, [1, 2, 3], "undo position");

    actions.redo();
    assertTupleClose(store.getState().document.nodes[meshNodeId]?.transform.position, [3, 2, 3], "redo position");
}

function testTransformSessionCancelClearsDrafts() {
    const { document, meshNodeId } = createRuntimeSampleDocument();
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);
    const { nodes, anchorWorldMatrix } = createTransformSessionPayload(store.getState().document, [meshNodeId]);

    actions.beginTransformSession({
        nodeIds: [meshNodeId],
        mode: "translate",
        space: "world",
        anchorWorldMatrix,
        nodes,
    });
    actions.updateTransformSessionDrafts({
        [meshNodeId]: {
            position: [5, 2, 3],
        },
    });

    assert.ok(store.getState().transformSession, "Expected active transform session");
    assert.ok(store.getState().draftTransforms[meshNodeId], "Expected draft transform");

    actions.cancelTransformSession();

    assert.equal(store.getState().transformSession, null);
    assert.deepEqual(store.getState().draftTransforms, {});
    assert.equal(store.getState().history.length, 0);
    assertTupleClose(store.getState().document.nodes[meshNodeId]?.transform.position, [1, 2, 3], "cancel position");
}

function testTransformSessionSkipsLockedNodes() {
    const { document, meshNodeId } = createRuntimeSampleDocument();
    const store = createMvpSceneStore(document);
    const actions = getSceneStoreActions(store);

    actions.setNodeLocked(meshNodeId, true);
    const { nodes, anchorWorldMatrix } = createTransformSessionPayload(store.getState().document, [meshNodeId]);

    actions.beginTransformSession({
        nodeIds: [meshNodeId],
        mode: "translate",
        space: "world",
        anchorWorldMatrix,
        nodes,
    });
    actions.updateTransformSessionDrafts({
        [meshNodeId]: {
            position: [9, 2, 3],
        },
    });

    assert.deepEqual(store.getState().draftTransforms, {});

    actions.commitTransformSession();

    assert.equal(store.getState().history.length, 1);
    assert.equal(store.getState().transformSession, null);
    assertTupleClose(store.getState().document.nodes[meshNodeId]?.transform.position, [1, 2, 3], "locked node position");
}

function testTransformHelpersSupportMultiNodeDraftsAndLocalSpace() {
    const { document, meshNodeId, cameraNodeId } = createRuntimeSampleDocument();
    const registry = createSceneNodeRegistry(document);
    const meshNode = registry.byId[meshNodeId];
    const cameraNode = registry.byId[cameraNodeId];

    assert.ok(meshNode, "Expected mesh runtime node");
    assert.ok(cameraNode, "Expected camera runtime node");

    const worldAnchor = createSelectionTransformControlMatrix([meshNode!], "world");
    const localAnchor = createSelectionTransformControlMatrix([meshNode!], "local");
    const worldRotation = new THREE.Quaternion();
    const localRotation = new THREE.Quaternion();
    const scratchPosition = new THREE.Vector3();
    const scratchScale = new THREE.Vector3();
    worldAnchor.decompose(scratchPosition, worldRotation, scratchScale);
    localAnchor.decompose(scratchPosition, localRotation, scratchScale);

    assert.ok(worldRotation.angleTo(new THREE.Quaternion()) <= 1e-6, "World-space controls should stay axis-aligned");

    const expectedLocalRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    assert.ok(localRotation.angleTo(expectedLocalRotation) <= 1e-6, "Local-space controls should inherit node rotation");

    const nextAnchor = createSelectionTransformControlMatrix([meshNode!, cameraNode!], "world");
    nextAnchor.premultiply(new THREE.Matrix4().makeTranslation(2, 0, 0));

    const drafts = buildTransformSessionDrafts({
        session: {
            id: 1,
            mode: "translate",
            space: "world",
            nodeIds: [meshNodeId, cameraNodeId],
            anchorWorldMatrix: Array.from(createSelectionTransformControlMatrix([meshNode!, cameraNode!], "world").elements),
            nodes: {
                [meshNodeId]: createTransformSessionNodeState(meshNode!)!,
                [cameraNodeId]: createTransformSessionNodeState(cameraNode!)!,
            },
        },
        nextAnchorWorldMatrix: nextAnchor,
        snapSettings: DEFAULT_TRANSFORM_SNAP_SETTINGS,
    });

    assertTupleClose(drafts[meshNodeId]?.position, [3, 2, 3], "multi-node mesh position");
    assertTupleClose(drafts[cameraNodeId]?.position, [2, 0, 0], "multi-node camera position");
}

function testTransformHelpersQuantizeSnapDeterministically() {
    const snap = {
        enabled: true,
        translate: 0.25,
        rotate: Math.PI / 12,
        scale: 0.1,
    };

    const translatePatch = quantizeTransformPatchForMode(
        {
            position: [0.62, 0.13, -0.36],
        },
        "translate",
        snap,
    );
    const rotatePatch = quantizeTransformPatchForMode(
        {
            rotation: [0.19, 0.71, -0.2, 1],
        },
        "rotate",
        snap,
    );
    const scalePatch = quantizeTransformPatchForMode(
        {
            scale: [1.04, 0.96, 1.21],
        },
        "scale",
        snap,
    );

    assertTupleClose(translatePatch.position, [0.5, 0.25, -0.25], "translate snap");
    assertTupleClose(rotatePatch.rotation, [Math.PI / 12, Math.PI / 4, -Math.PI / 12, 1], "rotate snap");
    assertTupleClose(scalePatch.scale, [1, 1, 1.2], "scale snap");
}

function main() {
    const tests = [
        ["migration roundtrip", testMigrationRoundTrip],
        ["empty workspace migration uses deterministic viewer camera id", testEmptyWorkspaceMigrationUsesDeterministicViewerCameraId],
        ["workspace normalization uses deterministic fallback ids", testWorkspaceNormalizationUsesDeterministicFallbackIds],
        ["review normalization uses deterministic fallback issue identity", testReviewNormalizationUsesDeterministicFallbackIssueIdentity],
        ["document passthrough clone", testDocumentPassthroughClone],
        ["persisted graph embeds document", testPersistedSceneGraphEmbedsDocument],
        ["embedded document reconciles outer projection", testEmbeddedDocumentReconcilesOuterProjection],
        ["store draft commit undo redo", testStoreDraftCommitUndoRedo],
        ["store selection state", testStoreSelectionState],
        ["store multi-selection modes", testStoreMultiSelectionModes],
        ["editor session store state", testEditorSessionStoreState],
        ["renderable document uses draft transforms", testRenderableDocumentUsesDraftTransforms],
        ["renderable snapshot getter caches renderable document", testRenderableSceneSnapshotGetterCachesAndUsesDraftTransforms],
        ["compatibility workspace scene graph selector uses renderable document", testCompatibilityWorkspaceSceneGraphSelectorUsesRenderableDocument],
        ["store direct scene actions", testStoreDirectSceneActions],
        ["store structural scene actions", testStoreStructuralSceneActions],
        ["grouped node projection and embedded restore", testGroupedNodeProjectionAndEmbeddedRestore],
        ["store node authoring actions", testStoreNodeAuthoringActions],
        ["scene node registry projects runtime nodes", testSceneNodeRegistryProjectsRuntimeNodes],
        ["scene runtime reuses bindings across equivalent scene loads", testSceneRuntimeReusesBindingsAcrossEquivalentSceneLoads],
        ["scene runtime preserves bindings across visibility changes", testSceneRuntimePreservesBindingsAcrossVisibilityChanges],
        ["scene runtime disposes removed bindings", testSceneRuntimeDisposesRemovedBindings],
        ["scene runtime disposes bindings when lifecycle changes", testSceneRuntimeDisposesBindingsWhenLifecycleChanges],
        ["transform session commits single undo entry", testTransformSessionCommitsSingleUndoEntry],
        ["transform session cancel clears drafts", testTransformSessionCancelClearsDrafts],
        ["transform session skips locked nodes", testTransformSessionSkipsLockedNodes],
        ["transform helpers support multi-node drafts and local space", testTransformHelpersSupportMultiNodeDraftsAndLocalSpace],
        ["transform helpers quantize snap deterministically", testTransformHelpersQuantizeSnapDeterministically],
    ] as const;

    tests.forEach(([label, testFn]) => {
        testFn();
        console.log(`pass: ${label}`);
    });
}

main();
