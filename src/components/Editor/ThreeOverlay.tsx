"use client";

import React, { Suspense } from "react";
import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import EnvironmentSplat from "./EnvironmentSplat";
import {
    InteractiveSingleImageFallbackSurface,
    SingleImagePreviewSurface,
    ThreeOverlayFallback,
} from "./ThreeOverlayFallbackSurfaces";
import { CameraRig } from "./ThreeOverlayCameraRig";
import { LoadingLabel } from "./ThreeOverlayLoadingLabel";
import { PinLayer } from "./ThreeOverlayPinLayer";
import { SceneAssetNode, SceneUtilityNode } from "./ThreeOverlaySceneAssets";
import { ThreeOverlayTransformControls } from "./ThreeOverlayTransformControls";
import {
    SceneBackgroundLock,
    TemporalAntialiasingComposer,
    ViewerContactShadows,
    ViewerGrid,
} from "./ThreeOverlayViewportPrimitives";
import { DEFAULT_EDITOR_VIEWER_BACKGROUND, EDITOR_CAMERA_FAR, EDITOR_CAMERA_NEAR, type AssetTransformPatch, type SceneAsset } from "./threeOverlayShared";
import { useThreeOverlaySurfaceController } from "./useThreeOverlaySurfaceController";
import type { ViewerRuntimeDiagnostics } from "./useThreeOverlayViewerRuntimeController";
import { useMvpWorkspaceThreeOverlayController } from "@/app/mvp/_hooks/useMvpWorkspaceThreeOverlayController";
import type { SceneTransformSessionState, SceneTransformSnapSettings, SceneTransformSpace } from "@/lib/render/transformSessions.ts";
import type { SceneDocumentV2, SceneNodeId, SceneToolMode } from "@/lib/scene-graph/types.ts";
import {
    type CameraPathFrame,
    type CameraPose,
    type SpatialPin,
    type SpatialPinType,
    type ViewerState,
    type WorkspaceSceneGraph,
} from "@/lib/mvp-workspace";
import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import type { MvpSceneSelectionMode } from "@/state/mvpSceneStore.ts";

export interface ThreeOverlayProps {
    environment: WorkspaceSceneGraph["environment"];
    assets: SceneAsset[];
    sceneDocument?: SceneDocumentV2;
    pins: SpatialPin[];
    viewer: ViewerState;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    isRecordingPath: boolean;
    onCapturePose: (pose: CameraPose) => void;
    onPathRecorded: (path: CameraPathFrame[]) => void;
    onViewerReadyChange: (ready: boolean) => void;
    readOnly?: boolean;
    backgroundColor?: string;
    selectedNodeIds?: SceneNodeId[];
    selectedPinId?: string | null;
    selectedAssetInstanceIds?: string[];
    transformSpace?: SceneTransformSpace;
    transformSnap?: SceneTransformSnapSettings;
    transformSession?: SceneTransformSessionState | null;
    onSelectNode?: (nodeId: SceneNodeId, options?: { mode?: MvpSceneSelectionMode }) => void;
    activeTool?: SceneToolMode;
    onSelectPin?: (pinId: string | null) => void;
    onClearSelection?: () => void;
    onSelectAsset?: (instanceId: string, options?: { mode?: MvpSceneSelectionMode }) => void;
    onBeginTransformSession?: (session: {
        nodeIds: SceneNodeId[];
        mode: Exclude<SceneToolMode, "select">;
        space: SceneTransformSpace;
        anchorWorldMatrix: number[];
        nodes: SceneTransformSessionState["nodes"];
    }) => void;
    onUpdateTransformSessionDrafts?: (drafts: Record<SceneNodeId, AssetTransformPatch>) => void;
    onCancelTransformSession?: () => void;
    onCommitTransformSession?: () => void;
    onUpdateNodeTransformDraft?: (nodeId: SceneNodeId, patch: AssetTransformPatch) => void;
    onUpdateAssetTransformDraft?: (instanceId: string, patch: AssetTransformPatch) => void;
    onCommitSceneTransforms?: () => void;
    onAppendPin?: (pin: SpatialPin) => void;
}

interface ThreeOverlayConnectedProps {
    readOnly?: boolean;
    backgroundColor?: string;
    onCapturePose: (pose: CameraPose) => void;
    onPathRecorded: (path: CameraPathFrame[]) => void;
}

class CanvasErrorBoundary extends React.Component<
    {
        onError: (error: Error) => void;
        children: React.ReactNode;
    },
    { hasError: boolean }
> {
    constructor(props: { onError: (error: Error) => void; children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        this.props.onError(error);
    }

    render() {
        if (this.state.hasError) {
            return null;
        }
        return this.props.children;
    }
}

const ViewerRuntimeBadge = React.memo(function ViewerRuntimeBadge({
    diagnostics,
}: {
    diagnostics: ViewerRuntimeDiagnostics;
}) {
    const toneClass =
        diagnostics.operationalMode === "webgl_live"
            ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-100"
            : diagnostics.operationalMode === "interactive_projection" || diagnostics.operationalMode === "interactive_fallback"
              ? "border-sky-400/30 bg-sky-500/12 text-sky-100"
              : diagnostics.operationalMode === "projection_only"
                ? "border-cyan-400/30 bg-cyan-500/12 text-cyan-100"
                : diagnostics.operationalMode === "booting"
                  ? "border-amber-400/30 bg-amber-500/12 text-amber-100"
                  : "border-rose-400/30 bg-rose-500/12 text-rose-100";

    return (
        <div className="pointer-events-none absolute right-4 top-4 z-30 flex max-w-[22rem] flex-col items-end gap-2">
            <div
                className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] shadow-[0_14px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl ${toneClass}`}
                data-testid="mvp-viewer-runtime-badge"
            >
                {diagnostics.label}
            </div>
            {diagnostics.detail && diagnostics.operationalMode !== "webgl_live" ? (
                <div className="rounded-2xl border border-black/30 bg-black/45 px-3 py-2 text-right text-[11px] leading-5 text-neutral-100 shadow-[0_20px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                    {diagnostics.detail}
                </div>
            ) : null}
        </div>
    );
});

const ThreeOverlay = React.memo(function ThreeOverlay({
    environment,
    assets,
    sceneDocument,
    pins,
    viewer,
    focusRequest,
    captureRequestKey,
    isPinPlacementEnabled,
    pinType,
    isRecordingPath,
    onCapturePose,
    onPathRecorded,
    onViewerReadyChange,
    readOnly = false,
    backgroundColor = DEFAULT_EDITOR_VIEWER_BACKGROUND,
    selectedNodeIds = [],
    selectedPinId = null,
    selectedAssetInstanceIds = [],
    transformSpace = "world",
    transformSnap,
    transformSession = null,
    onSelectNode,
    activeTool = "select",
    onSelectPin,
    onClearSelection,
    onSelectAsset,
    onBeginTransformSession,
    onUpdateTransformSessionDrafts,
    onCancelTransformSession,
    onCommitTransformSession,
    onUpdateNodeTransformDraft,
    onUpdateAssetTransformDraft,
    onCommitSceneTransforms,
    onAppendPin,
}: ThreeOverlayProps) {
    const overlaySurface = useThreeOverlaySurfaceController({
        environment,
        viewer,
        sceneDocument,
        focusRequest,
        captureRequestKey,
        isPinPlacementEnabled,
        pinType,
        readOnly,
        backgroundColor,
        selectedNodeIds,
        selectedAssetInstanceIds,
        onViewerReadyChange,
        onSelectPin,
        onClearSelection,
        onSelectNode,
        onSelectAsset,
        onUpdateNodeTransformDraft,
        onUpdateAssetTransformDraft,
        onCommitSceneTransforms,
        onAppendPin,
    });
    const usesRuntimeRegistry = Boolean(sceneDocument);

    let surfaceContent: React.ReactNode;

    if (overlaySurface.shouldUsePreviewProjectionFallback && overlaySurface.previewProjectionImage) {
        surfaceContent = <SingleImagePreviewSurface imageUrl={overlaySurface.previewProjectionImage} />;
    } else if (overlaySurface.usesInteractiveFallback && overlaySurface.interactiveFallbackImage) {
        surfaceContent = (
            <InteractiveSingleImageFallbackSurface
                imageUrl={overlaySurface.interactiveFallbackImage}
                viewer={viewer}
                pins={pins}
                selectedPinId={selectedPinId}
                isPinPlacementEnabled={isPinPlacementEnabled}
                pinType={pinType}
                isRecordingPath={isRecordingPath}
                focusRequest={overlaySurface.effectiveFocusRequest}
                captureRequestKey={captureRequestKey}
                readOnly={readOnly}
                onAddPin={overlaySurface.addPin}
                onSelectPin={overlaySurface.selectPin}
                onCapturePose={onCapturePose}
                onPathRecorded={onPathRecorded}
                onClearSelection={overlaySurface.clearSceneSelection}
            />
        );
    } else if (overlaySurface.renderMode === "fallback") {
        surfaceContent = <ThreeOverlayFallback message={overlaySurface.renderError} referenceImage={overlaySurface.referenceImage} />;
    } else {
        surfaceContent = (
            <CanvasErrorBoundary onError={overlaySurface.handleCanvasError}>
                <Canvas
                    camera={{ position: [5, 4, 6], fov: viewer.fov, near: EDITOR_CAMERA_NEAR, far: EDITOR_CAMERA_FAR }}
                    dpr={overlaySurface.isSingleImagePreview ? [1, 2] : [1, 3]}
                    style={{ background: backgroundColor, touchAction: "none" }}
                    gl={{
                        powerPreference: "high-performance",
                        antialias: true,
                        alpha: true,
                        depth: true,
                        stencil: false,
                    }}
                    shadows={!overlaySurface.isSingleImagePreview}
                    onCreated={({ gl }) => {
                        overlaySurface.handleCanvasCreated(gl);
                    }}
                    onPointerMissed={overlaySurface.clearSceneSelection}
                >
                    <SceneBackgroundLock backgroundColor={backgroundColor} />
                    {!overlaySurface.isSingleImagePreview ? <TemporalAntialiasingComposer /> : null}
                    <ambientLight intensity={overlaySurface.isSingleImagePreview ? 0.35 : 0.65} />
                    {!overlaySurface.isSingleImagePreview ? <directionalLight position={[8, 12, 6]} intensity={1.2} castShadow /> : null}

                    <OrbitControls ref={overlaySurface.controlsRef} makeDefault enableDamping dampingFactor={0.08} />
                    {!overlaySurface.isSingleImagePreview ? <Environment preset="city" background={false} /> : null}
                    <CameraRig
                        viewerFov={viewer.fov}
                        controlsRef={overlaySurface.controlsRef}
                        focusRequest={overlaySurface.effectiveFocusRequest}
                        captureRequestKey={captureRequestKey}
                        onCapturePose={onCapturePose}
                        isRecordingPath={isRecordingPath}
                        onPathRecorded={onPathRecorded}
                    />

                    {!overlaySurface.isSingleImagePreview ? (
                        <>
                            <ViewerGrid />
                            <ViewerContactShadows />
                        </>
                    ) : null}

                    {overlaySurface.environmentSplatUrl || overlaySurface.environmentViewerUrl ? (
                        <Suspense fallback={<LoadingLabel text="Loading environment splat..." />}>
                            <EnvironmentSplat
                                plyUrl={overlaySurface.environmentSplatUrl}
                                viewerUrl={overlaySurface.environmentViewerUrl}
                                metadata={overlaySurface.environmentMetadata}
                                onPreviewBounds={overlaySurface.handlePreviewBounds}
                                onFatalError={overlaySurface.handleEnvironmentFatalError}
                            />
                        </Suspense>
                    ) : null}

                    {usesRuntimeRegistry
                        ? overlaySurface.runtimeMeshNodes.map((node) => (
                              <SceneAssetNode
                                  key={`${node.nodeId}:${node.lifecycleKey}`}
                                  asset={{
                                      ...(node.metadata ?? {}),
                                      instanceId: node.instanceId,
                                      nodeId: node.nodeId,
                                      name: node.name,
                                      mesh: node.meshUrl ?? undefined,
                                      position: node.worldTransform.position,
                                      rotation: [
                                          node.worldTransform.rotation[0],
                                          node.worldTransform.rotation[1],
                                          node.worldTransform.rotation[2],
                                      ],
                                      scale: node.worldTransform.scale,
                                      visible: node.effectiveVisible,
                                      locked: node.effectiveLocked,
                                      parentWorldMatrix: node.parentWorldMatrix,
                                  }}
                                  lifecycleKey={node.lifecycleKey}
                                  sceneRuntime={overlaySurface.sceneRuntime}
                                  updateAssetTransform={overlaySurface.updateAssetTransform}
                                  updateNodeTransform={overlaySurface.updateNodeTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedNodeIdSet.has(node.nodeId)}
                                  activeTool={activeTool}
                                  showControls={!usesRuntimeRegistry}
                                  onSelect={(event) => overlaySurface.selectSceneNode(node.nodeId, event)}
                              />
                          ))
                        : assets.map((asset, index) => (
                              <SceneAssetNode
                                  key={asset.instanceId || `${asset.name}-${index}`}
                                  asset={asset}
                                  updateAssetTransform={overlaySurface.updateAssetTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedAssetInstanceIdSet.has(asset.instanceId)}
                                  activeTool={activeTool}
                                  onSelect={(event) => overlaySurface.selectSceneAsset(asset.instanceId, event)}
                              />
                          ))}

                    {usesRuntimeRegistry
                        ? overlaySurface.runtimeCameraNodes.map((node) => (
                              <SceneUtilityNode
                                  key={`${node.nodeId}:${node.lifecycleKey}`}
                                  node={node}
                                  sceneRuntime={overlaySurface.sceneRuntime}
                                  updateNodeTransform={overlaySurface.updateNodeTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedNodeIdSet.has(node.nodeId)}
                                  activeTool={activeTool}
                                  showControls={!usesRuntimeRegistry}
                                  onSelect={(event) => overlaySurface.selectSceneNode(node.nodeId, event)}
                              />
                          ))
                        : null}

                    {usesRuntimeRegistry
                        ? overlaySurface.runtimeLightNodes.map((node) => (
                              <SceneUtilityNode
                                  key={`${node.nodeId}:${node.lifecycleKey}`}
                                  node={node}
                                  sceneRuntime={overlaySurface.sceneRuntime}
                                  updateNodeTransform={overlaySurface.updateNodeTransform}
                                  onCommitTransform={overlaySurface.commitSceneTransforms}
                                  readOnly={readOnly}
                                  selected={overlaySurface.selectedNodeIdSet.has(node.nodeId)}
                                  activeTool={activeTool}
                                  showControls={!usesRuntimeRegistry}
                                  onSelect={(event) => overlaySurface.selectSceneNode(node.nodeId, event)}
                              />
                          ))
                        : null}

                    {usesRuntimeRegistry ? (
                        <ThreeOverlayTransformControls
                            sceneNodeRegistry={overlaySurface.sceneNodeRegistry}
                            selectedNodeIds={selectedNodeIds}
                            activeTool={activeTool}
                            readOnly={readOnly}
                            transformSpace={transformSpace}
                            transformSnap={
                                transformSnap ?? {
                                    enabled: false,
                                    translate: 0.5,
                                    rotate: Math.PI / 12,
                                    scale: 0.1,
                                }
                            }
                            transformSession={transformSession}
                            onBeginTransformSession={onBeginTransformSession}
                            onUpdateTransformSessionDrafts={onUpdateTransformSessionDrafts}
                            onCancelTransformSession={onCancelTransformSession}
                            onCommitTransformSession={onCommitTransformSession}
                        />
                    ) : null}

                    <PinLayer
                        pins={pins}
                        selectedPinId={selectedPinId}
                        isPlacingPin={isPinPlacementEnabled}
                        pinType={pinType}
                        readOnly={readOnly}
                        onAddPin={overlaySurface.addPin}
                        onSelectPin={overlaySurface.selectPin}
                    />
                </Canvas>
            </CanvasErrorBoundary>
        );
    }

    return (
        <div className="absolute inset-0 pointer-events-auto z-20">
            <div
                data-testid="mvp-viewer-runtime-diagnostics"
                data-host-capability-lane={overlaySurface.runtimeDiagnostics.hostCapabilityLane}
                data-operational-mode={overlaySurface.runtimeDiagnostics.operationalMode}
                data-operational-lane={overlaySurface.runtimeDiagnostics.operationalLane}
                data-coverage={overlaySurface.runtimeDiagnostics.coverage}
                data-render-source-mode={overlaySurface.runtimeDiagnostics.renderSourceMode}
                data-render-mode={overlaySurface.runtimeDiagnostics.renderMode}
                data-fallback-reason={overlaySurface.runtimeDiagnostics.fallbackReason ?? "none"}
                data-fallback-message={overlaySurface.runtimeDiagnostics.fallbackMessage || ""}
                data-has-renderable-environment={overlaySurface.runtimeDiagnostics.hasRenderableEnvironment ? "true" : "false"}
                data-is-single-image-preview={overlaySurface.runtimeDiagnostics.isSingleImagePreview ? "true" : "false"}
                data-preview-projection-available={overlaySurface.runtimeDiagnostics.previewProjectionAvailable ? "true" : "false"}
                data-reference-image-available={overlaySurface.runtimeDiagnostics.referenceImageAvailable ? "true" : "false"}
                data-viewer-ready={overlaySurface.runtimeDiagnostics.isViewerReady ? "true" : "false"}
                data-max-texture-size={
                    overlaySurface.runtimeDiagnostics.maxTextureSize === null
                        ? "unknown"
                        : String(overlaySurface.runtimeDiagnostics.maxTextureSize)
                }
                data-label={overlaySurface.runtimeDiagnostics.label}
                data-detail={overlaySurface.runtimeDiagnostics.detail}
                hidden
            />
            <ViewerRuntimeBadge diagnostics={overlaySurface.runtimeDiagnostics} />
            {surfaceContent}
        </div>
    );
});

export const ThreeOverlayConnected = React.memo(function ThreeOverlayConnected({
    readOnly = false,
    backgroundColor,
    onCapturePose,
    onPathRecorded,
}: ThreeOverlayConnectedProps) {
    const workspaceThreeOverlay = useMvpWorkspaceThreeOverlayController();

    return (
        <ThreeOverlay
            {...workspaceThreeOverlay}
            onCapturePose={onCapturePose}
            onPathRecorded={onPathRecorded}
            readOnly={readOnly}
            backgroundColor={backgroundColor}
        />
    );
});

export default ThreeOverlay;
