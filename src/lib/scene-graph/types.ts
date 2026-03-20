import type {
    CameraPathFrame,
    CameraView,
    QuaternionTuple,
    SceneReviewRecord,
    SpatialPin,
    Vector3Tuple,
    ViewerState,
    WorldContinuityRecord,
} from "../mvp-workspace";

export type SceneNodeId = string;
export type SceneNodeKind = "group" | "camera" | "light" | "mesh" | "splat";
export type LightNodeType = "directional" | "spot" | "point" | "area";
export type SceneToolMode = "select" | "translate" | "rotate" | "scale";

export interface SceneNodeTransform {
    position: Vector3Tuple;
    rotation: QuaternionTuple;
    scale: Vector3Tuple;
}

export interface SceneNodeRecord {
    id: SceneNodeId;
    kind: SceneNodeKind;
    parentId: SceneNodeId | null;
    childIds: SceneNodeId[];
    name: string;
    visible: boolean;
    locked: boolean;
    transform: SceneNodeTransform;
}

export interface GroupNodeData {
    id: SceneNodeId;
}

export interface CameraNodeData {
    id: SceneNodeId;
    fov: number;
    lens_mm: number;
    near: number;
    far: number;
    role: "viewer" | "shot" | "utility";
}

export interface LightNodeData {
    id: SceneNodeId;
    lightType: LightNodeType;
    intensity: number;
    color: string;
}

export interface MeshNodeData {
    id: SceneNodeId;
    assetId: string | null;
    meshUrl: string | null;
    textureUrl: string | null;
    previewUrl: string | null;
    metadata: Record<string, unknown>;
}

export interface SplatNodeData {
    id: SceneNodeId;
    sceneId: string | null;
    viewerUrl: string | null;
    splatUrl: string | null;
    camerasUrl: string | null;
    metadataUrl: string | null;
    metadata: Record<string, unknown>;
}

export interface SceneDirectionState {
    cameraViews: CameraView[];
    pins: SpatialPin[];
    directorPath: CameraPathFrame[];
    directorBrief: string;
}

export interface ViewerDocumentState extends ViewerState {
    activeCameraNodeId: SceneNodeId | null;
}

export interface SceneDocumentV2 {
    version: 2;
    rootIds: SceneNodeId[];
    nodes: Record<SceneNodeId, SceneNodeRecord>;
    groups: Record<SceneNodeId, GroupNodeData>;
    cameras: Record<SceneNodeId, CameraNodeData>;
    lights: Record<SceneNodeId, LightNodeData>;
    meshes: Record<SceneNodeId, MeshNodeData>;
    splats: Record<SceneNodeId, SplatNodeData>;
    direction: SceneDirectionState;
    continuity: WorldContinuityRecord;
    review: SceneReviewRecord | null;
    viewer: ViewerDocumentState;
}

export interface NodeTransformPatch {
    position?: Vector3Tuple;
    rotation?: QuaternionTuple;
    scale?: Vector3Tuple;
}
