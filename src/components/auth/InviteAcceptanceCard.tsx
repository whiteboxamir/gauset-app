"use client";

import { useState, useTransition } from "react";

import Link from "next/link";

import type { AuthActionCode, AuthActionResponse } from "@/server/auth/response";

import { AuthStatusNotice } from "./AuthStatusNotice";

function buildInviteAwareLoginHref(nextPath: string, invitationToken: string) {
    const params = new URLSearchParams({
        next: nextPath,
        invite_token: invitationToken,
    });
    return `/auth/login?${params.toString()}`;
}

export function InviteAcceptanceCard({
    invitationToken,
    studioName,
    invitedEmail,
    role,
    nextPath,
    authOperational,
}: {
    invitationToken: string;
    studioName: string;
    invitedEmail: string;
    role: string;
    nextPath: string;
    authOperational: boolean;
}) {
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [responseCode, setResponseCode] = useState<AuthActionCode | null>(null);
    const [isPending, startTransition] = useTransition();
    const submitDisabled = isPending || !authOperational;

    return (
        <div className="space-y-6">
            <div className="rounded-[1.6rem] border border-white/10 bg-black/30 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Invitation details</p>
                <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                        <dt className="text-neutral-500">Studio</dt>
                        <dd className="text-white">{studioName}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <dt className="text-neutral-500">Role</dt>
                        <dd className="text-white">{role}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <dt className="text-neutral-500">Email</dt>
                        <dd className="text-white">{invitedEmail}</dd>
                    </div>
                </dl>
                <p className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-300">
                    The access link will only work for this exact email. If you need a different address, ask the studio owner to resend the invite correctly.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    "Send the access link to the invited address.",
                    "Authenticate that exact email through the callback.",
                    "Mount the studio membership before redirect.",
                ].map((step, index) => (
                    <div key={step} className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Step {index + 1}</p>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{step}</p>
                    </div>
                ))}
            </div>

            <button
                type="button"
                data-testid="auth-accept-invite-submit"
                disabled={submitDisabled}
                onClick={() => {
                    setMessage(null);
                    setError(null);
                    setResponseCode(null);

                    if (!authOperational) {
                        return;
                    }

                    startTransition(async () => {
                        try {
                            const response = await fetch("/api/auth/accept-invite", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    invitationToken,
                                    next: nextPath,
                                }),
                            });
                            const payload = (await response.json()) as AuthActionResponse;
                            setResponseCode(payload.code ?? null);
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to accept invite.");
                            }
                            setMessage(payload.message || "Check your inbox.");
                        } catch (inviteError) {
                            setError(inviteError instanceof Error ? inviteError.message : "Unable to accept invite.");
                        }
                    });
                }}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,#f8fafc_0%,#dbeafe_48%,#fef3c7_100%)] px-4 py-3 text-sm font-semibold text-black transition-all hover:scale-[1.01] hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            >
                {!authOperational ? "Auth unavailable in this shell" : isPending ? "Sending access link..." : "Send access link"}
            </button>

            {message ? (
                <div data-testid="auth-accept-invite-message">
                    <AuthStatusNotice
                        tone="ready"
                        title="Invite link sent"
                        body={`${message} Open it with ${invitedEmail} so the callback can verify the account and attach ${studioName}.`}
                    />
                </div>
            ) : null}
            {error ? (
                <div data-testid="auth-accept-invite-error">
                    <AuthStatusNotice tone="blocked" title="Could not continue" body={error} />
                </div>
            ) : null}

            {responseCode === "invite_inactive" ? (
                <AuthStatusNotice
                    tone="warning"
                    title="Invite needs to be reissued"
                    body="This token is no longer active. The studio owner needs to send a fresh invite before this access path can continue."
                />
            ) : null}

            {responseCode === "invite_not_found" ? (
                <AuthStatusNotice
                    tone="warning"
                    title="Invite token not recognized"
                    body="The platform could not resolve this token. Ask the studio owner to send the invite again from the team surface."
                />
            ) : null}

            <div className="text-sm text-neutral-500">
                Need a different account?{" "}
                <Link
                    href={buildInviteAwareLoginHref(nextPath, invitationToken)}
                    className="font-medium text-white transition-opacity hover:opacity-80"
                >
                    Switch login route
                </Link>
            </div>
        </div>
    );
}
