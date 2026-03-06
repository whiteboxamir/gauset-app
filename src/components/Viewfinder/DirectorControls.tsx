"use client";

import { useEffect, useRef } from "react";
import { Copy, Plus, Video, Square, RefreshCcw } from "lucide-react";

interface DirectorControlsProps {
    isRecording: boolean;
    onStart: () => void;
    onStop: () => void;
    prompt: string;
    setPrompt: (v: string) => void;
}

export function DirectorControls({
    isRecording,
    onStart,
    onStop,
    prompt,
    setPrompt,
}: DirectorControlsProps) {
    return (
        <div className="flex flex-col gap-4">
            {/* Prompt Input */}
            <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-2xl">
                <label className="text-white/60 text-xs font-semibold mb-2 block uppercase tracking-wider">
                    Scene Direction
                </label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. A realistic spaceship flies closely past the camera..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none h-20"
                />
            </div>

            {/* Record Action */}
            <div className="flex justify-center items-center pb-8">
                <button
                    onClick={isRecording ? onStop : onStart}
                    className={`flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ease-in-out shadow-lg ${isRecording
                            ? "bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.5)] border-2 border-red-500"
                            : "bg-white/10 hover:bg-white/20 border-2 border-white/30"
                        }`}
                >
                    {isRecording ? (
                        <Square className="w-8 h-8 text-red-500 fill-red-500" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-red-500" />
                    )}
                </button>
            </div>
        </div>
    );
}
