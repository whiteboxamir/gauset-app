import assert from "node:assert/strict";

import { createEmptyWorkspaceSceneGraph } from "../src/lib/mvp-workspace.ts";
import { migratePersistedSceneGraphV1ToSceneDocumentV2, migrateSceneDocumentToWorkspace, migrateSceneGraphToSceneDocument } from "../src/lib/scene-graph/migrate.ts";
import { normalizePersistedSceneGraph, SCENE_DOCUMENT_V2_FIELD, serializeSceneDocumentToPersistedSceneGraph } from "../src/lib/scene-graph/workspaceAdapter.ts";
import { createMvpEditorSessionStore, getMvpEditorSessionStoreActions } from "../src/state/mvpEditorSessionStore.ts";
import { selectRenderableSceneDocument } from "../src/state/mvpSceneSelectors.ts";
import { createMvpSceneStore, getSceneStoreActions } from "../src/state/mvpSceneStore.ts";

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

function testMigrationRoundTrip() {
    const workspaceGraph = createSampleWorkspaceSceneGraph();
    const document = migratePersistedSceneGraphV1ToSceneDocumentV2(workspaceGraph);

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
    assert.equal(workspaceRoundTrip.camera_views[0]?.label, "Hero View");
    assert.equal(workspaceRoundTrip.pins[0]?.label, "Key note");
    assert.equal(workspaceRoundTrip.director_brief, "Hold the frame on the chair.");
    assert.equal(workspaceRoundTrip.viewer.fov, 50);
    assert.equal(workspaceRoundTrip.environment?.urls?.splats, "/api/mvp/storage/scenes/scene_sample/environment/splats.ply");
    assert.equal(workspaceRoundTrip.assets[0]?.mesh, "/api/mvp/storage/assets/asset_chair/mesh.glb");
}

function testDocumentPassthroughClone() {
    const sourceDocument = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const migratedDocument = migrateSceneGraphToSceneDocument(sourceDocument);

    assert.deepEqual(migratedDocument, sourceDocument);
    assert.notEqual(migratedDocument, sourceDocument);
}

function testPersistedSceneGraphEmbedsDocument() {
    const sourceDocument = migratePersistedSceneGraphV1ToSceneDocumentV2(createSampleWorkspaceSceneGraph());
    const persistedGraph = serializeSceneDocumentToPersistedSceneGraph(sourceDocument);

    assert.equal((persistedGraph as Record<string, unknown>)[SCENE_DOCUMENT_V2_FIELD] !== undefined, true);

    const normalizedPersistedGraph = normalizePersistedSceneGraph(persistedGraph);
    const restoredDocument = migrateSceneGraphToSceneDocument(normalizedPersistedGraph);

    assert.deepEqual(restoredDocument, sourceDocument);
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

function main() {
    const tests = [
        ["migration roundtrip", testMigrationRoundTrip],
        ["document passthrough clone", testDocumentPassthroughClone],
        ["persisted graph embeds document", testPersistedSceneGraphEmbedsDocument],
        ["store draft commit undo redo", testStoreDraftCommitUndoRedo],
        ["store selection state", testStoreSelectionState],
        ["editor session store state", testEditorSessionStoreState],
        ["renderable document uses draft transforms", testRenderableDocumentUsesDraftTransforms],
        ["store direct scene actions", testStoreDirectSceneActions],
        ["store structural scene actions", testStoreStructuralSceneActions],
    ] as const;

    tests.forEach(([label, testFn]) => {
        testFn();
        console.log(`pass: ${label}`);
    });
}

main();
