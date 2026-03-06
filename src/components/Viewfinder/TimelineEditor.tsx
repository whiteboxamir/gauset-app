"use client";

import { motion } from "framer-motion";
import { Play, Sparkles, Scissors, Trash2, SlidersHorizontal } from "lucide-react";

interface TimelineEditorProps {
    pathData: any[];
    onGenerate: () => void;
    onDiscard: () => void;
}

export function TimelineEditor({ pathData, onGenerate, onDiscard }: TimelineEditorProps) {
    const duration = pathData[pathData.length - 1]?.time - pathData[0]?.time || 0;
    const numFrames = pathData.length;

    // We'll generate a few mock "keyframes" purely for UI aesthetics
    const keyframes = Array.from({ length: 6 }).map((_, i) => (i / 5) * 100);

    return (
        <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[800px] bg-black/80 backdrop-blur-3xl border border-indigo-500/30 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.5),0_0_40px_rgba(79,70,229,0.15)] z-40 overflow-hidden flex flex-col"
        >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-indigo-500/5">
                <div className="flex items-center gap-3">
                    <Scissors className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold tracking-widest text-xs uppercase text-white/90">Cinematography Editor</h3>
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] px-2 py-0.5 rounded font-mono">
                        {numFrames} Frames ({duration.toFixed(1)}s)
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onDiscard} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={onGenerate} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-50 transition-colors">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        Send path to Google Veo
                    </button>
                </div>
            </div>

            <div className="p-6">
                {/* Scrubbing Track */}
                <div className="relative h-12 bg-white/5 rounded-lg border border-white/10 mb-6 flex items-center px-4">
                    <div className="absolute left-4 right-4 h-0.5 bg-white/20"></div>
                    <div className="absolute left-4 right-[50%] h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>

                    {/* Render Keyframe nodes */}
                    {keyframes.map((pos, i) => (
                        <div
                            key={i}
                            style={{ left: `calc(${pos}% - 6px)` }}
                            className={`absolute w-3 h-3 rounded-full border-2 border-black ${i <= 2 ? 'bg-indigo-400' : 'bg-white/50'} cursor-pointer hover:scale-150 transition-transform`}
                        />
                    ))}

                    {/* Playhead */}
                    <div className="absolute left-[50%] w-1 h-14 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] cursor-ew-resize -translate-x-1/2 flex items-center justify-center">
                        <div className="w-3 h-3 border border-white/50 rounded-full bg-black mt-16 pointer-events-none"></div>
                    </div>
                </div>

                {/* Tweaks */}
                <div className="flex gap-4">
                    <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Focal Length (mm)</span>
                            <span className="text-sm font-mono text-white/90">24mm - 35mm</span>
                        </div>
                        <SlidersHorizontal className="w-4 h-4 text-white/20" />
                    </div>
                    <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Spline Interpolation</span>
                            <span className="text-sm font-mono text-white/90">Catmull-Rom</span>
                        </div>
                        <SlidersHorizontal className="w-4 h-4 text-white/20" />
                    </div>
                    <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Post-Process Look</span>
                            <span className="text-sm text-indigo-300 font-mono">Dynamic Agent Controlled</span>
                        </div>
                        <Sparkles className="w-4 h-4 text-indigo-400/50" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
