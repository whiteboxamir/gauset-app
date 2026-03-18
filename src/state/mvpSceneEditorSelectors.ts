import { selectActiveTool, selectSelectedNodeIds, selectSelectedPinId, selectSelectedViewId, selectTransformSession, selectTransformSnap, selectTransformSpace } from "./mvpSceneSelectors.ts";
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
    return useMvpSceneStoreSelector(selectTransformSpace, Object.is);
}

export function useSceneTransformSnap() {
    return useMvpSceneStoreSelector(selectTransformSnap, jsonValueEqual);
}

export function useSceneTransformSession() {
    return useMvpSceneStoreSelector(selectTransformSession, jsonValueEqual);
}
