"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, X, ShieldAlert, Cpu } from "lucide-react";
import type { Annotation } from "@/components/Viewfinder/AnnotationSystem";

export interface AgentAction {
    type: "moveCamera" | "changeLighting" | "answerQuery" | "generateProp" | "setPostProcessing";
    target?: number[];
    preset?: string;
    assetUrl?: string;
    message: string;
}

interface AgenticChatProps {
    splatUrl: string;
    annotations: Annotation[];
    onAgentAction: (action: AgentAction) => void;
}

export function AgenticChat({ splatUrl, annotations, onAgentAction }: AgenticChatProps) {
    const [isOpen, setIsOpen] = useState(true); // Open by default in Pro Workspace
    const [query, setQuery] = useState("");
    const [messages, setMessages] = useState<{ role: "user" | "ai" | "action"; content: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async () => {
        if (!query.trim() || isLoading) return;

        const userMessage = query.trim();
        setQuery("");
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setIsLoading(true);

        try {
            const response = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: userMessage, splatUrl, annotations }),
            });
            const data = await response.json();

            if (data.success) {
                if (data.action === "answerQuery") {
                    setMessages((prev) => [...prev, { role: "ai", content: data.message }]);
                } else {
                    // It's an executable action
                    setMessages((prev) => [...prev, { role: "action", content: data.message }]);
                    onAgentAction({
                        type: data.action,
                        target: data.target,
                        preset: data.preset,
                        assetUrl: data.assetUrl,
                        message: data.message
                    });
                }
            } else {
                setMessages((prev) => [...prev, { role: "ai", content: "Error parsing agent command." }]);
            }
        } catch (err) {
            setMessages((prev) => [...prev, { role: "ai", content: "Connection to Agentic Layer failed." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        onClick={() => setIsOpen(true)}
                        className="absolute top-6 right-6 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 rounded-full p-4 shadow-2xl transition-all"
                    >
                        <Cpu className="w-6 h-6 text-indigo-400" />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="absolute right-6 top-6 bottom-6 w-96 z-30 flex flex-col bg-black/80 backdrop-blur-3xl border border-indigo-500/30 rounded-3xl shadow-[0_0_60px_rgba(79,70,229,0.15)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-indigo-500/10">
                            <div className="flex items-center gap-3">
                                <Cpu className="w-5 h-5 text-indigo-400" />
                                <h3 className="text-white/90 font-semibold tracking-wide text-sm">Agentic Director</h3>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Warning Banner */}
                        <div className="bg-indigo-500/10 border-b border-indigo-500/20 p-3 px-5 flex items-start gap-3">
                            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-indigo-200/90 leading-relaxed">
                                <strong className="text-indigo-400">AWS Workspace:</strong> Send commands to orchestrate the set (e.g., "Fly to the door", "Make it sunset").
                            </p>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-white/10">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center opacity-50 space-y-4">
                                    <div className="p-4 bg-white/5 rounded-full mb-2">
                                        <Cpu className="w-8 h-8 text-indigo-400" />
                                    </div>
                                    <p className="text-sm font-medium">I am the spatial orchestration agent.</p>
                                    <p className="text-xs max-w-[80%]">Drop a semantic pin in the scene, then command me to move the camera to it.</p>
                                </div>
                            ) : (
                                messages.map((msg, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user"
                                            ? "bg-indigo-600/80 text-white self-end rounded-tr-sm"
                                            : msg.role === "action"
                                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 self-start rounded-tl-sm w-full font-mono text-xs"
                                                : "bg-white/10 text-white/90 self-start border border-white/5 rounded-tl-sm"
                                            }`}
                                    >
                                        {msg.role === "action" && <span className="mr-2">&gt;_</span>}
                                        {msg.content}
                                    </motion.div>
                                ))
                            )}
                            {isLoading && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="bg-white/5 text-white/50 self-start border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex gap-2 items-center"
                                >
                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75" />
                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150" />
                                </motion.div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-black/50 border-t border-white/10">
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                    placeholder="Ask or command..."
                                    className="w-full bg-white/10 border border-white/10 rounded-full pl-5 pr-12 py-3.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!query.trim() || isLoading}
                                    className="absolute right-2 p-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-white/10 disabled:text-white/30 text-white rounded-full transition-all"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
