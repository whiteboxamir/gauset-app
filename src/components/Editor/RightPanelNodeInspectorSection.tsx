"use client";

import React, { useMemo } from "react";
import { Eye, EyeOff, Lock, LockOpen, SlidersHorizontal, Trash2 } from "lucide-react";

import type { CameraNodeData, LightNodeData, SceneDocumentV2, SceneNodeId } from "@/lib/scene-graph/types.ts";
import type { MvpSceneStoreActions } from "@/state/mvpSceneStore.ts";

import { buildSceneTreeRows, collectSceneGroupTargets, formatSceneNodeKindLabel } from "./rightPanelSceneTreeShared";

function formatNumberInputValue(value: number) {
    return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "0";
}

function commitNumberInput(
    event: React.FocusEvent<HTMLInputElement>,
    fallback: number,
    onCommit: (value: number) => void,
) {
    const nextValue = Number(event.currentTarget.value);
    if (!Number.isFinite(nextValue)) {
        event.currentTarget.value = formatNumberInputValue(fallback);
        return;
    }
    onCommit(nextValue);
}

function InspectorField({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</span>
            {children}
        </label>
    );
}

function VectorField({
    label,
    nodeId,
    values,
    step = "0.1",
    disabled = false,
    onCommit,
}: {
    label: string;
    nodeId: SceneNodeId;
    values: [number, number, number];
    step?: string;
    disabled?: boolean;
    onCommit: (nextValues: [number, number, number]) => void;
}) {
    return (
        <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
            <div className="mt-1 grid grid-cols-3 gap-2">
                {values.map((value, index) => (
                    <input
                        key={`${nodeId}-${label}-${index}-${value}`}
                        type="number"
                        step={step}
                        disabled={disabled}
                        defaultValue={formatNumberInputValue(value)}
                        onBlur={(event) => {
                            commitNumberInput(event, value, (nextValue) => {
                                const nextValues = [...values] as [number, number, number];
                                nextValues[index] = nextValue;
                                onCommit(nextValues);
                            });
                        }}
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                ))}
            </div>
        </div>
    );
}

export const RightPanelNodeInspectorSection = React.memo(function RightPanelNodeInspectorSection({
    sceneDocument,
    selectedNodeIds,
    sceneStoreActions,
}: {
    sceneDocument: SceneDocumentV2;
    selectedNodeIds: string[];
    sceneStoreActions: Pick<
        MvpSceneStoreActions,
        | "patchCameraNode"
        | "patchLightNode"
        | "removeNode"
        | "renameNode"
        | "reparentNode"
        | "setNodeLocked"
        | "setNodeVisibility"
        | "updateNodeTransform"
    >;
}) {
    const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
    const selectedNode = selectedNodeId ? sceneDocument.nodes[selectedNodeId] ?? null : null;
    const selectedTreeRow = useMemo(
        () => buildSceneTreeRows(sceneDocument).find((row) => row.nodeId === selectedNodeId) ?? null,
        [sceneDocument, selectedNodeId],
    );
    const reparentTargets = useMemo(
        () => (selectedNodeId ? collectSceneGroupTargets(sceneDocument, selectedNodeId) : []),
        [sceneDocument, selectedNodeId],
    );
    const cameraNode = selectedNodeId ? sceneDocument.cameras[selectedNodeId] ?? null : null;
    const lightNode = selectedNodeId ? sceneDocument.lights[selectedNodeId] ?? null : null;
    const meshNode = selectedNodeId ? sceneDocument.meshes[selectedNodeId] ?? null : null;
    const splatNode = selectedNodeId ? sceneDocument.splats[selectedNodeId] ?? null : null;
    const effectiveLocked = selectedTreeRow?.effectiveLocked ?? false;
    const lockedByAncestor = selectedTreeRow?.lockedByAncestor ?? false;
    const disableNodeEdits = effectiveLocked;
    const disableLockToggle = lockedByAncestor;

    if (!selectedNode) {
        return (
            <div className="border-b border-neutral-800 p-4 shrink-0" data-testid="mvp-node-inspector">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
                    <SlidersHorizontal className="h-3 w-3" />
                    Node Inspector
                </div>
                <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-4 py-4">
                    <p className="text-sm text-white">
                        {selectedNodeIds.length > 1 ? `${selectedNodeIds.length} nodes selected.` : "No node selected."}
                    </p>
                    <p className="mt-2 text-xs text-neutral-400">
                        {selectedNodeIds.length > 1
                            ? "Select a single node to edit its local transform, parenting, and node-specific settings."
                            : "Select a node in the scene tree or viewer to edit local transform, visibility, locking, and typed settings."}
                    </p>
                </div>
            </div>
        );
    }

    const transformRotation = [
        selectedNode.transform.rotation[0] ?? 0,
        selectedNode.transform.rotation[1] ?? 0,
        selectedNode.transform.rotation[2] ?? 0,
    ] as [number, number, number];

    return (
        <div className="border-b border-neutral-800 p-4 shrink-0" data-testid="mvp-node-inspector">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
                    <SlidersHorizontal className="h-3 w-3" />
                    Node Inspector
                </div>
                <div className="rounded-full border border-neutral-800 bg-neutral-950/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                    {formatSceneNodeKindLabel(selectedNode.kind)}
                </div>
            </div>

            <div className="mt-4 space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                <InspectorField label="Name">
                    <input
                        key={`${selectedNode.id}-name-${selectedNode.name}`}
                        data-testid="mvp-node-inspector-name"
                        type="text"
                        disabled={disableNodeEdits}
                        defaultValue={selectedNode.name}
                        onBlur={(event) => sceneStoreActions.renameNode(selectedNode.id, event.currentTarget.value)}
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </InspectorField>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        data-testid="mvp-node-inspector-visibility"
                        disabled={disableNodeEdits}
                        onClick={() => sceneStoreActions.setNodeVisibility(selectedNode.id, !selectedNode.visible)}
                        className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-left text-sm text-white transition-colors hover:border-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {selectedNode.visible ? <Eye className="mr-2 inline h-3.5 w-3.5" /> : <EyeOff className="mr-2 inline h-3.5 w-3.5" />}
                        {selectedNode.visible ? "Visible" : "Hidden"}
                    </button>
                    <button
                        type="button"
                        data-testid="mvp-node-inspector-lock"
                        disabled={disableLockToggle}
                        onClick={() => sceneStoreActions.setNodeLocked(selectedNode.id, !selectedNode.locked)}
                        className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-left text-sm text-white transition-colors hover:border-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {selectedNode.locked ? <Lock className="mr-2 inline h-3.5 w-3.5" /> : <LockOpen className="mr-2 inline h-3.5 w-3.5" />}
                        {selectedNode.locked ? "Locked" : "Unlocked"}
                    </button>
                </div>

                {selectedTreeRow && (!selectedTreeRow.effectiveVisible || selectedTreeRow.effectiveLocked) ? (
                    <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-3 text-[11px] text-neutral-400">
                        {!selectedTreeRow.effectiveVisible ? (
                            <p>
                                This node is currently {selectedTreeRow.hiddenByAncestor ? "hidden by an ancestor group." : "hidden by its own visibility flag."}
                            </p>
                        ) : null}
                        {selectedTreeRow.effectiveLocked ? (
                            <p>
                                This node is currently {selectedTreeRow.lockedByAncestor ? "locked by an ancestor group." : "locked by its own flag."}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {selectedNode.kind === "splat" ? (
                    <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-3 text-[11px] text-neutral-400">
                        Environment nodes stay at the root so the compatibility projection remains stable.
                    </div>
                ) : (
                    <InspectorField label="Parent Group">
                        <select
                            key={`${selectedNode.id}-parent-${selectedNode.parentId ?? "root"}`}
                            data-testid="mvp-node-inspector-parent"
                            disabled={disableNodeEdits}
                            defaultValue={selectedNode.parentId ?? "__root__"}
                            onChange={(event) =>
                                sceneStoreActions.reparentNode(
                                    selectedNode.id,
                                    event.currentTarget.value === "__root__" ? null : event.currentTarget.value,
                                )
                            }
                            className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="__root__">Root</option>
                            {reparentTargets.map((target) => (
                                <option key={target.id} value={target.id}>
                                    {target.label.trim() || "Group"}
                                </option>
                            ))}
                        </select>
                    </InspectorField>
                )}

                <div className="space-y-3">
                    <VectorField
                        label="Position"
                        nodeId={selectedNode.id}
                        values={selectedNode.transform.position}
                        disabled={disableNodeEdits}
                        onCommit={(nextPosition) => sceneStoreActions.updateNodeTransform(selectedNode.id, { position: nextPosition })}
                    />
                    <VectorField
                        label="Rotation"
                        nodeId={selectedNode.id}
                        values={transformRotation}
                        step="0.05"
                        disabled={disableNodeEdits}
                        onCommit={(nextRotation) =>
                            sceneStoreActions.updateNodeTransform(selectedNode.id, {
                                rotation: [nextRotation[0], nextRotation[1], nextRotation[2], 1],
                            })
                        }
                    />
                    <VectorField
                        label="Scale"
                        nodeId={selectedNode.id}
                        values={selectedNode.transform.scale}
                        step="0.05"
                        disabled={disableNodeEdits}
                        onCommit={(nextScale) => sceneStoreActions.updateNodeTransform(selectedNode.id, { scale: nextScale })}
                    />
                </div>

                {cameraNode ? (
                    <div className="grid grid-cols-2 gap-3">
                        <InspectorField label="Role">
                            <select
                                key={`${selectedNode.id}-role-${cameraNode.role}`}
                                disabled={disableNodeEdits}
                                defaultValue={cameraNode.role}
                                onChange={(event) =>
                                    sceneStoreActions.patchCameraNode(selectedNode.id, {
                                        role: event.currentTarget.value as CameraNodeData["role"],
                                    })
                                }
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="viewer">Viewer</option>
                                <option value="shot">Shot</option>
                                <option value="utility">Utility</option>
                            </select>
                        </InspectorField>
                        <InspectorField label="FOV">
                            <input
                                key={`${selectedNode.id}-fov-${cameraNode.fov}`}
                                type="number"
                                step="0.1"
                                disabled={disableNodeEdits}
                                defaultValue={formatNumberInputValue(cameraNode.fov)}
                                onBlur={(event) =>
                                    commitNumberInput(event, cameraNode.fov, (value) =>
                                        sceneStoreActions.patchCameraNode(selectedNode.id, { fov: value }),
                                    )
                                }
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </InspectorField>
                        <InspectorField label="Lens (mm)">
                            <input
                                key={`${selectedNode.id}-lens-${cameraNode.lens_mm}`}
                                type="number"
                                step="0.1"
                                disabled={disableNodeEdits}
                                defaultValue={formatNumberInputValue(cameraNode.lens_mm)}
                                onBlur={(event) =>
                                    commitNumberInput(event, cameraNode.lens_mm, (value) =>
                                        sceneStoreActions.patchCameraNode(selectedNode.id, { lens_mm: value }),
                                    )
                                }
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </InspectorField>
                        <InspectorField label="Near">
                            <input
                                key={`${selectedNode.id}-near-${cameraNode.near}`}
                                type="number"
                                step="0.01"
                                disabled={disableNodeEdits}
                                defaultValue={formatNumberInputValue(cameraNode.near)}
                                onBlur={(event) =>
                                    commitNumberInput(event, cameraNode.near, (value) =>
                                        sceneStoreActions.patchCameraNode(selectedNode.id, { near: value }),
                                    )
                                }
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </InspectorField>
                        <InspectorField label="Far">
                            <input
                                key={`${selectedNode.id}-far-${cameraNode.far}`}
                                type="number"
                                step="1"
                                disabled={disableNodeEdits}
                                defaultValue={formatNumberInputValue(cameraNode.far)}
                                onBlur={(event) =>
                                    commitNumberInput(event, cameraNode.far, (value) =>
                                        sceneStoreActions.patchCameraNode(selectedNode.id, { far: value }),
                                    )
                                }
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </InspectorField>
                    </div>
                ) : null}

                {lightNode ? (
                    <div className="grid grid-cols-2 gap-3">
                        <InspectorField label="Light Type">
                            <select
                                key={`${selectedNode.id}-light-type-${lightNode.lightType}`}
                                disabled={disableNodeEdits}
                                defaultValue={lightNode.lightType}
                                onChange={(event) =>
                                    sceneStoreActions.patchLightNode(selectedNode.id, {
                                        lightType: event.currentTarget.value as LightNodeData["lightType"],
                                    })
                                }
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="directional">Directional</option>
                                <option value="spot">Spot</option>
                                <option value="point">Point</option>
                                <option value="area">Area</option>
                            </select>
                        </InspectorField>
                        <InspectorField label="Intensity">
                            <input
                                key={`${selectedNode.id}-intensity-${lightNode.intensity}`}
                                type="number"
                                step="0.1"
                                disabled={disableNodeEdits}
                                defaultValue={formatNumberInputValue(lightNode.intensity)}
                                onBlur={(event) =>
                                    commitNumberInput(event, lightNode.intensity, (value) =>
                                        sceneStoreActions.patchLightNode(selectedNode.id, { intensity: value }),
                                    )
                                }
                                className="w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </InspectorField>
                        <InspectorField label="Color">
                            <input
                                key={`${selectedNode.id}-color-${lightNode.color}`}
                                type="color"
                                disabled={disableNodeEdits}
                                defaultValue={lightNode.color}
                                onChange={(event) => sceneStoreActions.patchLightNode(selectedNode.id, { color: event.currentTarget.value })}
                                className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-2 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </InspectorField>
                    </div>
                ) : null}

                {meshNode ? (
                    <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-3 text-[11px] text-neutral-400">
                        <p className="text-neutral-200">Asset id: {meshNode.assetId ?? "none"}</p>
                        <p className="mt-1 break-all">Mesh: {meshNode.meshUrl ?? "none"}</p>
                        <p className="mt-1 break-all">
                            Instance: {(meshNode.metadata.instanceId as string | undefined) ?? (meshNode.metadata.instance_id as string | undefined) ?? "none"}
                        </p>
                    </div>
                ) : null}

                {splatNode ? (
                    <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-3 text-[11px] text-neutral-400">
                        <p className="text-neutral-200">Scene id: {splatNode.sceneId ?? "none"}</p>
                        <p className="mt-1 break-all">Viewer: {splatNode.viewerUrl ?? "none"}</p>
                        <p className="mt-1 break-all">Splats: {splatNode.splatUrl ?? "none"}</p>
                    </div>
                ) : null}

                <button
                    type="button"
                    data-testid="mvp-node-inspector-delete"
                    disabled={disableNodeEdits}
                    onClick={() => sceneStoreActions.removeNode(selectedNode.id)}
                    className="w-full rounded-lg border border-rose-900/60 bg-rose-950/20 px-3 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Trash2 className="mr-2 inline h-3.5 w-3.5" />
                    Delete Node
                </button>
            </div>
        </div>
    );
});
