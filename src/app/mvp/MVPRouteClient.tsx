"use client";

import React, { useMemo, useRef } from "react";

import { MvpDeploymentFingerprint } from "@/lib/mvp-deployment";
import { createEmptySceneDocumentV2 } from "@/lib/scene-graph/document.ts";
import { createMvpEditorSessionStore } from "@/state/mvpEditorSessionStore.ts";
import { createMvpSceneStore } from "@/state/mvpSceneStore.ts";
import { MvpEditorSessionStoreProvider } from "@/state/mvpEditorSessionStoreContext.tsx";
import { MvpSceneStoreProvider } from "@/state/mvpSceneStoreContext.tsx";

import MVPWorkspaceRuntime from "./_components/MVPWorkspaceRuntime";
import { useMvpWorkspaceShellController } from "./_hooks/useMvpWorkspaceShellController";
import { useMvpWorkspaceSessionController } from "./_hooks/useMvpWorkspaceSessionController";
import { MvpWorkspaceShellProvider } from "./_state/mvpWorkspaceShellContext";
import { MvpWorkspaceSessionProvider } from "./_state/mvpWorkspaceSessionContext";

type MvpRouteVariant = "workspace" | "preview";

export default function MVPRouteClient({
    clarityMode = false,
    routeVariant = "workspace",
    launchSceneId = null,
    deploymentFingerprint,
}: {
    clarityMode?: boolean;
    routeVariant?: MvpRouteVariant;
    launchSceneId?: string | null;
    deploymentFingerprint: MvpDeploymentFingerprint;
}) {
    const sceneStoreRef = useRef(createMvpSceneStore(createEmptySceneDocumentV2()));
    const editorSessionStoreRef = useRef(createMvpEditorSessionStore());
    const editorSessionActions = useMemo(() => editorSessionStoreRef.current.getState().actions, []);

    const workspaceSession = useMvpWorkspaceSessionController({
        clarityMode,
        routeVariant,
        launchSceneId,
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
                            deploymentFingerprint={deploymentFingerprint}
                        />
                    </MvpWorkspaceShellProvider>
                </MvpWorkspaceSessionProvider>
            </MvpSceneStoreProvider>
        </MvpEditorSessionStoreProvider>
    );
}
