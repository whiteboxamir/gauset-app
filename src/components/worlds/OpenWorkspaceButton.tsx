"use client";

import { useTransition } from "react";

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
    label = "Open workspace shell",
    pendingLabel = "Opening...",
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

    return (
        <button
            type="button"
            disabled={disabled || isPending}
            onClick={() => {
                startTransition(async () => {
                    if (projectId && sceneId) {
                        try {
                            await fetch(`/api/projects/${projectId}/world-links`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    sceneId,
                                    markOpened: true,
                                }),
                            });
                        } catch {
                            // Best-effort activity tracking. Launching the authenticated workspace shell still matters most here.
                        }
                    }

                    const searchParams = new URLSearchParams();
                    if (sceneId) {
                        searchParams.set("scene", sceneId);
                    }
                    if (projectId) {
                        searchParams.set("project", projectId);
                    }

                    router.push(searchParams.size > 0 ? `/mvp?${searchParams.toString()}` : "/mvp");
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
    );
}
