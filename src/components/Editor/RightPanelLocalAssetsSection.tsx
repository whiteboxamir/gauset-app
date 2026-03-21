"use client";

import React from "react";
import { Box } from "lucide-react";

import { assetLibraryKey } from "./rightPanelShared";

export const RightPanelLocalAssetsSection = React.memo(function RightPanelLocalAssetsSection({
    assetsList,
    sceneAssetCount,
    nextLocalAsset,
    libraryAssetCounts,
    onHandleDragStart,
    onAddAssetToScene,
}: {
    assetsList: any[];
    sceneAssetCount: number;
    nextLocalAsset: any | null;
    libraryAssetCounts: Map<string, number>;
    onHandleDragStart: (event: React.DragEvent, asset: any) => void;
    onAddAssetToScene: (asset: any) => void;
}) {
    return (
        <div className="p-4 bg-neutral-900/20 shrink-0">
            <div className="flex items-center gap-2 mb-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Box className="h-3 w-3" />
                Local Assets
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Library</p>
                    <p className="mt-1 text-sm text-white">{assetsList.length} assets ready</p>
                    <p className="mt-1 text-[11px] text-neutral-500">Click or drag assets into the viewer.</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Scene Usage</p>
                    <p className="mt-1 text-sm text-white">{sceneAssetCount} staged instances</p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                        {nextLocalAsset ? `${nextLocalAsset.name} is next to place.` : "Generate or restore assets to start layout."}
                    </p>
                </div>
            </div>

            <p className="mt-3 text-[11px] text-neutral-500">
                Filmmaker workflow: build the environment first, then click or drag hero props into the viewer and place notes or views around them.
            </p>

            {assetsList.length > 0 ? (
                <div className="mt-4 grid max-h-[30rem] grid-cols-2 gap-3 overflow-y-auto pb-8 pr-1">
                    {assetsList.map((asset: any, index: number) => (
                        <div
                            key={asset.id || index}
                            draggable
                            onDragStart={(event) => onHandleDragStart(event, asset)}
                            onClick={() => onAddAssetToScene(asset)}
                            className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 hover:border-blue-500/50 cursor-grab active:cursor-grabbing transition-all group aspect-square flex flex-col justify-between hover:shadow-xl hover:shadow-black/50 animate-in zoom-in-95 duration-200"
                            title="Click to place in scene or drag into the viewer"
                        >
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                                    {(libraryAssetCounts.get(assetLibraryKey(asset, index)) ?? 0) > 0
                                        ? `${libraryAssetCounts.get(assetLibraryKey(asset, index))} in scene`
                                        : "Ready to place"}
                                </span>
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onAddAssetToScene(asset);
                                    }}
                                    className="rounded-full border border-neutral-800 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-200 hover:border-blue-500/40 hover:text-blue-200"
                                >
                                    Place
                                </button>
                            </div>
                            <div
                                className="w-full flex-1 bg-gradient-to-tr from-neutral-800 to-neutral-700 rounded-lg mb-2 overflow-hidden relative shadow-inner bg-cover bg-center"
                                style={asset.preview ? { backgroundImage: `url(${asset.preview})` } : undefined}
                            >
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-neutral-900/40 transition-opacity backdrop-blur-[2px]">
                                    <div className="bg-blue-600 text-white rounded-full p-1 shadow-lg pointer-events-none">
                                        <Box className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-center text-neutral-400 font-medium truncate group-hover:text-blue-200">{asset.name}</p>
                                <p className="mt-1 text-[10px] text-center text-neutral-400">
                                    Click to stage at origin or drag into the viewer.
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mt-4 flex min-h-[10rem] items-center justify-center rounded-xl border-2 border-dashed border-neutral-800/50 bg-neutral-900/30 px-4 py-6 text-center">
                    <div>
                        <p className="text-sm text-white">No local assets yet.</p>
                        <p className="mt-2 text-xs text-neutral-500">
                            Generate an asset from a selected frame in the left rail. When it finishes, it will appear here with one-click
                            staging into the scene.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
});
