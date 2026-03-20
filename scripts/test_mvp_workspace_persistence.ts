import assert from "node:assert/strict";

import {
    buildLocalDraftSessionKey,
    buildLocalDraftStorageKey,
    LEGACY_LOCAL_DRAFT_KEY,
    LOCAL_DRAFT_KEY_PREFIX,
    LOCAL_DRAFT_SESSION_KEY_PREFIX,
} from "../src/app/mvp/_hooks/mvpWorkspaceSessionShared.ts";
import {
    buildPersistenceFingerprint,
    chooseNextSceneSaveId,
    mergeQueuedSaveSource,
    resolveStoredDraftSource,
    shouldScheduleAutosave,
} from "../src/app/mvp/_hooks/mvpWorkspacePersistenceShared.ts";
import { createEmptySceneDocumentV2 } from "../src/lib/scene-graph/document.ts";

function testDraftKeyIsolation() {
    assert.equal(LEGACY_LOCAL_DRAFT_KEY, "gauset:mvp:draft:v1");
    assert.equal(LOCAL_DRAFT_KEY_PREFIX, "gauset:mvp:draft:v2");
    assert.equal(LOCAL_DRAFT_SESSION_KEY_PREFIX, "gauset:mvp:draft-session:v1");
    assert.equal(buildLocalDraftSessionKey("workspace"), "gauset:mvp:draft-session:v1:workspace");
    assert.equal(buildLocalDraftSessionKey("launchpad"), "gauset:mvp:draft-session:v1:preview");

    const workspaceKey = buildLocalDraftStorageKey({
        routeVariant: "workspace",
        studioId: "studio-123",
        userId: "user-abc",
    });
    const launchpadKey = buildLocalDraftStorageKey({
        routeVariant: "launchpad",
        studioId: "studio-123",
        userId: "user-abc",
    });
    const anonymousWorkspaceKey = buildLocalDraftStorageKey({
        routeVariant: "workspace",
        sessionId: "session-abc",
    });
    const anonymousLaunchpadKey = buildLocalDraftStorageKey({
        routeVariant: "launchpad",
        sessionId: "session-abc",
    });

    assert.notEqual(workspaceKey, launchpadKey);
    assert.equal(workspaceKey, "gauset:mvp:draft:v2:workspace:studio_studio-123:user_user-abc");
    assert.equal(launchpadKey, "gauset:mvp:draft:v2:preview:studio_studio-123:user_user-abc");
    assert.equal(anonymousWorkspaceKey, "gauset:mvp:draft:v2:workspace:studio_none:session_session-abc");
    assert.equal(anonymousLaunchpadKey, "gauset:mvp:draft:v2:preview:studio_none:session_session-abc");
    assert.notEqual(anonymousWorkspaceKey, anonymousLaunchpadKey);
}

function testLegacyDraftSelection() {
    assert.deepEqual(
        resolveStoredDraftSource({
            namespacedDraft: null,
            legacyDraft: "{\"legacy\":true}",
        }),
        {
            rawDraft: "{\"legacy\":true}",
            usedLegacyDraft: true,
        },
    );

    assert.deepEqual(
        resolveStoredDraftSource({
            namespacedDraft: "{\"namespaced\":true}",
            legacyDraft: "{\"legacy\":true}",
        }),
        {
            rawDraft: "{\"namespaced\":true}",
            usedLegacyDraft: false,
        },
    );
}

function testRestoreDoesNotAutosaveWithoutChanges() {
    const restoredDocument = createEmptySceneDocumentV2();
    const restoredFingerprint = buildPersistenceFingerprint("scene_restored", restoredDocument);

    assert.equal(
        shouldScheduleAutosave({
            hasHydrated: true,
            entryMode: "workspace",
            hasContent: true,
            autosaveUnlocked: true,
            persistenceFingerprint: restoredFingerprint,
            lastSavedFingerprint: restoredFingerprint,
        }),
        false,
    );

    assert.equal(
        shouldScheduleAutosave({
            hasHydrated: false,
            entryMode: "workspace",
            hasContent: true,
            autosaveUnlocked: true,
            persistenceFingerprint: restoredFingerprint,
            lastSavedFingerprint: "",
        }),
        false,
    );

    assert.equal(
        shouldScheduleAutosave({
            hasHydrated: true,
            entryMode: "launchpad",
            hasContent: true,
            autosaveUnlocked: true,
            persistenceFingerprint: restoredFingerprint,
            lastSavedFingerprint: "",
        }),
        false,
    );

    assert.equal(
        shouldScheduleAutosave({
            hasHydrated: true,
            entryMode: "workspace",
            hasContent: true,
            autosaveUnlocked: false,
            persistenceFingerprint: buildPersistenceFingerprint("scene_restored", {
                ...restoredDocument,
                rootIds: ["node_changed"],
            }),
            lastSavedFingerprint: restoredFingerprint,
        }),
        false,
    );

    assert.equal(
        shouldScheduleAutosave({
            hasHydrated: true,
            entryMode: "workspace",
            hasContent: true,
            autosaveUnlocked: true,
            persistenceFingerprint: buildPersistenceFingerprint("scene_restored", {
                ...restoredDocument,
                rootIds: ["node_changed"],
            }),
            lastSavedFingerprint: restoredFingerprint,
        }),
        true,
    );
}

function testFreshSceneManualAutosaveRaceResolution() {
    assert.equal(
        chooseNextSceneSaveId({
            activeScene: null,
            pendingSceneId: null,
            generatedSceneId: "scene_new",
        }),
        "scene_new",
    );
    assert.equal(
        chooseNextSceneSaveId({
            activeScene: null,
            pendingSceneId: "scene_pending",
            generatedSceneId: "scene_new",
        }),
        "scene_pending",
    );
    assert.equal(
        chooseNextSceneSaveId({
            activeScene: "scene_active",
            pendingSceneId: "scene_pending",
            generatedSceneId: "scene_new",
        }),
        "scene_active",
    );

    assert.equal(mergeQueuedSaveSource(null, "autosave"), "autosave");
    assert.equal(mergeQueuedSaveSource("autosave", "autosave"), "autosave");
    assert.equal(mergeQueuedSaveSource("autosave", "manual"), "manual");
    assert.equal(mergeQueuedSaveSource("manual", "autosave"), "manual");
}

testDraftKeyIsolation();
testLegacyDraftSelection();
testRestoreDoesNotAutosaveWithoutChanges();
testFreshSceneManualAutosaveRaceResolution();

console.log("MVP workspace persistence checks passed.");
