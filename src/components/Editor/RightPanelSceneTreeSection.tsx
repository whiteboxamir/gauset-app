"use client";

import React, { useMemo } from "react";
import { Box, Camera, Eye, EyeOff, Layers, Lightbulb, Lock, LockOpen, Plus, Trash2 } from "lucide-react";

import type { SceneDocumentV2, SceneNodeKind } from "@/lib/scene-graph/types.ts";
import type { MvpSceneSelectionMode, MvpSceneStoreActions } from "@/state/mvpSceneStore.ts";

import { buildSceneTreeRows, formatSceneNodeKindLabel } from "./rightPanelSceneTreeShared";

function kindToneClass(kind: SceneNodeKind) {
    switch (kind) {
        case "group":
            return "border-sky-500/30 bg-sky-950/30 text-sky-200";
        case "camera":
            return "border-violet-500/30 bg-violet-950/30 text-violet-200";
        case "light":
            return "border-amber-500/30 bg-amber-950/30 text-amber-200";
        case "mesh":
            return "border-emerald-500/30 bg-emerald-950/30 text-emerald-200";
        case "splat":
            return "border-cyan-500/30 bg-cyan-950/30 text-cyan-200";
        default:
            return "border-neutral-700 bg-neutral-900 text-neutral-300";
    }
}

function NodeKindGlyph({ kind }: { kind: SceneNodeKind }) {
    if (kind === "camera") {
        return <Camera className="h-3.5 w-3.5" />;
    }
    if (kind === "light") {
        return <Lightbulb className="h-3.5 w-3.5" />;
    }
    if (kind === "mesh") {
        return <Box className="h-3.5 w-3.5" />;
    }
    return <Layers className="h-3.5 w-3.5" />;
}

export const RightPanelSceneTreeSection = React.memo(function RightPanelSceneTreeSection({
    sceneDocument,
    selectedNodeIds,
    sceneStoreActions,
}: {
    sceneDocument: SceneDocumentV2;
    selectedNodeIds: string[];
    sceneStoreActions: Pick<
        MvpSceneStoreActions,
        "appendCamera" | "appendGroup" | "appendLight" | "removeNode" | "selectNodes" | "setNodeLocked" | "setNodeVisibility"
    >;
}) {
    const rows = useMemo(() => buildSceneTreeRows(sceneDocument), [sceneDocument]);
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const selectedParentGroupId =
        selectedNodeIds.length === 1 && sceneDocument.nodes[selectedNodeIds[0]]?.kind === "group" ? selectedNodeIds[0] : null;
    const selectedParentGroupRow = useMemo(
        () => rows.find((row) => row.nodeId === selectedParentGroupId) ?? null,
        [rows, selectedParentGroupId],
    );
    const appendTargetGroupId = selectedParentGroupRow?.effectiveLocked ? null : selectedParentGroupId;

    const resolveSelectionMode = (event: React.MouseEvent<HTMLButtonElement>): MvpSceneSelectionMode => {
        if (event.metaKey || event.ctrlKey) {
            return "toggle";
        }
        if (event.shiftKey) {
            return "add";
        }
        return "replace";
    };

    return (
        <div className="border-b border-neutral-800 p-4 shrink-0" data-testid="mvp-scene-tree">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
                    <Layers className="h-3 w-3" />
                    Scene Tree
                </div>
                <div className="rounded-full border border-neutral-800 bg-neutral-950/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                    {rows.length} nodes
                </div>
            </div>

            <p className="mt-3 text-[11px] text-neutral-500">
                New helper nodes land at the root unless a group is selected.
                {selectedParentGroupId
                    ? selectedParentGroupRow?.effectiveLocked
                        ? ` ${sceneDocument.nodes[selectedParentGroupId]?.name ?? "Selected group"} is locked, so new nodes land at the root.`
                        : ` Adding into ${sceneDocument.nodes[selectedParentGroupId]?.name ?? "selected group"}.`
                    : ""}
                {" "}
                Shift adds to selection. Cmd/Ctrl toggles individual nodes.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    data-testid="mvp-scene-tree-add-group"
                    onClick={() => sceneStoreActions.appendGroup({ parentId: appendTargetGroupId })}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-white transition-colors hover:border-sky-500/40 hover:text-sky-200"
                >
                    <Plus className="mr-1 inline h-3.5 w-3.5" />
                    Add Group
                </button>
                <button
                    type="button"
                    data-testid="mvp-scene-tree-add-camera"
                    onClick={() => sceneStoreActions.appendCamera({ parentId: appendTargetGroupId })}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-white transition-colors hover:border-violet-500/40 hover:text-violet-200"
                >
                    <Camera className="mr-1 inline h-3.5 w-3.5" />
                    Add Camera
                </button>
                <button
                    type="button"
                    data-testid="mvp-scene-tree-add-light"
                    onClick={() => sceneStoreActions.appendLight({ parentId: appendTargetGroupId })}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-white transition-colors hover:border-amber-500/40 hover:text-amber-200"
                >
                    <Lightbulb className="mr-1 inline h-3.5 w-3.5" />
                    Add Light
                </button>
            </div>

            <div className="mt-4 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                {rows.map(({ nodeId, node, depth, effectiveVisible, effectiveLocked, hiddenByAncestor, lockedByAncestor }) => {
                    const isSelected = selectedNodeIdSet.has(nodeId);
                    const rowClassName = isSelected
                        ? "border-blue-500/40 bg-blue-950/20"
                        : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 hover:bg-neutral-900";
                    const disableVisibilityToggle = effectiveLocked;
                    const disableLockToggle = lockedByAncestor;
                    const disableDelete = effectiveLocked;

                    return (
                        <div
                            key={nodeId}
                            data-testid={`mvp-scene-tree-node-${nodeId}`}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors ${rowClassName}`}
                            style={{ paddingLeft: `${12 + depth * 18}px` }}
                        >
                            <button
                                type="button"
                                onClick={(event) => sceneStoreActions.selectNodes([nodeId], { mode: resolveSelectionMode(event) })}
                                className="min-w-0 flex-1 text-left"
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${kindToneClass(node.kind)}`}>
                                        <NodeKindGlyph kind={node.kind} />
                                        {formatSceneNodeKindLabel(node.kind)}
                                    </span>
                                    <span className={`truncate text-sm ${effectiveVisible ? "text-white" : "text-neutral-500 line-through"}`}>
                                        {node.name}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] text-neutral-500">
                                    {node.childIds.length > 0 ? `${node.childIds.length} child${node.childIds.length === 1 ? "" : "ren"}` : "Leaf node"}
                                    {effectiveLocked ? (lockedByAncestor ? " · locked by ancestor" : " · locked") : ""}
                                    {!effectiveVisible ? (hiddenByAncestor ? " · hidden by ancestor" : " · hidden") : ""}
                                </p>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    disabled={disableVisibilityToggle}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        sceneStoreActions.setNodeVisibility(nodeId, !node.visible);
                                    }}
                                    className="rounded p-1 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                    title={node.visible ? "Hide node" : "Show node"}
                                >
                                    {node.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                    type="button"
                                    disabled={disableLockToggle}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        sceneStoreActions.setNodeLocked(nodeId, !node.locked);
                                    }}
                                    className="rounded p-1 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                    title={node.locked ? "Unlock node" : "Lock node"}
                                >
                                    {node.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                    type="button"
                                    disabled={disableDelete}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        sceneStoreActions.removeNode(nodeId);
                                    }}
                                    className="rounded p-1 text-rose-300 transition-colors hover:bg-rose-950/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                                    title="Delete node"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {rows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-4 py-4">
                        <p className="text-sm text-white">No scene nodes yet.</p>
                        <p className="mt-2 text-xs text-neutral-400">Build a preview or stage an asset to seed the tree, then organize it here.</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
});
