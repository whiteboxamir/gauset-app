"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export function CreateProjectPanel({
    compact = false,
    id,
}: {
    compact?: boolean;
    id?: string;
}) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [sceneId, setSceneId] = useState("");
    const [environmentLabel, setEnvironmentLabel] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    return (
        <section id={id} className={cn("rounded-[1.75rem] border border-white/10 bg-black/30", compact ? "p-5" : "p-6")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Create project</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Start a world record</h3>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
                        Start the durable record first. Then build one world, save it once, and keep review, reopen, and handoff attached to that same project-bound source of truth.
                    </p>
                </div>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch("/api/projects", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    name,
                                    description: description || undefined,
                                    sceneId: sceneId || undefined,
                                    environmentLabel: environmentLabel || undefined,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string; projectId?: string };
                            if (!response.ok || !payload.success || !payload.projectId) {
                                throw new Error(payload.message || "Unable to create project.");
                            }

                            setName("");
                            setDescription("");
                            setSceneId("");
                            setEnvironmentLabel("");
                            setMessage("Project record created. Opening the saved-world home...");
                            router.push(`/app/worlds/${payload.projectId}`);
                            router.refresh();
                        } catch (projectError) {
                            setError(projectError instanceof Error ? projectError.message : "Unable to create project.");
                        }
                    });
                }}
            >
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2 lg:col-span-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Project name</label>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                            placeholder="Barcelona hotel interior world"
                            disabled={isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>

                    <div className="space-y-2 lg:col-span-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Description</label>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="What this world is for, what must stay continuous, and who owns it."
                            disabled={isPending}
                            rows={compact ? 3 : 4}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Optional saved world ID</label>
                        <input
                            value={sceneId}
                            onChange={(event) => setSceneId(event.target.value)}
                            placeholder="scene_34dc4347"
                            disabled={isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">World label</label>
                        <input
                            value={environmentLabel}
                            onChange={(event) => setEnvironmentLabel(event.target.value)}
                            placeholder="Lobby preview"
                            disabled={isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Creating project record..." : "Create world record"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
