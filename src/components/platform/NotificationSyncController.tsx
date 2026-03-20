"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NotificationSyncController({
    workspaceId,
    syncedAt,
    stale,
}: {
    workspaceId: string | null;
    syncedAt: string | null;
    stale: boolean;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const attemptedKeysRef = useRef<Set<string>>(new Set());
    const syncKey = workspaceId ? `${workspaceId}:${syncedAt ?? "none"}` : null;

    useEffect(() => {
        if (!workspaceId || !stale || !syncKey || attemptedKeysRef.current.has(syncKey) || isPending) {
            return;
        }

        attemptedKeysRef.current.add(syncKey);
        let cancelled = false;

        void (async () => {
            try {
                const response = await fetch("/api/account/notifications/sync", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    cache: "no-store",
                });
                if (!response.ok || cancelled) {
                    return;
                }

                startTransition(() => {
                    router.refresh();
                });
            } catch {
                // Keep the stale shell summary if the background sync fails.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isPending, router, stale, syncKey, workspaceId]);

    return null;
}
