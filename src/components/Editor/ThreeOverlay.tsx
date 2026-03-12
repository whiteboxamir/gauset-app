"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Html, OrbitControls, PivotControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { TAARenderPass } from "three/examples/jsm/postprocessing/TAARenderPass.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MapPin } from "lucide-react";
import EnvironmentSplat from "./EnvironmentSplat";
import { toProxyUrl } from "@/lib/mvp-api";
import { resolveEnvironmentRenderState } from "@/lib/mvp-product";
import { useSceneActiveTool, useSceneSelectedNodeIds, useSceneSelectedPinId } from "@/state/mvpSceneEditorSelectors.ts";
import {
    useEditorSessionCaptureRequestKey,
    useEditorSessionFocusRequest,
    useEditorSessionPinPlacementEnabled,
    useEditorSessionPinType,
    useEditorSessionRecordingPath,
} from "@/state/mvpEditorSessionSelectors.ts";
import type { FocusRequest } from "@/state/mvpEditorSessionStore.ts";
import { useMvpEditorSessionStoreActions } from "@/state/mvpEditorSessionStoreContext.tsx";
import { useMvpSceneStoreActions, useRenderableSceneDocumentSelector } from "@/state/mvpSceneStoreContext.tsx";
import { useSceneAssetsSlice, useSceneEnvironmentSlice, useScenePinsSlice, useSceneViewerSlice } from "@/state/mvpSceneWorkspaceSelectors.ts";
import { classifyViewerFailure, isSingleImagePreviewMetadata, resolveViewerCapabilities, ViewerFallbackReason } from "@/lib/mvp-viewer";
import {
    CameraPathFrame,
    CameraPose,
    SpatialPin,
    SpatialPinType,
    Vector3Tuple,
    ViewerState,
    WorkspaceSceneGraph,
    createId,
    fovToLensMm,
    formatPinTypeLabel,
    nowIso,
    parseVector3Tuple,
} from "@/lib/mvp-workspace";
import type { SceneDocumentV2, SceneToolMode } from "@/lib/scene-graph/types.ts";

type TransformTuple = [number, number, number];

type SceneAsset = {
    instanceId: string;
    name: string;
    mesh?: string;
    position?: TransformTuple;
    rotation?: TransformTuple;
    scale?: TransformTuple;
};

type ParsedMeshAsset = {
    format: "glb" | "gltf" | "obj";
    scene: THREE.Object3D;
};

const EDITOR_CAMERA_NEAR = 0.01;
const EDITOR_CAMERA_FAR = 500;
const DEFAULT_EDITOR_VIEWER_BACKGROUND = "#0a0a0a";
const PREVIEW_CAMERA_ORIENTATION_QUATERNION = new THREE.Quaternion(1, 0, 0, 0);
const INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH = 5;
const INTERACTIVE_FALLBACK_WORLD_HALF_HEIGHT = 3;
const INTERACTIVE_FALLBACK_CAMERA_HEIGHT = 1.6;
const INTERACTIVE_FALLBACK_CAMERA_DISTANCE = 6;
const INTERACTIVE_FALLBACK_PATH_SAMPLE_MS = 80;
const sceneBackgroundScratchColor = new THREE.Color();

type TAARenderPassInternal = TAARenderPass & { accumulateIndex: number };
type MeshNodeIdByInstanceId = Record<string, string>;
type AssetTransformPatch = {
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
};

type ThreeOverlayFallbackProps = {
    message?: string;
    referenceImage?: string | null;
};

export interface ThreeOverlayProps {
    environment: WorkspaceSceneGraph["environment"];
    assets: SceneAsset[];
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
    selectedPinId?: string | null;
    selectedAssetInstanceIds?: string[];
    activeTool?: SceneToolMode;
    onSelectPin?: (pinId: string | null) => void;
    onClearSelection?: () => void;
    onSelectAsset?: (instanceId: string) => void;
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

function jsonValueEqual<T>(previous: T, next: T) {
    return JSON.stringify(previous) === JSON.stringify(next);
}

function selectMeshNodeIdByInstanceId(document: SceneDocumentV2): MeshNodeIdByInstanceId {
    return Object.fromEntries(
        Object.entries(document.meshes).flatMap(([nodeId, mesh]) => {
            const metadata = mesh?.metadata ?? {};
            const instanceId =
                typeof metadata.instanceId === "string" && metadata.instanceId
                    ? metadata.instanceId
                    : typeof metadata.instance_id === "string" && metadata.instance_id
                      ? metadata.instance_id
                      : null;
            return instanceId ? [[instanceId, nodeId]] : [];
        }),
    );
}

function resolvePivotToolConfig(tool: SceneToolMode) {
    switch (tool) {
        case "translate":
            return {
                visible: true,
                disableAxes: false,
                disableSliders: false,
                disableRotations: true,
                disableScaling: true,
            };
        case "rotate":
            return {
                visible: true,
                disableAxes: true,
                disableSliders: true,
                disableRotations: false,
                disableScaling: true,
            };
        case "scale":
            return {
                visible: true,
                disableAxes: true,
                disableSliders: true,
                disableRotations: true,
                disableScaling: false,
            };
        default:
            return {
                visible: false,
                disableAxes: true,
                disableSliders: true,
                disableRotations: true,
                disableScaling: true,
            };
    }
}

function isSingleImagePreviewEnvironment(metadata: any) {
    return isSingleImagePreviewMetadata(metadata);
}

function shouldApplyPreviewOrientation(metadata: any) {
    if (typeof metadata?.rendering?.apply_preview_orientation === "boolean") {
        return metadata.rendering.apply_preview_orientation;
    }

    return isSingleImagePreviewEnvironment(metadata);
}

function rotatePreviewCameraVector(tuple: Vector3Tuple) {
    const rotated = new THREE.Vector3(...tuple).applyQuaternion(PREVIEW_CAMERA_ORIENTATION_QUATERNION);
    return [rotated.x, rotated.y, rotated.z] as Vector3Tuple;
}

function resolveSingleImagePreviewCamera(metadata: any): (CameraPose & { up?: Vector3Tuple }) | null {
    const sourceCamera = metadata?.source_camera;
    if (!sourceCamera || typeof sourceCamera !== "object") {
        return null;
    }

    const applyOrientation = shouldApplyPreviewOrientation(metadata);
    const position = parseVector3Tuple(sourceCamera.position, [0, 0, 0]);
    const target = parseVector3Tuple(sourceCamera.target, [0, 0, 1]);
    const up = parseVector3Tuple(sourceCamera.up, [0, 1, 0]);
    const orientedPosition = applyOrientation ? rotatePreviewCameraVector(position) : position;
    const orientedTarget = applyOrientation ? rotatePreviewCameraVector(target) : target;
    const orientedUp = applyOrientation ? rotatePreviewCameraVector(up) : up;
    const explicitFov = Number(sourceCamera.fov_degrees ?? NaN);
    const focalLengthPx = Number(sourceCamera.focal_length_px ?? NaN);
    const resolutionPx = Array.isArray(sourceCamera.resolution_px) ? sourceCamera.resolution_px.map((value: unknown) => Number(value)) : [];
    const imageHeightPx = Number.isFinite(resolutionPx[1]) ? Math.max(1, resolutionPx[1]) : NaN;
    const derivedFov =
        Number.isFinite(explicitFov) && explicitFov > 1
            ? explicitFov
            : Number.isFinite(focalLengthPx) && focalLengthPx > 1 && Number.isFinite(imageHeightPx)
              ? (2 * Math.atan(imageHeightPx / (2 * focalLengthPx)) * 180) / Math.PI
              : NaN;
    const fov = Number.isFinite(derivedFov) && derivedFov > 1 ? derivedFov : 45;

    return {
        position: orientedPosition,
        target: orientedTarget,
        up: orientedUp,
        fov,
        lens_mm: Math.round(fovToLensMm(fov) * 10) / 10,
    };
}

function applyEditorCameraClipping(camera: THREE.PerspectiveCamera) {
    camera.near = EDITOR_CAMERA_NEAR;
    camera.far = EDITOR_CAMERA_FAR;
}

function LoadingLabel({ text }: { text: string }) {
    return (
        <Html center>
            <div className="text-xs px-3 py-1 rounded bg-neutral-950/80 border border-neutral-700 text-neutral-300">{text}</div>
        </Html>
    );
}

function ThreeOverlayFallback({ message, referenceImage }: ThreeOverlayFallbackProps) {
    return (
        <div className="absolute inset-0 z-20 overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_22%),linear-gradient(180deg,#06080b_0%,#040507_100%)]">
            {referenceImage ? (
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-30"
                    style={{ backgroundImage: `url(${referenceImage})` }}
                />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,6,9,0.72),rgba(4,5,7,0.94))]" />
            <div className="relative flex h-full items-center justify-center p-6">
                <div className="w-full max-w-lg rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(10,14,21,0.94),rgba(7,10,14,0.94))] p-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/80">Viewer fallback</p>
                    <p className="mt-3 text-lg font-medium text-white">3D viewer unavailable</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-200">
                        {message || "This browser or environment could not initialize the WebGL viewer. Import, review, export, and other non-3D controls remain available."}
                    </p>
                    <p className="mt-3 text-[11px] leading-5 text-neutral-300">
                        Camera capture, scene-note placement, and path recording stay disabled until the viewer can create a render context.
                    </p>
                </div>
            </div>
        </div>
    );
}

function SingleImagePreviewSurface({ imageUrl }: { imageUrl: string }) {
    return (
        <div className="absolute inset-0 z-20 overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#040507_0%,#020304_100%)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%)]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
            />
        </div>
    );
}

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function createInteractiveFallbackPoseFromNormalizedPoint(xNorm: number, yNorm: number, viewer: ViewerState): CameraPose {
    const targetX = (clamp01(xNorm) - 0.5) * INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH * 2;
    const targetY = (0.5 - clamp01(yNorm)) * INTERACTIVE_FALLBACK_WORLD_HALF_HEIGHT * 2;

    return {
        position: [targetX, targetY + INTERACTIVE_FALLBACK_CAMERA_HEIGHT, INTERACTIVE_FALLBACK_CAMERA_DISTANCE],
        target: [targetX, targetY, 0],
        fov: viewer.fov,
        lens_mm: viewer.lens_mm,
    };
}

function projectInteractiveFallbackPin(position: Vector3Tuple) {
    return {
        left: clamp01((position[0] + INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH) / (INTERACTIVE_FALLBACK_WORLD_HALF_WIDTH * 2)) * 100,
        top: clamp01(0.5 - position[1] / (INTERACTIVE_FALLBACK_WORLD_HALF_HEIGHT * 2)) * 100,
    };
}

function InteractiveSingleImageFallbackSurface({
    imageUrl,
    viewer,
    pins,
    selectedPinId,
    isPinPlacementEnabled,
    pinType,
    isRecordingPath,
    focusRequest,
    captureRequestKey,
    readOnly,
    onAddPin,
    onSelectPin,
    onCapturePose,
    onPathRecorded,
    onClearSelection,
}: {
    imageUrl: string;
    viewer: ViewerState;
    pins: SpatialPin[];
    selectedPinId: string | null;
    isPinPlacementEnabled: boolean;
    pinType: SpatialPinType;
    isRecordingPath: boolean;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    readOnly: boolean;
    onAddPin: (pin: SpatialPin) => void;
    onSelectPin: (pinId: string | null) => void;
    onCapturePose?: (pose: CameraPose) => void;
    onPathRecorded?: (path: CameraPathFrame[]) => void;
    onClearSelection: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dragActiveRef = useRef(false);
    const dragDistanceRef = useRef(0);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const currentPoseRef = useRef<CameraPose>(createInteractiveFallbackPoseFromNormalizedPoint(0.5, 0.5, viewer));
    const pathRef = useRef<CameraPathFrame[]>([]);
    const lastCaptureRequestRef = useRef(0);
    const lastFocusTokenRef = useRef(0);
    const recordingStartRef = useRef(0);
    const lastSampleTimeRef = useRef(-1);
    const [currentPose, setCurrentPose] = useState<CameraPose>(() => createInteractiveFallbackPoseFromNormalizedPoint(0.5, 0.5, viewer));

    useEffect(() => {
        currentPoseRef.current = currentPose;
    }, [currentPose]);

    useEffect(() => {
        setCurrentPose((previous) => ({
            ...previous,
            fov: viewer.fov,
            lens_mm: viewer.lens_mm,
        }));
    }, [viewer.fov, viewer.lens_mm]);

    useEffect(() => {
        if (!focusRequest || focusRequest.token === lastFocusTokenRef.current) {
            return;
        }

        lastFocusTokenRef.current = focusRequest.token;
        setCurrentPose({
            position: focusRequest.position,
            target: focusRequest.target,
            fov: focusRequest.fov,
            lens_mm: focusRequest.lens_mm,
            up: focusRequest.up,
        });
    }, [focusRequest]);

    useEffect(() => {
        if (!onCapturePose || captureRequestKey === 0 || captureRequestKey === lastCaptureRequestRef.current) {
            return;
        }

        lastCaptureRequestRef.current = captureRequestKey;
        onCapturePose(currentPoseRef.current);
    }, [captureRequestKey, onCapturePose]);

    useEffect(() => {
        if (isRecordingPath) {
            pathRef.current = [];
            recordingStartRef.current = 0;
            lastSampleTimeRef.current = -1;
            return;
        }

        dragActiveRef.current = false;
        if (pathRef.current.length > 0 && onPathRecorded) {
            onPathRecorded([...pathRef.current]);
        }
        pathRef.current = [];
    }, [isRecordingPath, onPathRecorded]);

    const resolvePointerPoint = React.useCallback(
        (clientX: number, clientY: number) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect || rect.width <= 0 || rect.height <= 0) {
                return null;
            }

            const xNorm = clamp01((clientX - rect.left) / rect.width);
            const yNorm = clamp01((clientY - rect.top) / rect.height);
            return {
                xNorm,
                yNorm,
                pose: createInteractiveFallbackPoseFromNormalizedPoint(xNorm, yNorm, viewer),
            };
        },
        [viewer],
    );

    const appendPathFrame = React.useCallback((pose: CameraPose, timestampMs: number) => {
        if (!isRecordingPath) {
            return;
        }

        if (recordingStartRef.current === 0) {
            recordingStartRef.current = timestampMs;
        }

        const elapsedSeconds = (timestampMs - recordingStartRef.current) / 1000;
        if (lastSampleTimeRef.current >= 0 && timestampMs - lastSampleTimeRef.current < INTERACTIVE_FALLBACK_PATH_SAMPLE_MS) {
            return;
        }

        lastSampleTimeRef.current = timestampMs;
        pathRef.current.push({
            time: Number(elapsedSeconds.toFixed(3)),
            position: pose.position,
            target: pose.target,
            rotation: [0, 0, 0, 1],
            fov: pose.fov,
        });
    }, [isRecordingPath]);

    return (
        <div className="absolute inset-0 z-20 overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#040507_0%,#020304_100%)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%)]" />
            <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full touch-none bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${imageUrl})` }}
                onPointerDown={(event) => {
                    if (readOnly || !isRecordingPath) {
                        dragActiveRef.current = false;
                        dragDistanceRef.current = 0;
                        lastPointerRef.current = { x: event.clientX, y: event.clientY };
                        return;
                    }

                    const point = resolvePointerPoint(event.clientX, event.clientY);
                    if (!point) {
                        return;
                    }

                    dragActiveRef.current = true;
                    dragDistanceRef.current = 0;
                    lastPointerRef.current = { x: event.clientX, y: event.clientY };
                    setCurrentPose(point.pose);
                    appendPathFrame(point.pose, performance.now());
                }}
                onPointerMove={(event) => {
                    const previousPointer = lastPointerRef.current;
                    if (previousPointer) {
                        dragDistanceRef.current += Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y);
                    }
                    lastPointerRef.current = { x: event.clientX, y: event.clientY };

                    if (readOnly || !isRecordingPath || !dragActiveRef.current) {
                        return;
                    }

                    const point = resolvePointerPoint(event.clientX, event.clientY);
                    if (!point) {
                        return;
                    }

                    setCurrentPose(point.pose);
                    appendPathFrame(point.pose, performance.now());
                }}
                onPointerUp={() => {
                    dragActiveRef.current = false;
                    lastPointerRef.current = null;
                }}
                onPointerLeave={() => {
                    dragActiveRef.current = false;
                    lastPointerRef.current = null;
                }}
                onClick={(event) => {
                    if (dragDistanceRef.current > 4) {
                        dragDistanceRef.current = 0;
                        return;
                    }

                    if (readOnly) {
                        return;
                    }

                    if (isPinPlacementEnabled) {
                        const point = resolvePointerPoint(event.clientX, event.clientY);
                        if (!point) {
                            return;
                        }

                        setCurrentPose(point.pose);
                        onAddPin({
                            id: createId("pin"),
                            label: `${formatPinTypeLabel(pinType)} Pin`,
                            type: pinType,
                            position: point.pose.target,
                            created_at: nowIso(),
                        });
                        return;
                    }

                    onClearSelection();
                }}
            />
            <div className="pointer-events-none absolute inset-0">
                {pins.map((pin) => {
                    const location = projectInteractiveFallbackPin(pin.position);
                    const isSelected = pin.id === selectedPinId;

                    return (
                        <button
                            key={pin.id}
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectPin(pin.id);
                            }}
                            className={`pointer-events-auto absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs shadow-lg transition-transform hover:scale-110 ${pinColors(pin.type, isSelected)}`}
                            style={{ left: `${location.left}%`, top: `${location.top}%` }}
                            title={pin.label}
                        >
                            <MapPin className="h-4 w-4" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function AssetFallbackMesh({
    asset,
    updateAssetTransform,
    onCommitTransform,
    readOnly,
    selected,
    activeTool,
    onSelect,
}: {
    asset: SceneAsset;
    updateAssetTransform: (
        instanceId: string,
        patch: {
            position?: [number, number, number];
            rotation?: [number, number, number, number];
            scale?: [number, number, number];
        },
    ) => void;
    onCommitTransform?: () => void;
    readOnly: boolean;
    selected: boolean;
    activeTool: SceneToolMode;
    onSelect: () => void;
}) {
    const pivotTool = resolvePivotToolConfig(activeTool);
    const controlsVisible = !readOnly && selected && pivotTool.visible;

    return (
        <PivotControls
            visible={controlsVisible}
            enabled={controlsVisible}
            scale={80}
            depthTest={false}
            lineWidth={3}
            anchor={[0, 0, 0]}
            disableAxes={pivotTool.disableAxes}
            disableSliders={pivotTool.disableSliders}
            disableRotations={pivotTool.disableRotations}
            disableScaling={pivotTool.disableScaling}
            onDrag={(local) => {
                if (readOnly) return;
                const position = new THREE.Vector3();
                const quaternion = new THREE.Quaternion();
                const scale = new THREE.Vector3();
                local.decompose(position, quaternion, scale);
                const euler = new THREE.Euler().setFromQuaternion(quaternion);
                updateAssetTransform(asset.instanceId, {
                    position: [position.x, position.y, position.z],
                    rotation: [euler.x, euler.y, euler.z, 1],
                    scale: [scale.x, scale.y, scale.z],
                });
            }}
            onDragEnd={() => {
                if (!readOnly) {
                    onCommitTransform?.();
                }
            }}
        >
            <group
                position={parseVector3Tuple(asset.position, [0, 0, 0])}
                rotation={parseVector3Tuple(asset.rotation, [0, 0, 0])}
                scale={parseVector3Tuple(asset.scale, [1, 1, 1])}
                onClick={(event) => {
                    if (readOnly) return;
                    event.stopPropagation();
                    onSelect();
                }}
            >
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color={selected ? "#60a5fa" : "#4ade80"} roughness={0.3} metalness={0.4} />
                </mesh>
            </group>
        </PivotControls>
    );
}

function detectMeshFormat(buffer: ArrayBuffer) {
    const headerBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64));
    if (headerBytes.length >= 4) {
        const magic = String.fromCharCode(headerBytes[0] ?? 0, headerBytes[1] ?? 0, headerBytes[2] ?? 0, headerBytes[3] ?? 0);
        if (magic === "glTF") {
            return "glb" as const;
        }
    }

    const headerText = new TextDecoder("utf-8").decode(headerBytes).replace(/^\uFEFF/, "").trimStart();
    if (headerText.startsWith("{")) {
        return "gltf" as const;
    }

    if (/^(?:#.*\n\s*)*(?:mtllib|o|g|v|vt|vn|usemtl|s|f)\b/m.test(headerText)) {
        return "obj" as const;
    }

    throw new Error("Unsupported mesh payload format.");
}

function parseGltfAsset(loader: GLTFLoader, payload: ArrayBuffer | string, resourcePath: string) {
    return new Promise<ParsedMeshAsset>((resolve, reject) => {
        loader.parse(
            payload,
            resourcePath,
            (gltf) => {
                resolve({
                    format: payload instanceof ArrayBuffer ? "glb" : "gltf",
                    scene: gltf.scene || new THREE.Group(),
                });
            },
            (error) => {
                reject(error instanceof Error ? error : new Error("GLTF parse failed."));
            },
        );
    });
}

async function loadMeshAsset(meshUrl: string, signal: AbortSignal) {
    const resolvedUrl = toProxyUrl(meshUrl);
    const response = await fetch(resolvedUrl, {
        cache: "force-cache",
        signal,
    });
    if (!response.ok) {
        throw new Error(`Could not load ${resolvedUrl}: ${response.status} ${response.statusText}`.trim());
    }

    const payload = await response.arrayBuffer();
    const format = detectMeshFormat(payload);
    const resourcePath = new URL("./", new URL(resolvedUrl, window.location.href)).toString();

    if (format === "obj") {
        const text = new TextDecoder("utf-8").decode(payload);
        return {
            format,
            scene: new OBJLoader().parse(text),
        } satisfies ParsedMeshAsset;
    }

    const gltfLoader = new GLTFLoader();
    if (format === "glb") {
        return parseGltfAsset(gltfLoader, payload, resourcePath);
    }

    const text = new TextDecoder("utf-8").decode(payload);
    return parseGltfAsset(gltfLoader, text, resourcePath);
}

function MeshAsset({
    asset,
    updateAssetTransform,
    onCommitTransform,
    readOnly,
    selected,
    activeTool,
    onSelect,
}: {
    asset: SceneAsset;
    updateAssetTransform: (
        instanceId: string,
        patch: {
            position?: [number, number, number];
            rotation?: [number, number, number, number];
            scale?: [number, number, number];
        },
    ) => void;
    onCommitTransform?: () => void;
    readOnly: boolean;
    selected: boolean;
    activeTool: SceneToolMode;
    onSelect: () => void;
}) {
    const [parsedAsset, setParsedAsset] = useState<ParsedMeshAsset | null>(null);
    const [loadError, setLoadError] = useState<Error | null>(null);
    const pivotTool = resolvePivotToolConfig(activeTool);
    const controlsVisible = !readOnly && selected && pivotTool.visible;

    useEffect(() => {
        if (!asset.mesh) {
            setParsedAsset(null);
            setLoadError(null);
            return;
        }

        const abortController = new AbortController();
        let ignore = false;
        setParsedAsset(null);
        setLoadError(null);

        void loadMeshAsset(asset.mesh, abortController.signal)
            .then((nextAsset) => {
                if (ignore || abortController.signal.aborted) {
                    return;
                }
                setParsedAsset(nextAsset);
            })
            .catch((error) => {
                if (ignore || abortController.signal.aborted) {
                    return;
                }
                const resolvedError = error instanceof Error ? error : new Error("Mesh load failed.");
                console.error(`[ThreeOverlay] Mesh asset load failed for ${asset.mesh}`, resolvedError);
                setLoadError(resolvedError);
            });

        return () => {
            ignore = true;
            abortController.abort();
        };
    }, [asset.mesh]);

    const scene = useMemo(() => (parsedAsset ? clone(parsedAsset.scene) : null), [parsedAsset]);

    if (loadError) {
        return (
            <AssetFallbackMesh
                asset={asset}
                updateAssetTransform={updateAssetTransform}
                onCommitTransform={onCommitTransform}
                readOnly={readOnly}
                selected={selected}
                activeTool={activeTool}
                onSelect={onSelect}
            />
        );
    }

    if (!scene) {
        return <LoadingLabel text="Loading mesh..." />;
    }

    return (
        <PivotControls
            visible={controlsVisible}
            enabled={controlsVisible}
            scale={80}
            depthTest={false}
            lineWidth={3}
            anchor={[0, 0, 0]}
            disableAxes={pivotTool.disableAxes}
            disableSliders={pivotTool.disableSliders}
            disableRotations={pivotTool.disableRotations}
            disableScaling={pivotTool.disableScaling}
            onDrag={(local) => {
                if (readOnly) return;
                const position = new THREE.Vector3();
                const quaternion = new THREE.Quaternion();
                const scale = new THREE.Vector3();
                local.decompose(position, quaternion, scale);
                const euler = new THREE.Euler().setFromQuaternion(quaternion);
                updateAssetTransform(asset.instanceId, {
                    position: [position.x, position.y, position.z],
                    rotation: [euler.x, euler.y, euler.z, 1],
                    scale: [scale.x, scale.y, scale.z],
                });
            }}
            onDragEnd={() => {
                if (!readOnly) {
                    onCommitTransform?.();
                }
            }}
        >
            <group
                position={parseVector3Tuple(asset.position, [0, 0, 0])}
                rotation={parseVector3Tuple(asset.rotation, [0, 0, 0])}
                scale={parseVector3Tuple(asset.scale, [1, 1, 1])}
                onClick={(event) => {
                    if (readOnly) return;
                    event.stopPropagation();
                    onSelect();
                }}
            >
                <primitive object={scene} />
            </group>
        </PivotControls>
    );
}

function SceneAssetNode({
    asset,
    updateAssetTransform,
    onCommitTransform,
    readOnly,
    selected,
    activeTool,
    onSelect,
}: {
    asset: SceneAsset;
    updateAssetTransform: (
        instanceId: string,
        patch: {
            position?: [number, number, number];
            rotation?: [number, number, number, number];
            scale?: [number, number, number];
        },
    ) => void;
    onCommitTransform?: () => void;
    readOnly: boolean;
    selected: boolean;
    activeTool: SceneToolMode;
    onSelect: () => void;
}) {
    if (asset.mesh) {
        return (
            <MeshAsset
                asset={asset}
                updateAssetTransform={updateAssetTransform}
                onCommitTransform={onCommitTransform}
                readOnly={readOnly}
                selected={selected}
                activeTool={activeTool}
                onSelect={onSelect}
            />
        );
    }

    return null;
}

function pinColors(type: SpatialPinType, isSelected: boolean) {
    if (type === "egress") {
        return isSelected ? "bg-emerald-400 border-emerald-200 text-black" : "bg-emerald-500/15 border-emerald-500 text-emerald-300";
    }
    if (type === "lighting") {
        return isSelected ? "bg-amber-300 border-amber-100 text-black" : "bg-amber-500/15 border-amber-500 text-amber-300";
    }
    if (type === "hazard") {
        return isSelected ? "bg-rose-400 border-rose-200 text-black" : "bg-rose-500/15 border-rose-500 text-rose-300";
    }
    return isSelected ? "bg-sky-400 border-sky-200 text-black" : "bg-sky-500/15 border-sky-500 text-sky-300";
}

function PinLayer({
    pins,
    selectedPinId,
    isPlacingPin,
    pinType,
    readOnly,
    onAddPin,
    onSelectPin,
}: {
    pins: SpatialPin[];
    selectedPinId?: string | null;
    isPlacingPin: boolean;
    pinType: SpatialPinType;
    readOnly: boolean;
    onAddPin: (pin: SpatialPin) => void;
    onSelectPin?: (pinId: string | null) => void;
}) {
    const { camera, pointer, raycaster, scene } = useThree();
    const [hoverPosition, setHoverPosition] = useState<THREE.Vector3 | null>(null);

    useFrame(() => {
        if (!isPlacingPin || readOnly) {
            setHoverPosition((prev) => (prev ? null : prev));
            return;
        }
        raycaster.setFromCamera(pointer, camera);
        const intersections = raycaster.intersectObjects(scene.children, true);
        if (intersections.length > 0) {
            setHoverPosition(intersections[0].point.clone());
        } else {
            setHoverPosition(null);
        }
    });

    const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
        if (!isPlacingPin || readOnly) return;
        event.stopPropagation();
        const resolvedPosition = event.point?.clone?.() ?? hoverPosition?.clone() ?? null;
        if (!resolvedPosition) return;
        onAddPin({
            id: createId("pin"),
            label: `${formatPinTypeLabel(pinType)} Pin`,
            type: pinType,
            position: [resolvedPosition.x, resolvedPosition.y, resolvedPosition.z],
            created_at: nowIso(),
        });
    };

    return (
        <group onPointerDown={handlePointerDown}>
            {isPlacingPin && hoverPosition ? (
                <group position={hoverPosition}>
                    <Html center zIndexRange={[100, 0]}>
                        <div className="flex flex-col items-center opacity-75 pointer-events-none">
                            <div className="mb-1 rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80">
                                Drop {formatPinTypeLabel(pinType)}
                            </div>
                            <MapPin className="h-5 w-5 text-sky-300" />
                        </div>
                    </Html>
                </group>
            ) : null}
            {pins.map((pin) => {
                const isSelected = pin.id === selectedPinId;
                return (
                    <group key={pin.id} position={pin.position}>
                        <Html center distanceFactor={10} zIndexRange={[100, 0]}>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectPin?.(pin.id);
                                }}
                                className={`group relative flex h-8 w-8 items-center justify-center rounded-full border text-xs shadow-lg transition-transform hover:scale-110 ${pinColors(pin.type, isSelected)}`}
                                title={pin.label}
                            >
                                <MapPin className="h-4 w-4" />
                                <span className="pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    {pin.label}
                                </span>
                            </button>
                        </Html>
                    </group>
                );
            })}
        </group>
    );
}

function CameraRig({
    viewerFov,
    controlsRef,
    focusRequest,
    captureRequestKey,
    onCapturePose,
    isRecordingPath,
    onPathRecorded,
}: {
    viewerFov: number;
    controlsRef: React.MutableRefObject<any>;
    focusRequest: FocusRequest;
    captureRequestKey: number;
    onCapturePose?: (pose: CameraPose) => void;
    isRecordingPath: boolean;
    onPathRecorded?: (path: CameraPathFrame[]) => void;
}) {
    const { camera } = useThree();
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const pathRef = useRef<CameraPathFrame[]>([]);
    const lastCaptureRequestRef = useRef<number>(0);
    const lastFocusTokenRef = useRef<number>(0);
    const lastSampleRef = useRef<number>(-1);
    const startTimeRef = useRef<number>(0);

    useEffect(() => {
        applyEditorCameraClipping(perspectiveCamera);
        perspectiveCamera.fov = viewerFov;
        perspectiveCamera.updateProjectionMatrix();
    }, [perspectiveCamera, viewerFov]);

    useEffect(() => {
        if (!focusRequest || focusRequest.token === lastFocusTokenRef.current) return;
        lastFocusTokenRef.current = focusRequest.token;
        perspectiveCamera.position.set(...focusRequest.position);
        if (focusRequest.up) {
            perspectiveCamera.up.set(...focusRequest.up);
        } else {
            perspectiveCamera.up.set(0, 1, 0);
        }
        applyEditorCameraClipping(perspectiveCamera);
        perspectiveCamera.fov = focusRequest.fov;
        perspectiveCamera.updateProjectionMatrix();
        if (controlsRef.current?.target) {
            controlsRef.current.target.set(...focusRequest.target);
            controlsRef.current.update();
        }
    }, [controlsRef, focusRequest, perspectiveCamera]);

    useEffect(() => {
        if (!onCapturePose || captureRequestKey === 0 || captureRequestKey === lastCaptureRequestRef.current) return;
        lastCaptureRequestRef.current = captureRequestKey;
        const target = controlsRef.current?.target
            ? ([controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z] as Vector3Tuple)
            : ([0, 0, 0] as Vector3Tuple);
        onCapturePose({
            position: [perspectiveCamera.position.x, perspectiveCamera.position.y, perspectiveCamera.position.z],
            target,
            fov: perspectiveCamera.fov,
            lens_mm: Math.round(fovToLensMm(perspectiveCamera.fov) * 10) / 10,
        });
    }, [captureRequestKey, controlsRef, onCapturePose, perspectiveCamera]);

    useEffect(() => {
        if (isRecordingPath) {
            pathRef.current = [];
            lastSampleRef.current = -1;
            startTimeRef.current = 0;
            return;
        }
        if (pathRef.current.length > 0 && onPathRecorded) {
            onPathRecorded([...pathRef.current]);
            pathRef.current = [];
        }
    }, [isRecordingPath, onPathRecorded]);

    useFrame((state) => {
        if (!isRecordingPath) return;
        if (startTimeRef.current === 0) {
            startTimeRef.current = state.clock.elapsedTime;
        }
        const elapsed = state.clock.elapsedTime - startTimeRef.current;
        if (lastSampleRef.current >= 0 && elapsed - lastSampleRef.current < 0.08) {
            return;
        }
        lastSampleRef.current = elapsed;
        const target = controlsRef.current?.target
            ? ([controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z] as Vector3Tuple)
            : ([0, 0, 0] as Vector3Tuple);
        pathRef.current.push({
            time: Number(elapsed.toFixed(3)),
            position: [perspectiveCamera.position.x, perspectiveCamera.position.y, perspectiveCamera.position.z],
            target,
            rotation: [
                perspectiveCamera.quaternion.x,
                perspectiveCamera.quaternion.y,
                perspectiveCamera.quaternion.z,
                perspectiveCamera.quaternion.w,
            ],
            fov: perspectiveCamera.fov,
        });
    });

    return null;
}

function TemporalAntialiasingComposer() {
    const { camera, gl, scene, size } = useThree();
    const composerRef = useRef<EffectComposer | null>(null);
    const taaPassRef = useRef<TAARenderPassInternal | null>(null);
    const lastCameraPositionRef = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
    const lastCameraQuaternionRef = useRef(new THREE.Quaternion());
    const lastProjectionMatrixRef = useRef(new THREE.Matrix4());

    useEffect(() => {
        const composer = new EffectComposer(gl);
        composer.setPixelRatio(gl.getPixelRatio());
        composer.setSize(size.width, size.height);

        const taaPass = new TAARenderPass(scene, camera, 0x000000, 0) as TAARenderPassInternal;
        taaPass.unbiased = true;
        taaPass.sampleLevel = 2;
        taaPass.accumulate = true;
        taaPass.accumulateIndex = -1;
        composer.addPass(taaPass);

        composerRef.current = composer;
        taaPassRef.current = taaPass;
        lastCameraPositionRef.current.copy(camera.position);
        lastCameraQuaternionRef.current.copy(camera.quaternion);
        lastProjectionMatrixRef.current.copy(camera.projectionMatrix);

        return () => {
            taaPass.dispose();
            composer.dispose();
            composerRef.current = null;
            taaPassRef.current = null;
        };
    }, [camera, gl, scene, size.height, size.width]);

    useEffect(() => {
        const composer = composerRef.current;
        const taaPass = taaPassRef.current;
        if (!composer || !taaPass) {
            return;
        }

        composer.setPixelRatio(gl.getPixelRatio());
        composer.setSize(size.width, size.height);
        taaPass.accumulateIndex = -1;
    }, [gl, size.height, size.width]);

    useFrame((_, delta) => {
        const composer = composerRef.current;
        const taaPass = taaPassRef.current;
        if (!composer || !taaPass) {
            return;
        }

        const positionDeltaSq = lastCameraPositionRef.current.distanceToSquared(camera.position);
        const rotationDelta = 1 - Math.abs(lastCameraQuaternionRef.current.dot(camera.quaternion));
        const projectionChanged = !lastProjectionMatrixRef.current.equals(camera.projectionMatrix);

        if (positionDeltaSq > 1e-8 || rotationDelta > 1e-8 || projectionChanged) {
            taaPass.accumulateIndex = -1;
            lastCameraPositionRef.current.copy(camera.position);
            lastCameraQuaternionRef.current.copy(camera.quaternion);
            lastProjectionMatrixRef.current.copy(camera.projectionMatrix);
        }

        composer.render(delta);
    }, 1);

    return null;
}

function SceneBackgroundLock({ backgroundColor }: { backgroundColor: string }) {
    const { gl, scene } = useThree();
    const background = useMemo(() => new THREE.Color(backgroundColor), [backgroundColor]);

    useEffect(() => {
        const previousBackground = scene.background;
        const previousClearColor = gl.getClearColor(new THREE.Color()).clone();
        const previousClearAlpha = gl.getClearAlpha();

        scene.background = background;
        gl.setClearColor(background, 1);
        gl.domElement.style.backgroundColor = backgroundColor;

        return () => {
            scene.background = previousBackground;
            gl.setClearColor(previousClearColor, previousClearAlpha);
        };
    }, [background, backgroundColor, gl, scene]);

    useFrame(() => {
        if (!(scene.background instanceof THREE.Color) || !scene.background.equals(background)) {
            scene.background = background;
        }

        if (!gl.getClearColor(sceneBackgroundScratchColor).equals(background) || gl.getClearAlpha() !== 1) {
            gl.setClearColor(background, 1);
        }

        if (gl.domElement.style.backgroundColor !== backgroundColor) {
            gl.domElement.style.backgroundColor = backgroundColor;
        }
    }, -1);

    return null;
}

const ThreeOverlay = React.memo(function ThreeOverlay({
    environment,
    assets,
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
    selectedPinId = null,
    selectedAssetInstanceIds = [],
    activeTool = "select",
    onSelectPin,
    onClearSelection,
    onSelectAsset,
    onUpdateAssetTransformDraft,
    onCommitSceneTransforms,
    onAppendPin,
}: ThreeOverlayProps) {
    const controlsRef = useRef<any>(null);
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const canvasEventCleanupRef = useRef<(() => void) | null>(null);
    const previewAutofocusKeyRef = useRef("");
    const [renderMode, setRenderMode] = useState<"webgl" | "fallback">("webgl");
    const [renderError, setRenderError] = useState("");
    const [renderFallbackReason, setRenderFallbackReason] = useState<ViewerFallbackReason | null>(null);
    const [isViewerReady, setIsViewerReady] = useState(false);
    const [previewAutofocusRequest, setPreviewAutofocusRequest] = useState<FocusRequest>(null);
    const environmentRenderState = useMemo(() => resolveEnvironmentRenderState(environment), [environment]);
    const environmentViewerUrl = toProxyUrl(environmentRenderState.viewerUrl);
    const environmentSplatUrl = toProxyUrl(environmentRenderState.splatUrl);
    const previewProjectionImage = toProxyUrl(environmentRenderState.previewProjectionImage);
    const environmentMetadata = typeof environment === "object" ? environment?.metadata ?? null : null;
    const referenceImage = environmentRenderState.referenceImage;
    const isSingleImagePreview = isSingleImagePreviewEnvironment(environmentMetadata);
    const viewerDecision = useMemo(
        () =>
            resolveViewerCapabilities({
                plyUrl: environmentSplatUrl,
                viewerUrl: environmentViewerUrl,
                metadata: environmentMetadata,
            }),
        [environmentMetadata, environmentSplatUrl, environmentViewerUrl],
    );
    const hasRenderableEnvironment = Boolean(environmentSplatUrl || environmentViewerUrl);
    const shouldUsePreviewProjectionFallback = renderMode !== "fallback" && !hasRenderableEnvironment && Boolean(previewProjectionImage);
    const interactiveFallbackImage =
        renderFallbackReason === "webgl_unavailable" && isSingleImagePreview ? previewProjectionImage ?? referenceImage ?? null : null;
    const usesInteractiveFallback = renderMode === "fallback" && Boolean(interactiveFallbackImage);
    const singleImagePreviewCamera = useMemo(() => resolveSingleImagePreviewCamera(environmentMetadata), [environmentMetadata]);
    const effectiveFocusRequest =
        previewAutofocusRequest && (!focusRequest || previewAutofocusRequest.token >= focusRequest.token)
            ? previewAutofocusRequest
            : focusRequest ?? null;
    const selectedAssetInstanceIdSet = useMemo(() => new Set(selectedAssetInstanceIds), [selectedAssetInstanceIds]);

    const activateViewerFallback = React.useCallback((message: string, reason: ViewerFallbackReason = "environment_render_failed") => {
        setIsViewerReady(false);
        setRenderMode("fallback");
        setRenderFallbackReason(reason);
        setRenderError(message);
    }, []);

    useEffect(() => {
        if (viewerDecision.renderMode !== "fallback") {
            setRenderMode("webgl");
            setRenderFallbackReason(null);
            setRenderError("");
            return;
        }

        activateViewerFallback(viewerDecision.fallbackMessage, viewerDecision.fallbackReason ?? "environment_render_failed");
    }, [activateViewerFallback, viewerDecision.fallbackMessage, viewerDecision.fallbackReason, viewerDecision.renderMode]);

    useEffect(() => {
        return () => {
            canvasEventCleanupRef.current?.();
            canvasEventCleanupRef.current = null;
            canvasElementRef.current = null;
        };
    }, []);

    useEffect(() => {
        onViewerReadyChange((isViewerReady && renderMode === "webgl") || usesInteractiveFallback);
    }, [isViewerReady, onViewerReadyChange, renderMode, usesInteractiveFallback]);

    useEffect(() => {
        previewAutofocusKeyRef.current = "";
        setPreviewAutofocusRequest(null);
    }, [environmentSplatUrl, environmentViewerUrl, isSingleImagePreview]);

    const selectPin = React.useCallback((pinId: string | null) => {
        if (!onSelectPin) {
            return;
        }
        onSelectPin(pinId);
    }, [onSelectPin]);

    const clearSceneSelection = React.useCallback(() => {
        if (onClearSelection) {
            onClearSelection();
            return;
        }
        onSelectPin?.(null);
    }, [onClearSelection, onSelectPin]);

    const updateAssetTransform = React.useCallback(
        (instanceId: string, patch: AssetTransformPatch) => {
            onUpdateAssetTransformDraft?.(instanceId, patch);
        },
        [onUpdateAssetTransformDraft],
    );

    const commitSceneTransforms = React.useCallback(() => {
        onCommitSceneTransforms?.();
    }, [onCommitSceneTransforms]);

    const addPin = React.useCallback((pin: SpatialPin) => {
        if (!onAppendPin) {
            return;
        }
        onAppendPin(pin);
        selectPin(pin.id);
    }, [onAppendPin, selectPin]);

    const selectSceneAsset = React.useCallback((instanceId: string) => {
        onSelectAsset?.(instanceId);
    }, [onSelectAsset]);

    const addPinAtControlsTarget = React.useCallback(() => {
        if (!isPinPlacementEnabled || readOnly) {
            return false;
        }

        const target = controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0);

        addPin({
            id: createId("pin"),
            label: `${formatPinTypeLabel(pinType)} Pin`,
            type: pinType,
            position: [target.x, target.y, target.z],
            created_at: nowIso(),
        });
        return true;
    }, [addPin, isPinPlacementEnabled, pinType, readOnly]);

    useEffect(() => {
        const canvas = canvasElementRef.current;
        if (!canvas || !isPinPlacementEnabled || readOnly) {
            return;
        }

        const handleCanvasClick = () => {
            addPinAtControlsTarget();
        };

        canvas.addEventListener("click", handleCanvasClick);
        return () => {
            canvas.removeEventListener("click", handleCanvasClick);
        };
    }, [addPinAtControlsTarget, isPinPlacementEnabled, readOnly]);

    const handleCanvasError = React.useCallback(
        (error: Error) => {
            const message = error.message || "WebGL viewer failed to initialize.";
            activateViewerFallback(message, classifyViewerFailure(message));
        },
        [activateViewerFallback],
    );

    const handleEnvironmentFatalError = React.useCallback(
        (message: string, reason: ViewerFallbackReason) => {
            void reason;
            activateViewerFallback(message);
        },
        [activateViewerFallback],
    );

    const handlePreviewBounds = (bounds: { center: [number, number, number]; radius: number; forward?: [number, number, number] }) => {
        if (!isSingleImagePreview) {
            return;
        }

        if (singleImagePreviewCamera) {
            const key = `${environmentSplatUrl}|source-camera|${singleImagePreviewCamera.position.join(",")}|${singleImagePreviewCamera.target.join(",")}|${singleImagePreviewCamera.fov.toFixed(3)}`;
            if (previewAutofocusKeyRef.current === key) {
                return;
            }
            previewAutofocusKeyRef.current = key;
            setPreviewAutofocusRequest({
                ...singleImagePreviewCamera,
                token: Date.now(),
            });
            return;
        }

        const key = `${environmentSplatUrl}|${bounds.center.join(",")}|${bounds.radius.toFixed(4)}|${(bounds.forward ?? [0, 0, 1]).join(",")}|${viewer.fov.toFixed(2)}`;
        if (previewAutofocusKeyRef.current === key) {
            return;
        }
        previewAutofocusKeyRef.current = key;

        const radius = Math.max(0.1, bounds.radius);
        const verticalFovRadians = THREE.MathUtils.degToRad(viewer.fov);
        const distance = Math.max(radius * 1.75, (radius / Math.tan(verticalFovRadians * 0.5)) * 0.96);
        const forward = new THREE.Vector3(...(bounds.forward ?? [0, 0, 1]));
        if (forward.lengthSq() <= 1e-6) {
            forward.set(0, 0, 1);
        }
        forward.normalize();
        const position = new THREE.Vector3(...bounds.center).addScaledVector(forward, distance);

        setPreviewAutofocusRequest({
            position: [position.x, position.y, position.z],
            target: bounds.center,
            fov: viewer.fov,
            lens_mm: Math.round(fovToLensMm(viewer.fov) * 10) / 10,
            token: Date.now(),
        });
    };

    if (shouldUsePreviewProjectionFallback && previewProjectionImage) {
        return <SingleImagePreviewSurface imageUrl={previewProjectionImage} />;
    }

    if (usesInteractiveFallback && interactiveFallbackImage) {
        return (
            <InteractiveSingleImageFallbackSurface
                imageUrl={interactiveFallbackImage}
                viewer={viewer}
                pins={pins}
                selectedPinId={selectedPinId}
                isPinPlacementEnabled={isPinPlacementEnabled}
                pinType={pinType}
                isRecordingPath={isRecordingPath}
                focusRequest={effectiveFocusRequest}
                captureRequestKey={captureRequestKey}
                readOnly={readOnly}
                onAddPin={addPin}
                onSelectPin={selectPin}
                onCapturePose={onCapturePose}
                onPathRecorded={onPathRecorded}
                onClearSelection={clearSceneSelection}
            />
        );
    }

    if (renderMode === "fallback") {
        return <ThreeOverlayFallback message={renderError} referenceImage={referenceImage} />;
    }

    return (
        <div className="absolute inset-0 pointer-events-auto z-20">
            <CanvasErrorBoundary onError={handleCanvasError}>
                <Canvas
                    camera={{ position: [5, 4, 6], fov: viewer.fov, near: EDITOR_CAMERA_NEAR, far: EDITOR_CAMERA_FAR }}
                    dpr={isSingleImagePreview ? [1, 2] : [1, 3]}
                    style={{ background: backgroundColor, touchAction: "none" }}
                    gl={{
                        powerPreference: "high-performance",
                        antialias: true,
                        alpha: true,
                        depth: true,
                        stencil: false,
                    }}
                    shadows={!isSingleImagePreview}
                    onCreated={({ gl }) => {
                        canvasEventCleanupRef.current?.();
                        canvasElementRef.current = gl.domElement;
                        const handleContextLost = (event: Event) => {
                            event.preventDefault();
                            activateViewerFallback("WebGL context was lost while rendering the viewer.");
                        };
                        const handleContextRestored = () => {
                            setRenderError("");
                        };
                        gl.domElement.addEventListener("webglcontextlost", handleContextLost, false);
                        gl.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);
                        canvasEventCleanupRef.current = () => {
                            canvasElementRef.current = null;
                            gl.domElement.removeEventListener("webglcontextlost", handleContextLost, false);
                            gl.domElement.removeEventListener("webglcontextrestored", handleContextRestored, false);
                        };

                        gl.setClearColor(backgroundColor, 1);
                        gl.domElement.style.backgroundColor = backgroundColor;
                        gl.outputColorSpace = THREE.SRGBColorSpace;
                        gl.toneMapping = THREE.ACESFilmicToneMapping;
                        gl.toneMappingExposure = 1;
                        setRenderError("");
                        setIsViewerReady(true);
                    }}
                    onPointerMissed={clearSceneSelection}
                >
                    <SceneBackgroundLock backgroundColor={backgroundColor} />
                    {!isSingleImagePreview ? <TemporalAntialiasingComposer /> : null}
                    <ambientLight intensity={isSingleImagePreview ? 0.35 : 0.65} />
                    {!isSingleImagePreview ? <directionalLight position={[8, 12, 6]} intensity={1.2} castShadow /> : null}

                    <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />
                    {!isSingleImagePreview ? <Environment preset="city" background={false} /> : null}
                    <CameraRig
                        viewerFov={viewer.fov}
                        controlsRef={controlsRef}
                        focusRequest={effectiveFocusRequest}
                        captureRequestKey={captureRequestKey}
                        onCapturePose={onCapturePose}
                        isRecordingPath={isRecordingPath}
                        onPathRecorded={onPathRecorded}
                    />

                    {!isSingleImagePreview ? (
                        <>
                            <Grid
                                args={[30, 30]}
                                cellSize={1}
                                cellThickness={0.8}
                                cellColor="#3f3f46"
                                sectionSize={5}
                                sectionThickness={1.2}
                                sectionColor="#71717a"
                                fadeDistance={45}
                                fadeStrength={1}
                            />

                            <ContactShadows position={[0, -0.5, 0]} opacity={0.35} scale={30} blur={2.2} far={8} />
                        </>
                    ) : null}

                    {environmentSplatUrl || environmentViewerUrl ? (
                        <Suspense fallback={<LoadingLabel text="Loading environment splat..." />}>
                            <EnvironmentSplat
                                plyUrl={environmentSplatUrl}
                                viewerUrl={environmentViewerUrl}
                                metadata={environmentMetadata}
                                onPreviewBounds={handlePreviewBounds}
                                onFatalError={handleEnvironmentFatalError}
                            />
                        </Suspense>
                    ) : null}

                    {(assets ?? []).map((asset: SceneAsset, index: number) => (
                        <SceneAssetNode
                            key={asset.instanceId || `${asset.name}-${index}`}
                            asset={asset}
                            updateAssetTransform={updateAssetTransform}
                            onCommitTransform={commitSceneTransforms}
                            readOnly={readOnly}
                            selected={selectedAssetInstanceIdSet.has(asset.instanceId)}
                            activeTool={activeTool}
                            onSelect={() => selectSceneAsset(asset.instanceId)}
                        />
                    ))}

                    <PinLayer
                        pins={pins}
                        selectedPinId={selectedPinId}
                        isPlacingPin={isPinPlacementEnabled}
                        pinType={pinType}
                        readOnly={readOnly}
                        onAddPin={addPin}
                        onSelectPin={selectPin}
                    />
                </Canvas>
            </CanvasErrorBoundary>
        </div>
    );
});

export const ThreeOverlayConnected = React.memo(function ThreeOverlayConnected({
    readOnly = false,
    backgroundColor,
    onCapturePose,
    onPathRecorded,
}: ThreeOverlayConnectedProps) {
    const sceneStoreActions = useMvpSceneStoreActions();
    const editorSessionActions = useMvpEditorSessionStoreActions();
    const environment = useSceneEnvironmentSlice();
    const assets = useSceneAssetsSlice();
    const pins = useScenePinsSlice();
    const viewer = useSceneViewerSlice();
    const selectedNodeIds = useSceneSelectedNodeIds();
    const selectedPinId = useSceneSelectedPinId();
    const activeTool = useSceneActiveTool();
    const focusRequest = useEditorSessionFocusRequest();
    const captureRequestKey = useEditorSessionCaptureRequestKey();
    const isPinPlacementEnabled = useEditorSessionPinPlacementEnabled();
    const pinType = useEditorSessionPinType();
    const isRecordingPath = useEditorSessionRecordingPath();
    const assetNodeIdByInstanceId = useRenderableSceneDocumentSelector(selectMeshNodeIdByInstanceId, jsonValueEqual);
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const selectedAssetInstanceIds = useMemo(
        () =>
            Object.entries(assetNodeIdByInstanceId).flatMap(([instanceId, nodeId]) =>
                selectedNodeIdSet.has(nodeId) ? [instanceId] : [],
            ),
        [assetNodeIdByInstanceId, selectedNodeIdSet],
    );

    const handleSelectAsset = React.useCallback((instanceId: string) => {
        const nodeId = assetNodeIdByInstanceId[instanceId];
        if (!nodeId) {
            return;
        }

        sceneStoreActions.selectNodes([nodeId]);
        if (activeTool === "select") {
            sceneStoreActions.setActiveTool("translate");
        }
    }, [activeTool, assetNodeIdByInstanceId, sceneStoreActions]);

    return (
        <ThreeOverlay
            environment={environment}
            assets={assets}
            pins={pins}
            viewer={viewer}
            focusRequest={focusRequest}
            captureRequestKey={captureRequestKey}
            isPinPlacementEnabled={isPinPlacementEnabled}
            pinType={pinType}
            isRecordingPath={isRecordingPath}
            onCapturePose={onCapturePose}
            onPathRecorded={onPathRecorded}
            onViewerReadyChange={editorSessionActions.setViewerReady}
            readOnly={readOnly}
            backgroundColor={backgroundColor}
            selectedPinId={selectedPinId}
            selectedAssetInstanceIds={selectedAssetInstanceIds}
            activeTool={activeTool}
            onSelectPin={sceneStoreActions.selectPin}
            onClearSelection={sceneStoreActions.clearSelection}
            onSelectAsset={handleSelectAsset}
            onUpdateAssetTransformDraft={sceneStoreActions.updateDraftTransformByAssetInstanceId}
            onCommitSceneTransforms={sceneStoreActions.commitDraftTransforms}
            onAppendPin={sceneStoreActions.appendPin}
        />
    );
});

export default ThreeOverlay;
