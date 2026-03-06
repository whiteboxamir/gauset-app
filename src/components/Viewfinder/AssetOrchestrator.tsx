"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Layers, Play, CheckCircle2, Loader2, Sun, Moon, CloudSun, Server } from "lucide-react";

export type AssetType = "splat" | "glb";
export type LightingPreset = "studio" | "cinematic" | "natural";

export interface SceneAsset {
    id: string;
    url: string;
    type: AssetType;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
}

interface AssetOrchestratorProps {
    onImportComplete: (url: string, type: AssetType, lighting: LightingPreset) => void;
}

export function AssetOrchestrator({ onImportComplete }: AssetOrchestratorProps) {
    const [assetType, setAssetType] = useState<AssetType>("splat");
    const [url, setUrl] = useState("https://lumalabs.ai/capture/d80d4876-cf71-4b8a-8b5b-49ffac44cd4a");
    const [lighting, setLighting] = useState<LightingPreset>("cinematic");
    const [isImporting, setIsImporting] = useState(false);
    const [importStep, setImportStep] = useState(0);

    const importPhases = [
        { name: "Phase 1: Backend Resolve & QuarkXR Auth", delay: 800 },
        { name: "Phase 2: Downloading Core Asset", delay: 1500 },
        { name: "Phase 3: Client ACK Flow & Validation", delay: 600 },
        { name: "Phase 4: Applying Dynamic Lighting Presets", delay: 900 },
        { name: "Phase 5: Environment Ready", delay: 400 },
    ];

    const handleImport = async () => {
        if (!url) return;
        setIsImporting(true);
        setImportStep(0);

        for (let i = 0; i < importPhases.length; i++) {
            setImportStep(i);
            await new Promise((r) => setTimeout(r, importPhases[i].delay));
        }

        setIsImporting(false);
        onImportComplete(url, assetType, lighting);
    };

    return (
        <div className="bg-black/80 backdrop-blur-2xl p-5 rounded-2xl border border-white/10 shadow-2xl mb-4 w-full relative overflow-hidden text-sm">
            <div className="flex items-center gap-3 mb-4">
                <Server className="w-5 h-5 text-indigo-400" />
                <h3 className="text-white font-bold uppercase tracking-wider text-xs">Environment Orchestrator</h3>
            </div>

            <AnimatePresence mode="wait">
                {!isImporting ? (
                    <motion.div
                        key="config"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-4"
                    >
                        {/* Asset Type Selection */}
                        <div className="flex gap-2 p-1 bg-white/5 rounded-lg border border-white/5">
                            <button
                                onClick={() => { setAssetType("splat"); setUrl("https://lumalabs.ai/capture/d80d4876-cf71-4b8a-8b5b-49ffac44cd4a"); }}
                                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold flex items-center justify-center gap-2 transition-all ${assetType === "splat" ? "bg-indigo-500 text-white shadow" : "text-white/40 hover:text-white/80"}`}
                            >
                                <Layers className="w-3.5 h-3.5" /> 3D Gaussian Splat
                            </button>
                            <button
                                onClick={() => { setAssetType("glb"); setUrl("https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/room-1/model.gltf"); }}
                                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold flex items-center justify-center gap-2 transition-all ${assetType === "glb" ? "bg-indigo-500 text-white shadow" : "text-white/40 hover:text-white/80"}`}
                            >
                                <Box className="w-3.5 h-3.5" /> Static Mesh (GLB)
                            </button>
                        </div>

                        {/* URL Input */}
                        <div>
                            <label className="text-white/50 text-[10px] uppercase font-bold tracking-widest mb-1.5 block">Asset Source URL</label>
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Lighting Control */}
                        <div>
                            <label className="text-white/50 text-[10px] uppercase font-bold tracking-widest mb-1.5 block">Dynamic Lighting Envelope</label>
                            <div className="flex gap-2">
                                <button onClick={() => setLighting("studio")} className={`flex-1 flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${lighting === 'studio' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                                    <Sun className="w-4 h-4" />
                                    <span className="text-[10px]">Studio</span>
                                </button>
                                <button onClick={() => setLighting("cinematic")} className={`flex-1 flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${lighting === 'cinematic' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                                    <Moon className="w-4 h-4" />
                                    <span className="text-[10px]">Cinematic</span>
                                </button>
                                <button onClick={() => setLighting("natural")} className={`flex-1 flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${lighting === 'natural' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                                    <CloudSun className="w-4 h-4" />
                                    <span className="text-[10px]">Natural</span>
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={handleImport}
                            className="w-full mt-2 bg-white text-black font-bold text-xs py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors"
                        >
                            <Play className="w-4 h-4 fill-black" />
                            Add Asset to Scene
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="importing"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="py-6 flex flex-col items-center justify-center"
                    >
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-6" />
                        <div className="w-full space-y-3">
                            {importPhases.map((phase, idx) => {
                                const isPast = idx < importStep;
                                const isActive = idx === importStep;
                                const isFuture = idx > importStep;

                                return (
                                    <div key={idx} className={`flex items-center gap-3 text-xs ${isActive ? "text-indigo-400" : isPast ? "text-white/60" : "text-white/20"} font-medium transition-colors`}>
                                        {isPast ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <div className="w-4 h-4" />}
                                        {phase.name}
                                    </div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
