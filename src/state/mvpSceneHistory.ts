import type { MvpSceneStoreState } from "./mvpSceneStore";

export function canUndoSceneDocument(state: MvpSceneStoreState) {
    return state.history.length > 0;
}

export function canRedoSceneDocument(state: MvpSceneStoreState) {
    return state.future.length > 0;
}

