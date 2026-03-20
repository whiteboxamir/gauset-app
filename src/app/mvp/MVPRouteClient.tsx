"use client";

import React, { useMemo, useRef } from "react";

import { MvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import type { MvpDirectUploadCapabilitySnapshot } from "@/lib/mvp-upload";
import { createEmptySceneDocumentV2 } from "@/lib/scene-graph/document.ts";
import { createMvpEditorSessionStore } from "@/state/mvpEditorSessionStore.ts";
import { createMvpSceneStore } from "@/state/mvpSceneStore.ts";
import { MvpEditorSessionStoreProvider } from "@/state/mvpEditorSessionStoreContext.tsx";
import { MvpSceneStoreProvider } from "@/state/mvpSceneStoreContext.tsx";

import type { WorkspaceLaunchSourceKind } from "./_hooks/mvpWorkspaceSessionShared";
import MVPWorkspaceRuntime from "./_components/MVPWorkspaceRuntime";
import { useMvpWorkspaceShellController } from "./_hooks/useMvpWorkspaceShellController";
import { useMvpWorkspaceSessionController } from "./_hooks/useMvpWorkspaceSessionController";
import { MvpWorkspaceShellProvider } from "./_state/mvpWorkspaceShellContext";
import { MvpWorkspaceSessionProvider } from "./_state/mvpWorkspaceSessionContext";

type MvpRouteVariant = "workspace" | "launchpad";

export default function MVPRouteClient({
    clarityMode = false,
    routeVariant = "workspace",
    launchSceneId = null,
    launchProjectId = null,
    launchEntryMode = null,
    launchIntent = null,
    launchBrief = null,
    launchReferences = null,
    launchProviderId = null,
    launchSourceKind = null,
    launchWorkspaceHref = null,
    launchPreviewHref = null,
    initialUploadCapability,
    deploymentFingerprint,
}: {
    clarityMode?: boolean;
    routeVariant?: MvpRouteVariant;
    launchSceneId?: string | null;
    launchProjectId?: string | null;
    launchEntryMode?: "workspace" | null;
    launchIntent?: "generate" | "capture" | "import" | null;
    launchBrief?: string | null;
    launchReferences?: string | null;
    launchProviderId?: string | null;
    launchSourceKind?: WorkspaceLaunchSourceKind | null;
    launchWorkspaceHref?: string | null;
    launchPreviewHref?: string | null;
    initialUploadCapability?: MvpDirectUploadCapabilitySnapshot;
    deploymentFingerprint: MvpDeploymentFingerprint;
}) {
    const sceneStoreRef = useRef(createMvpSceneStore(createEmptySceneDocumentV2()));
    const editorSessionStoreRef = useRef(createMvpEditorSessionStore());
    const editorSessionActions = useMemo(() => editorSessionStoreRef.current.getState().actions, []);

    const workspaceSession = useMvpWorkspaceSessionController({
        clarityMode,
        routeVariant,
        launchSceneId,
        launchProjectId,
        launchEntryMode,
        launchIntent,
        launchBrief,
        launchReferences,
        launchProviderId,
        launchSourceKind,
        sceneStore: sceneStoreRef.current,
        editorSessionActions,
    });
    const workspaceShell = useMvpWorkspaceShellController({
        sceneStore: sceneStoreRef.current,
    });

    return (
        <MvpEditorSessionStoreProvider store={editorSessionStoreRef.current}>
            <MvpSceneStoreProvider store={sceneStoreRef.current}>
                <MvpWorkspaceSessionProvider session={workspaceSession}>
                    <MvpWorkspaceShellProvider workspace={workspaceShell}>
                        <MVPWorkspaceRuntime
                            clarityMode={clarityMode}
                            routeVariant={routeVariant}
                            launchWorkspaceHref={launchWorkspaceHref}
                            launchPreviewHref={launchPreviewHref}
                            initialUploadCapability={initialUploadCapability}
                            deploymentFingerprint={deploymentFingerprint}
                        />
                    </MvpWorkspaceShellProvider>
                </MvpWorkspaceSessionProvider>
            </MvpSceneStoreProvider>
        </MvpEditorSessionStoreProvider>
    );
}
