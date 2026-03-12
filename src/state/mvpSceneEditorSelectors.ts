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
