import { selectActiveTool, selectSelectedNodeIds, selectSelectedPinId, selectSelectedViewId } from "./mvpSceneSelectors.ts";
import { useMvpSceneStoreSelector } from "./mvpSceneStoreContext.tsx";

function arrayEqual<T>(previous: T[], next: T[]) {
    if (previous === next) {
        return true;
    }
    if (previous.length !== next.length) {
        return false;
    }
    return previous.every((value, index) => Object.is(value, next[index]));
}

export function useSceneSelectedNodeIds() {
    return useMvpSceneStoreSelector(selectSelectedNodeIds, arrayEqual);
}

export function useSceneSelectedPinId() {
    return useMvpSceneStoreSelector(selectSelectedPinId, Object.is);
}

export function useSceneSelectedViewId() {
    return useMvpSceneStoreSelector(selectSelectedViewId, Object.is);
}

export function useSceneActiveTool() {
    return useMvpSceneStoreSelector(selectActiveTool, Object.is);
}

function jsonValueEqual<T>(previous: T, next: T) {
    return JSON.stringify(previous) === JSON.stringify(next);
}

export function useSceneTransformSpace() {
    return "world" as const;
}

export function useSceneTransformSnap() {
    return {
        enabled: false,
        translate: 0.5,
        rotate: Math.PI / 12,
        scale: 0.1,
    };
}

export function useSceneTransformSession() {
    return null;
}
