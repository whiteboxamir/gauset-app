import type { SpatialPinType } from "@/lib/mvp-workspace";

export type TransformTuple = [number, number, number];

export type SceneAsset = {
    instanceId: string;
    nodeId?: string | null;
    name: string;
    mesh?: string;
    position?: TransformTuple;
    rotation?: TransformTuple;
    scale?: TransformTuple;
    visible?: boolean;
    locked?: boolean;
    parentWorldMatrix?: number[] | null;
};

export type AssetTransformPatch = {
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
};

export const EDITOR_CAMERA_NEAR = 0.01;
export const EDITOR_CAMERA_FAR = 500;
export const DEFAULT_EDITOR_VIEWER_BACKGROUND = "#0a0a0a";

export function pinColors(type: SpatialPinType, isSelected: boolean) {
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
