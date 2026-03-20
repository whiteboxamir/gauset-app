"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

type OpenWorkspaceButtonVariant = "primary" | "secondary";

const variantClasses: Record<OpenWorkspaceButtonVariant, string> = {
    primary: "bg-white text-black hover:bg-neutral-200",
    secondary: "border border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.08]",
};

export function OpenWorkspaceButton({
    projectId,
    sceneId,
    label = "Open saved world",
    pendingLabel = "Opening saved world record...",
    variant = "primary",
    className,
    disabled = false,
}: {
    projectId?: string;
    sceneId?: string | null;
    label?: string;
    pendingLabel?: string;
    variant?: OpenWorkspaceButtonVariant;
    className?: string;
    disabled?: boolean;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="inline-flex flex-col items-start gap-1">
            <button
                type="button"
                disabled={disabled || isPending}
                onClick={() => {
                    setError(null);
                    startTransition(async () => {
                        if (projectId && sceneId) {
                            try {
                                const response = await fetch(`/api/projects/${projectId}/world-links`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        sceneId,
                                        markOpened: true,
                                    }),
                                });
                                const payload = (await response.json()) as { success?: boolean; message?: string };
                                if (!response.ok || !payload.success) {
                                    throw new Error(payload.message || "Could not record the reopen against the project world record.");
                                }
                            } catch (reopenError) {
                                setError(
                                    reopenError instanceof Error
                                        ? `${reopenError.message} Opening the saved world anyway.`
                                        : "Could not record the reopen against the project world record. Opening the saved world anyway.",
                                );
                            }
                        }

                        const searchParams = new URLSearchParams();
                        if (sceneId) {
                            searchParams.set("scene", sceneId);
                        }
                        if (projectId) {
                            searchParams.set("project", projectId);
                        }

                        if (sceneId) {
                            router.push(`/mvp?${searchParams.toString()}`);
                            return;
                        }

                        if (projectId) {
                            router.push(`/app/worlds/${projectId}`);
                            return;
                        }

                        router.push("/app/worlds");
                    });
                }}
                className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    variantClasses[variant],
                    className,
                )}
            >
                {isPending ? pendingLabel : label}
            </button>
            {error ? <p className="max-w-xs text-[11px] leading-5 text-rose-200">{error}</p> : null}
        </div>
    );
}
