"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { DirectorControls } from "@/components/Viewfinder/DirectorControls";
import { AgenticChat, AgentAction } from "@/components/Viewfinder/AgenticChat";
import { AssetOrchestrator, AssetType, LightingPreset, SceneAsset } from "@/components/Viewfinder/AssetOrchestrator";
import { ImageIngestionFlow } from "@/components/Viewfinder/ImageIngestionFlow";
import { Annotation } from "@/components/Viewfinder/AnnotationSystem";
import { TimelineEditor } from "@/components/Viewfinder/TimelineEditor";
import { Layers, Video, Sparkles, Navigation, MapPin, Save } from "lucide-react";

const SceneViewer = dynamic(() => import("@/components/Viewfinder/SceneViewer"), {
    ssr: false,
});

export default function ProPage() {
    const [isRecording, setIsRecording] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [recordedPath, setRecordedPath] = useState<any[] | null>(null);
    const [assets, setAssets] = useState<SceneAsset[]>([]);
    const [lightingPreset, setLightingPreset] = useState<LightingPreset>("cinematic");
    const [shaderPreset, setShaderPreset] = useState<string>("natural");
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [showOrchestrator, setShowOrchestrator] = useState(false);

    // Annotation State
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [isPlacingAnnotation, setIsPlacingAnnotation] = useState(false);

    // Asset Selection State
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

    // Agent State
    const [agentTarget, setAgentTarget] = useState<number[] | null>(null);

    const handleExportScenario = () => {
        const payload = {
            assets,
            lightingPreset,
            shaderPreset,
            annotations,
            prompt
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "gauset-scene-export.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleAgentAction = (action: AgentAction) => {
        if (action.type === "changeLighting" && action.preset) {
            setLightingPreset(action.preset as LightingPreset);
        } else if (action.type === "moveCamera" && action.target) {
            setAgentTarget(action.target);
            // Reset the target after completion to allow manual control again
            setTimeout(() => setAgentTarget(null), 3000);
        } else if (action.type === "generateProp" && action.assetUrl) {
            const newAsset: SceneAsset = {
                id: Math.random().toString(36).substring(7),
                url: action.assetUrl,
                type: "glb",
                position: [action.target?.[0] || 0, action.target?.[1] || 0, action.target?.[2] || 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1]
            };
            setAssets(prev => [...prev, newAsset]);
        } else if (action.type === "setPostProcessing" && action.preset) {
            setShaderPreset(action.preset);
        }
    };

    useEffect(() => {
        // Listen for the custom event from the SceneViewer payload
        const handleRecordingComplete = (event: any) => {
            const { path } = event.detail;
            console.log("Received recorded path, showing timeline editor. length:", path.length, "frames");
            setRecordedPath(path);
        };

        window.addEventListener("gauset-recording-complete", handleRecordingComplete);
        return () => {
            window.removeEventListener("gauset-recording-complete", handleRecordingComplete);
        };
    }, []);

    const handleGenerateVideo = async () => {
        if (!recordedPath) return;
        setIsGenerating(true);
        setRecordedPath(null); // Hide timeline when generating

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: prompt || "A cinematic journey through the world",
                    pathData: recordedPath
                }),
            });

            const data = await response.json();

            if (data.success && data.videoUrl) {
                setVideoUrl(data.videoUrl);
            } else {
                console.error("Failed to generate video:", data.error);
            }
        } catch (err) {
            console.error("API error:", err);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDiscardPath = () => {
        setRecordedPath(null);
    };

    const handleStartRecording = () => {
        setVideoUrl(null); // Reset prev video
        setRecordedPath(null); // Reset previous path
        setIsRecording(true);
    };

    const handleStopRecording = () => {
        setIsRecording(false);
    };

    return (
        <div className="flex w-full h-screen bg-[#0a0a0a] text-white overflow-hidden font-sans">

            {/* Sidebar / Tools Panel (Pro Workspace) */}
            <div className="w-80 h-full bg-[#111] border-r border-white/10 flex flex-col z-20 shadow-2xl shrink-0">
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3 top-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-indigo-400" />
                        </div>
                        <h1 className="font-bold tracking-widest text-sm uppercase">Gauset Pro</h1>
                    </div>
                    {isSceneReady && (
                        <button
                            onClick={handleExportScenario}
                            title="Export Scene Configuration"
                            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-white/70 hover:text-white flex items-center gap-2 text-xs"
                        >
                            <Save className="w-4 h-4" /> Save
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-5 pb-24 space-y-6">
                    {/* Only show orchestration if a scene isn't loaded */}
                    {!isSceneReady && !videoUrl ? (
                        <div className="space-y-2">
                            <div className="text-xs uppercase tracking-widest text-white/40 mb-3 font-semibold px-1">1. Initialize Workspace</div>
                            <ImageIngestionFlow
                                onGenerationComplete={(url) => {
                                    const newAsset: SceneAsset = {
                                        id: Math.random().toString(36).substring(7),
                                        url,
                                        type: "splat",
                                        position: [0, 0, 0],
                                        rotation: [0, 0, 0],
                                        scale: [1, 1, 1]
                                    };
                                    setAssets([newAsset]);
                                    setLightingPreset("cinematic");
                                    setIsSceneReady(true);
                                }}
                            />
                            <div className="relative flex items-center py-5">
                                <div className="flex-grow border-t border-white/10"></div>
                                <span className="flex-shrink-0 mx-4 text-white/30 text-xs font-medium">OR ADVANCED</span>
                                <div className="flex-grow border-t border-white/10"></div>
                            </div>
                            <AssetOrchestrator
                                onImportComplete={(url, type, lighting) => {
                                    const newAsset: SceneAsset = {
                                        id: Math.random().toString(36).substring(7),
                                        url,
                                        type,
                                        position: [0, 0, 0],
                                        rotation: [0, 0, 0],
                                        scale: [1, 1, 1]
                                    };
                                    setAssets([newAsset]);
                                    setLightingPreset(lighting);
                                    setIsSceneReady(true);
                                }}
                            />
                        </div>
                    ) : (
                        /* Workspace Active Controls */
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="text-xs uppercase tracking-widest text-white/40 mb-3 font-semibold px-1 flex items-center gap-2">
                                <Layers className="w-4 h-4" /> Scene Graph
                            </div>
                            <div className="space-y-2">
                                {assets.map((asset, idx) => (
                                    <div key={asset.id} className={`bg-white/5 border p-3 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${selectedAssetId === asset.id ? 'border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.2)]' : 'border-white/10 hover:border-white/20'}`} onClick={() => setSelectedAssetId(asset.id)}>
                                        <div className="flex flex-col gap-1">
                                            <p className="text-xs text-emerald-400 font-mono flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${selectedAssetId === asset.id ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                                                {asset.type.toUpperCase()} Layer {idx + 1}
                                            </p>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setAssets(assets.filter(a => a.id !== asset.id)); if (selectedAssetId === asset.id) setSelectedAssetId(null); }} className="text-red-400/50 hover:text-red-400 text-xs transition-colors p-1">Remove</button>
                                    </div>
                                ))}

                                {!showOrchestrator ? (
                                    <button
                                        onClick={() => setShowOrchestrator(true)}
                                        className="w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border bg-white/5 border-white/10 text-white/80 hover:bg-white/10 mt-2"
                                    >
                                        + Add New Asset
                                    </button>
                                ) : (
                                    <div className="mt-4 bg-black/40 p-3 rounded-xl border border-white/5">
                                        <AssetOrchestrator
                                            onImportComplete={(url, type, lighting) => {
                                                const newAsset: SceneAsset = {
                                                    id: Math.random().toString(36).substring(7),
                                                    url,
                                                    type,
                                                    position: [0, 0, 0],
                                                    rotation: [0, 0, 0],
                                                    scale: [1, 1, 1]
                                                };
                                                setAssets([...assets, newAsset]);
                                                setLightingPreset(lighting);
                                                setShowOrchestrator(false);
                                            }}
                                        />
                                        <button onClick={() => setShowOrchestrator(false)} className="w-full text-center text-xs text-white/40 mt-3 hover:text-white transition-colors">Cancel</button>
                                    </div>
                                )}
                            </div>

                            <div className="text-xs uppercase tracking-widest text-white/40 pt-4 mb-3 font-semibold px-1 flex items-center gap-2">
                                <MapPin className="w-4 h-4" /> Semantic Annotations
                            </div>
                            <div className="space-y-3">
                                <button
                                    onClick={() => setIsPlacingAnnotation(!isPlacingAnnotation)}
                                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${isPlacingAnnotation
                                        ? "bg-indigo-500/20 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                                        : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                                        }`}
                                >
                                    <MapPin className="w-3.5 h-3.5" />
                                    {isPlacingAnnotation ? "Click on 3D mesh to place pin" : "Add New Spatial Pin"}
                                </button>

                                {annotations.length > 0 && (
                                    <div className="flex flex-col gap-3 mt-4">
                                        {annotations.map(a => (
                                            <div key={a.id} className="bg-black/40 p-3 rounded-xl border border-white/10 flex flex-col gap-2">
                                                <div className="flex items-center justify-between pb-1 border-b border-white/5">
                                                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                                                        <MapPin className="w-3.5 h-3.5 text-indigo-400" /> <span className="font-mono">{a.id}</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button className="text-indigo-400 hover:text-indigo-300 transition-colors text-[10px] uppercase font-bold tracking-wider" onClick={() => setAgentTarget([a.position.x, a.position.y, a.position.z])}>Focus</button>
                                                        <button className="text-red-400 hover:text-red-300 transition-colors text-[10px] uppercase font-bold tracking-wider" onClick={() => setAnnotations(prev => prev.filter(x => x.id !== a.id))}>Del</button>
                                                    </div>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={a.text}
                                                    onChange={(e) => setAnnotations(prev => prev.map(x => x.id === a.id ? { ...x, text: e.target.value } : x))}
                                                    className="w-full bg-white/5 border border-transparent rounded p-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-colors"
                                                    placeholder="Annotation Text..."
                                                />
                                                <select
                                                    value={a.type}
                                                    onChange={(e) => setAnnotations(prev => prev.map(x => x.id === a.id ? { ...x, type: e.target.value as any } : x))}
                                                    className="w-full bg-white/5 border border-transparent rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-colors appearance-none cursor-pointer"
                                                >
                                                    <option value="general">General Note</option>
                                                    <option value="egress">Egress Point</option>
                                                    <option value="hazard">Hazard</option>
                                                    <option value="lighting">Lighting Request</option>
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="text-xs uppercase tracking-widest text-white/40 pt-4 mb-3 font-semibold px-1 flex items-center gap-2">
                                <Video className="w-4 h-4" /> Camera Director
                            </div>
                            {!videoUrl && (
                                <DirectorControls
                                    isRecording={isRecording}
                                    onStart={handleStartRecording}
                                    onStop={handleStopRecording}
                                    prompt={prompt}
                                    setPrompt={setPrompt}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Viewport Area */}
            <div className="flex-1 relative bg-black/90">
                {/* 3D Scene Viewer */}
                {!videoUrl && isSceneReady && (
                    <div className={"absolute inset-0 " + (isPlacingAnnotation ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing")}>
                        <SceneViewer
                            isRecording={isRecording}
                            assets={assets}
                            lighting={lightingPreset}
                            shaderPreset={shaderPreset}
                            isPlacingAnnotation={isPlacingAnnotation}
                            annotations={annotations}
                            onAnnotationAdded={(ann) => {
                                setAnnotations(prev => [...prev, ann]);
                                setIsPlacingAnnotation(false);
                            }}
                            agentTargetPosition={agentTarget}
                            selectedAssetId={selectedAssetId}
                            onAssetSelect={setSelectedAssetId}
                            onAssetTransform={(id, pos, rot, scale) => {
                                setAssets(prev => prev.map(a => a.id === id ? { ...a, position: pos, rotation: rot, scale: scale } : a));
                            }}
                        />

                        {/* Status Overlay */}
                        <div className="absolute top-6 left-6 pointer-events-none flex gap-3">
                            {isRecording && (
                                <div className="flex items-center gap-2 animate-pulse bg-red-500/20 text-red-500 text-xs font-bold px-4 py-2 rounded-full backdrop-blur-md border border-red-500/50 shadow-lg">
                                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full inline-block" />
                                    CAPTURING PATH
                                </div>
                            )}
                        </div>

                        {/* Agentic Chat window floats over the viewport */}
                        <AgenticChat
                            splatUrl={assets[0]?.url || ""}
                            annotations={annotations}
                            onAgentAction={handleAgentAction}
                        />

                        {/* Custom Timeline Editor appears after recording complete */}
                        {recordedPath && !isGenerating && !videoUrl && (
                            <TimelineEditor
                                pathData={recordedPath}
                                onGenerate={handleGenerateVideo}
                                onDiscard={handleDiscardPath}
                            />
                        )}
                    </div>
                )}

                {/* Empty State */}
                {!isSceneReady && !videoUrl && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 select-none pointer-events-none">
                        <Navigation className="w-32 h-32 text-indigo-400/20 mb-8" />
                        <h2 className="text-4xl font-bold tracking-tighter text-white/30">Workspace Empty</h2>
                        <p className="text-white/40 mt-2 font-mono text-sm uppercase">Awaiting environment initiation.</p>
                    </div>
                )}

                {/* Veo Generating Overlay */}
                {isGenerating && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-3xl z-40 flex flex-col items-center justify-center">
                        <div className="flex flex-col items-center gap-6 bg-white/5 p-12 rounded-3xl border border-white/10 shadow-2xl">
                            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(79,70,229,0.5)]"></div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-white tracking-tight mb-2">Google Veo is Rendering</h3>
                                <p className="text-sm text-indigo-300 font-mono tracking-widest uppercase">Synthesizing path to video...</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Video Playback Layer */}
                {videoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
                        <div className="w-full h-full max-w-6xl p-8 flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-bold tracking-tight pb-1 border-b border-white/20">Final Render</h3>
                                <button
                                    onClick={() => setVideoUrl(null)}
                                    className="px-6 py-2 bg-white/10 text-white hover:bg-white/20 font-semibold rounded-full border border-white/20 transition-all text-sm"
                                >
                                    Dismiss to Viewfinder
                                </button>
                            </div>
                            <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center relative">
                                <video
                                    src={videoUrl}
                                    controls
                                    autoPlay
                                    loop
                                    className="absolute inset-0 w-full h-full object-contain bg-black rounded-lg"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
