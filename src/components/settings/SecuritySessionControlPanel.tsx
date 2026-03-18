"use client";

import type { ReactNode } from "react";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { PlatformSessionRecord } from "@/server/contracts/security";

import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";

function SessionCard({
    session,
    canRevoke,
    onRevoke,
    isPending,
}: {
    session: PlatformSessionRecord;
    canRevoke: boolean;
    onRevoke: (sessionId: string) => void;
    isPending: boolean;
}) {
    return (
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">{session.label}</p>
                        {session.isCurrent ? <StatusBadge label="Current" tone="info" /> : null}
                        <StatusBadge label={session.provider} tone="neutral" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Authenticated {formatDateTime(session.authenticatedAt)}. Last seen {formatDateTime(session.lastSeenAt)}.
                    </p>
                    {session.revokedAt ? (
                        <p className="mt-2 text-sm leading-6 text-rose-200">
                            Revoked {formatDateTime(session.revokedAt)}{session.revokedReason ? ` · ${session.revokedReason}` : ""}
                        </p>
                    ) : null}
                </div>
                {canRevoke ? (
                    <button
                        type="button"
                        data-testid="security-revoke-session"
                        disabled={isPending}
                        onClick={() => onRevoke(session.sessionId)}
                        className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 transition-colors hover:border-rose-300/30 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Revoke
                    </button>
                ) : null}
            </div>
        </article>
    );
}

export function SecuritySessionControlPanel({
    currentSession,
    otherSessions,
    legacySessionDetected,
    actionSlot,
}: {
    currentSession: PlatformSessionRecord | null;
    otherSessions: PlatformSessionRecord[];
    legacySessionDetected: boolean;
    actionSlot?: ReactNode;
}) {
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const revokeSession = (sessionId: string) => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/account/security/sessions/${encodeURIComponent(sessionId)}`, {
                    method: "DELETE",
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to revoke tracked session.");
                }

                setMessage("Tracked session revoked.");
                router.refresh();
            } catch (sessionError) {
                setError(sessionError instanceof Error ? sessionError.message : "Unable to revoke tracked session.");
            }
        });
    };

    const revokeOthers = () => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch("/api/account/security/revoke-others", {
                    method: "POST",
                });
                const payload = (await response.json()) as { success?: boolean; message?: string; revokedCount?: number };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to revoke other tracked sessions.");
                }

                setMessage(`Revoked ${payload.revokedCount ?? 0} other tracked session${payload.revokedCount === 1 ? "" : "s"}.`);
                router.refresh();
            } catch (sessionError) {
                setError(sessionError instanceof Error ? sessionError.message : "Unable to revoke other tracked sessions.");
            }
        });
    };

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Tracked sessions</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Current device and other active sessions</h3>
                    <p className="mt-3 text-sm leading-7 text-neutral-400">
                        Tracked platform sessions are created on the next auth cycle and enforced on subsequent requests. Legacy sessions can keep working temporarily, but they are not fully revocable.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {actionSlot}
                    <button
                        type="button"
                        data-testid="security-revoke-others"
                        disabled={isPending || !currentSession || otherSessions.length === 0}
                        onClick={revokeOthers}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Revoke other sessions
                    </button>
                </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                <StatusBadge label={currentSession ? "Tracked current session" : legacySessionDetected ? "Legacy session" : "No tracked session"} tone={currentSession ? "success" : "warning"} />
                <StatusBadge label={`${otherSessions.length} other active`} tone={otherSessions.length > 0 ? "warning" : "neutral"} />
            </div>

            {legacySessionDetected ? (
                <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    This browser is still using a legacy auth session. It will remain readable until the next auth cycle, but it cannot be fully managed until a tracked platform session is issued.
                </p>
            ) : null}

            <div className="mt-5 space-y-3">
                {currentSession ? (
                    <SessionCard session={currentSession} canRevoke={false} onRevoke={revokeSession} isPending={isPending} />
                ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                        No tracked current session is mounted on this browser yet.
                    </div>
                )}

                {otherSessions.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                        No other tracked sessions are currently active for this account.
                    </div>
                ) : (
                    otherSessions.map((session) => (
                        <SessionCard key={session.sessionId} session={session} canRevoke onRevoke={revokeSession} isPending={isPending} />
                    ))
                )}
            </div>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
