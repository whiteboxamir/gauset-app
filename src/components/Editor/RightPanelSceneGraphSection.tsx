"use client";

import React, { useMemo } from "react";
import { Box, Copy, Focus, Layers, Trash2 } from "lucide-react";

import { describeEnvironment } from "@/lib/mvp-product";
import { formatPinTypeLabel, type CameraView, type SpatialPin, type WorkspaceSceneGraph } from "@/lib/mvp-workspace";

export const RightPanelSceneGraphSection = React.memo(function RightPanelSceneGraphSection({
    environment,
    assets,
    cameraViews,
    pins,
    nextLocalAsset,
    onFocusWorkspace,
    onStageNextLocalAsset,
    onFocusView,
    onDeleteView,
    onFocusPin,
    onDeletePin,
    onDuplicateSceneAsset,
    onDeleteSceneAsset,
}: {
    environment: WorkspaceSceneGraph["environment"];
    assets: WorkspaceSceneGraph["assets"];
    cameraViews: CameraView[];
    pins: SpatialPin[];
    nextLocalAsset: any | null;
    onFocusWorkspace: () => void;
    onStageNextLocalAsset: () => void;
    onFocusView: (view: CameraView) => void;
    onDeleteView: (viewId: string) => void;
    onFocusPin: (pin: SpatialPin) => void;
    onDeletePin: (pinId: string) => void;
    onDuplicateSceneAsset: (instanceId: string) => void;
    onDeleteSceneAsset: (instanceId: string) => void;
}) {
    const environmentState = useMemo(() => describeEnvironment(environment), [environment]);
    const sceneGraphItemCount = assets.length + cameraViews.length + pins.length + (environment ? 1 : 0);
    const isolateActionButtonPointer = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
    }, []);

    return (
        <div className="p-4 border-b border-neutral-800 shrink-0" data-testid="mvp-scene-graph">
            <div className="flex items-center gap-2 mb-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Layers className="h-3 w-3" />
                Scene Graph
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Workspace</p>
                    <p className="mt-1 text-sm text-white">{sceneGraphItemCount} staged elements</p>
                    <p className="mt-1 text-[11px] text-neutral-500">{environment ? "Environment anchored" : "No environment yet"}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Coverage</p>
                    <p className="mt-1 text-sm text-white">
                        {cameraViews.length} views · {pins.length} pins
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500">{assets.length} placed assets in the scene</p>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onFocusWorkspace}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-white transition-colors hover:border-blue-500/40 hover:text-blue-200"
                >
                    <Focus className="mr-1 inline h-3.5 w-3.5" />
                    Focus Workspace
                </button>
                <button
                    type="button"
                    onClick={onStageNextLocalAsset}
                    disabled={!nextLocalAsset}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-white transition-colors hover:border-blue-500/40 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Box className="mr-1 inline h-3.5 w-3.5" />
                    {nextLocalAsset ? "Stage Next Asset" : "No Local Assets Yet"}
                </button>
            </div>

            <div className="mt-4 space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {environment ? (
                    <div className="bg-neutral-900/80 rounded-lg px-3 py-2.5 text-emerald-400 border border-emerald-900/30 flex justify-between items-center shadow-inner">
                        <span className="font-medium">{environmentState.lane === "preview" ? "Preview Splat" : "Environment Splat"}</span>
                        <span className="text-[10px] bg-emerald-950/50 px-1.5 py-0.5 rounded text-emerald-500 font-mono tracking-wider">
                            {environmentState.badge}
                        </span>
                    </div>
                ) : null}

                {cameraViews.length > 0 ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 mb-2">Saved Views</p>
                        <div className="space-y-2">
                            {cameraViews.map((view) => (
                                <div key={view.id} className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-xs text-white">{view.label}</p>
                                            <p className="text-[11px] text-neutral-500">
                                                {view.lens_mm.toFixed(0)}mm · FOV {view.fov.toFixed(1)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => onFocusView(view)}
                                                className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800"
                                                title="Focus view"
                                            >
                                                <Focus className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDeleteView(view.id)}
                                                className="p-1 rounded text-rose-300 hover:text-rose-200 hover:bg-rose-950/40"
                                                title="Delete view"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {pins.length > 0 ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 mb-2">Spatial Pins</p>
                        <div className="space-y-2">
                            {pins.map((pin) => (
                                <div key={pin.id} className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-xs text-white">{pin.label}</p>
                                            <p className="text-[11px] text-neutral-500">
                                                {formatPinTypeLabel(pin.type)} · [{pin.position.map((value) => value.toFixed(2)).join(", ")}]
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => onFocusPin(pin)}
                                                className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800"
                                                title="Focus pin"
                                            >
                                                <Focus className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDeletePin(pin.id)}
                                                className="p-1 rounded text-rose-300 hover:text-rose-200 hover:bg-rose-950/40"
                                                title="Delete pin"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {assets.map((asset: any, index: number) => (
                    <div
                        key={asset.instanceId || index}
                        data-testid={`mvp-scene-graph-asset-${asset.instanceId || index}`}
                        className="bg-neutral-900/50 rounded-lg px-3 py-2.5 text-blue-400 border border-blue-900/30 flex flex-col gap-2 hover:border-blue-700/50 hover:bg-neutral-900 transition-colors"
                    >
                        <div className="flex justify-between items-center">
                            <span className="font-medium flex items-center gap-2 truncate">
                                <Box className="h-3 w-3 opacity-50 shrink-0" /> {asset.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    data-testid={`mvp-scene-graph-duplicate-${asset.instanceId || index}`}
                                    onPointerDown={isolateActionButtonPointer}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onDuplicateSceneAsset(asset.instanceId);
                                    }}
                                    className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800"
                                    title="Duplicate"
                                >
                                    <Copy className="pointer-events-none h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    data-testid={`mvp-scene-graph-delete-${asset.instanceId || index}`}
                                    onPointerDown={isolateActionButtonPointer}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onDeleteSceneAsset(asset.instanceId);
                                    }}
                                    className="p-1 rounded text-rose-300 hover:text-rose-200 hover:bg-rose-950/40"
                                    title="Delete"
                                >
                                    <Trash2 className="pointer-events-none h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        <span className="text-xs text-neutral-500 font-mono">
                            pos [{(asset.position ?? [0, 0, 0]).map((value: number) => Number(value).toFixed(2)).join(", ")}]
                        </span>
                    </div>
                ))}

                {assets.length === 0 && !environment ? (
                    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-4 py-4">
                        <p className="text-sm text-white">Nothing is staged yet.</p>
                        <p className="mt-2 text-xs text-neutral-400">
                            Generate a preview or reconstruction on the left, save views from the viewer, drop pins for blocking notes,
                            and place assets here for layout.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={onFocusWorkspace}
                                className="rounded-full border border-neutral-800 bg-black/20 px-3 py-2 text-[11px] text-neutral-200 hover:border-blue-500/40 hover:text-blue-200"
                            >
                                Scout Viewer
                            </button>
                            <button
                                type="button"
                                onClick={onStageNextLocalAsset}
                                disabled={!nextLocalAsset}
                                className="rounded-full border border-neutral-800 bg-black/20 px-3 py-2 text-[11px] text-neutral-200 hover:border-blue-500/40 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {nextLocalAsset ? "Place First Asset" : "Generate an Asset First"}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
});
