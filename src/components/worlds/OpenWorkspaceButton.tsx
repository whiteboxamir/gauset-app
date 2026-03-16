"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { extractApiError, MVP_API_BASE_URL } from "@/lib/mvp-api";

const LOCAL_DRAFT_KEY = "gauset:mvp:draft:v1";

interface SceneVersionSummary {
    version_id: string;
    saved_at?: string;
}

interface SceneVersionPayload {
    scene_graph?: {
        environment?: unknown;
        assets?: unknown[];
    };
    saved_at?: string;
}

function buttonClassName(variant: "primary" | "secondary", disabled: boolean) {
    const palette =
        variant === "secondary"
            ? "border border-white/15 bg-white/[0.05] text-white hover:border-white/25 hover:bg-white/[0.08]"
            : "bg-white text-black hover:bg-neutral-200";

    return [
        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors",
        palette,
        disabled ? "cursor-not-allowed opacity-60 hover:border-white/15 hover:bg-white/[0.05]" : "",
    ]
        .filter(Boolean)
        .join(" ");
}

async function loadLatestSceneSnapshot(sceneId: string) {
    const versionsResponse = await fetch(`${MVP_API_BASE_URL}/scene/${sceneId}/versions`, {
        cache: "no-store",
    });
    if (!versionsResponse.ok) {
        throw new Error(await extractApiError(versionsResponse, `Version history unavailable (${versionsResponse.status})`));
    }

    const versionsPayload = (await versionsResponse.json()) as { versions?: SceneVersionSummary[] };
    const latestVersion =
        Array.isArray(versionsPayload.versions) && versionsPayload.versions.length > 0 ? versionsPayload.versions[0] : null;

    if (!latestVersion?.version_id) {
        throw new Error("Linked world has no saved versions yet, so the workspace cannot reopen it truthfully.");
    }

    const versionResponse = await fetch(`${MVP_API_BASE_URL}/scene/${sceneId}/versions/${latestVersion.version_id}`, {
        cache: "no-store",
    });
    if (!versionResponse.ok) {
        throw new Error(await extractApiError(versionResponse, `Version restore unavailable (${versionResponse.status})`));
    }

    const versionPayload = (await versionResponse.json()) as SceneVersionPayload;
    const nextGraph = versionPayload.scene_graph ?? { environment: null, assets: [] };

    return {
        sceneId,
        versionId: latestVersion.version_id,
        draft: {
            activeScene: sceneId,
            sceneGraph: nextGraph,
            assetsList: Array.isArray(nextGraph.assets) ? nextGraph.assets : [],
            updatedAt: versionPayload.saved_at ?? latestVersion.saved_at ?? new Date().toISOString(),
        },
    };
}

export function OpenWorkspaceButton({
    projectId,
    sceneId,
    label = "Open workspace",
    disabled = false,
    variant = "primary",
}: {
    projectId?: string | null;
    sceneId?: string | null;
    label?: string;
    disabled?: boolean;
    variant?: "primary" | "secondary";
}) {
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleClick = () => {
        if (disabled || isPending) {
            return;
        }

        startTransition(() => {
            void (async () => {
                try {
                    if (!sceneId) {
                        router.push("/mvp");
                        return;
                    }

                    const snapshot = await loadLatestSceneSnapshot(sceneId);

                    if (projectId) {
                        const reopenResponse = await fetch(`/api/projects/${projectId}/world-links`, {
                            method: "PATCH",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                sceneId,
                                versionId: snapshot.versionId,
                                openedFrom: "project_world_link_surface",
                            }),
                        });

                        if (!reopenResponse.ok) {
                            throw new Error(await extractApiError(reopenResponse, `Project reopen failed (${reopenResponse.status})`));
                        }
                    }

                    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(snapshot.draft));
                    setMessage(null);
                    router.push("/mvp");
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Unable to reopen the linked world.");
                }
            })();
        });
    };

    return (
        <div className="space-y-2">
            <button type="button" disabled={disabled || isPending} onClick={handleClick} className={buttonClassName(variant, disabled || isPending)}>
                {isPending ? "Preparing reopen..." : label}
            </button>
            {message ? <p className="max-w-sm text-xs leading-5 text-amber-300">{message}</p> : null}
        </div>
    );
}
