'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Layers, Crosshair, Box } from 'lucide-react';

export function EngineSimulation() {
    const [step, setStep] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setStep((prev) => (prev + 1) % 4);
        }, 4000);
        return () => clearInterval(timer);
    }, []);

    const steps = [
        { title: "Ingesting Assets", desc: "Processing raw footage into Gaussian Splats", icon: Layers },
        { title: "World Reconstruction", desc: "Extracting DOM explicit 3D structure", icon: Box },
        { title: "Agent Parameterization", desc: "Assigning neural directors to scenes", icon: Crosshair },
        { title: "Persistent Render", desc: "Live, deterministic virtual environment", icon: LayoutDashboard },
    ];

    return (
        <div className="relative w-full aspect-[4/3] md:aspect-[21/9] rounded-[2rem] border border-white/10 bg-[#020202] overflow-hidden flex flex-col md:flex-row shadow-[0_0_100px_rgba(0,255,157,0.05)]">

            {/* Sidebar UI */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/10 bg-white/[0.02] p-6 flex flex-col gap-6 z-10 font-mono text-xs text-neutral-400">
                <div className="flex items-center gap-2 text-white/80 pb-4 border-b border-white/10">
                    <div className="w-2 h-2 rounded-full bg-[#00ff9d] animate-pulse" />
                    <span className="tracking-widest uppercase">Gauset Node_01</span>
                </div>

                <div className="flex flex-col gap-4">
                    {steps.map((s, i) => {
                        const Icon = s.icon;
                        const active = i === step;
                        return (
                            <div key={i} className={`flex items-start gap-3 transition-colors duration-500 ${active ? 'text-[#00ff9d]' : 'text-neutral-500'}`}>
                                <Icon className={`w-4 h-4 mt-0.5 ${active ? 'opacity-100' : 'opacity-50'}`} />
                                <div className="flex flex-col">
                                    <span className="font-semibold tracking-wide">{s.title}</span>
                                    {active && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="text-white/60 mt-1 leading-relaxed">
                                            {s.desc}
                                            <div className="w-full h-1 bg-white/10 rounded-full mt-3 overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-[#00ff9d]"
                                                    initial={{ width: "0%" }}
                                                    animate={{ width: "100%" }}
                                                    transition={{ duration: 4, ease: "linear" }}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Main Viewport Simulation */}
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                {/* Grid Background */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />

                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.div key="1" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, filter: "blur(10px)" }} transition={{ duration: 0.8 }} className="absolute inset-0 flex items-center justify-center">
                            <div className="grid grid-cols-4 gap-4 p-12 w-full h-full opacity-30 mix-blend-screen">
                                {Array.from({ length: 16 }).map((_, i) => (
                                    <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }} className="bg-white/20 rounded-md" />
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div key="2" initial={{ opacity: 0, rotateX: 45 }} animate={{ opacity: 1, rotateX: 0 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 1 }} className="absolute w-64 h-64 border border-[#00ff9d]/30" style={{ perspective: "1000px" }}>
                            <motion.div animate={{ rotateY: 360, rotateZ: 180 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="w-full h-full border border-white/20 relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-[#00ff9d]/50 rounded-full" />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-white/10 rounded-full" />
                            </motion.div>
                            <div className="absolute bottom-4 left-4 text-[#00ff9d] text-xs font-mono">DOM Mapped: 48.2M vertices</div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative w-full h-full">
                            {/* Crosshairs moving around */}
                            <motion.div animate={{ x: [0, 100, -50, 0], y: [0, -50, 100, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                <Crosshair className="w-16 h-16 text-white/50" strokeWidth={1} />
                                <div className="absolute top-full left-0 mt-2 text-[10px] text-white/50 font-mono tracking-widest uppercase">Target_Lock / Cam_01</div>
                            </motion.div>
                            <motion.div animate={{ x: [-100, 50, -100], y: [100, -50, 100] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/3 left-1/3 pointer-events-none">
                                <Crosshair className="w-8 h-8 text-[#00ff9d]/50" strokeWidth={1} />
                            </motion.div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div key="4" initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }} className="w-full h-full relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] animate-[shimmer_3s_infinite]" />
                            <div className="absolute inset-0 bg-[#00ff9d]/[0.02] mix-blend-overlay" />
                            <div className="absolute bottom-6 right-6 text-white/80 font-mono text-xs flex flex-col items-end gap-1">
                                <span className="text-[#00ff9d]">LIVE DIRECT</span>
                                <span>FPS: 120.0</span>
                                <span>LATENCY: 12ms</span>
                            </div>
                            {/* Render a cool center glowing orb representing the finished world */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] aspect-square rounded-full bg-white/5 blur-2xl" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20%] aspect-square rounded-full bg-[#00ff9d]/20 blur-xl animate-pulse" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Global HUD elements */}
                <div className="absolute top-4 right-4 text-[10px] font-mono tracking-widest text-neutral-600 flex gap-4">
                    <span>SYS_OK</span>
                    <span>MEM: 64.2TB</span>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5">
                    <motion.div
                        className="h-full bg-white/20"
                        animate={{ width: ["0%", "100%", "0%"], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    />
                </div>
            </div>
        </div>
    );
}
