"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuthActionCode, AuthActionData, AuthActionResponse } from "@/server/auth/response";

import { AuthStatusNotice } from "./AuthStatusNotice";

type Mode = "login" | "register";
const REQUEST_ACCESS_URL = "https://gauset.com";

const loginFlow = [
    "Use the approved email already tied to access.",
    "Receive a one-time link instead of a password.",
    "Let the callback re-check launch access before redirect.",
];

const registerFlow = [
    "Use the exact approved or invited email.",
    "Receive a one-time account-creation link.",
    "Let the callback validate access before the first redirect.",
];

function buildAuthEntryHref(
    pathname: string,
    {
        nextPath,
        email,
        invitationToken,
    }: {
        nextPath: string;
        email?: string | null;
        invitationToken?: string | null;
    },
) {
    const params = new URLSearchParams({
        next: nextPath,
    });

    const normalizedEmail = String(email || "").trim();
    if (normalizedEmail) {
        params.set("email", normalizedEmail);
    }

    const normalizedInvitationToken = String(invitationToken || "").trim();
    if (normalizedInvitationToken) {
        params.set("invite_token", normalizedInvitationToken);
    }

    return `${pathname}?${params.toString()}`;
}

export function EmailAuthForm({
    mode,
    nextPath,
    invitationToken,
    authOperational,
    googleEnabled = false,
    showGoogleAuth = false,
    initialEmail = "",
    headline,
    submitLabel,
}: {
    mode: Mode;
    nextPath: string;
    invitationToken?: string | null;
    authOperational: boolean;
    googleEnabled?: boolean;
    showGoogleAuth?: boolean;
    initialEmail?: string;
    headline: string;
    submitLabel: string;
}) {
    const [email, setEmail] = useState(initialEmail);
    const [displayName, setDisplayName] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [responseCode, setResponseCode] = useState<AuthActionCode | null>(null);
    const [responseData, setResponseData] = useState<AuthActionData | undefined>();
    const [isPending, startTransition] = useTransition();

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const normalizedEmail = email.trim().toLowerCase();
    const flow = mode === "login" ? loginFlow : registerFlow;
    const submitDisabled = isPending || !authOperational;

    return (
        <div className="space-y-6">
            <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full border border-cyan-200/20 bg-cyan-200/10 p-2 text-cyan-100">
                        <Mail className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white">{headline}</p>
                        <p className="mt-1 text-sm leading-7 text-neutral-400">
                            No passwords. No open registration blast radius. We issue a one-time link to the approved address and mount the session there.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {flow.map((step, index) => (
                    <div key={step} className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Step {index + 1}</p>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{step}</p>
                    </div>
                ))}
            </div>

            <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Email checkpoint</p>
                <p className="mt-2 text-sm text-neutral-500">
                    {mode === "login"
                        ? "Use the email tied to your approved access. We will send a magic link instead of asking for a password."
                        : "Use the exact email that was approved for early access or attached to a studio invite. We will send a one-time creation link."}
                </p>
            </div>

            {mode === "register" ? (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                    Registration is closed by default. Only approved or invited emails can create an account here.
                </div>
            ) : null}

            <form
                className="space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);
                    setResponseCode(null);
                    setResponseData(undefined);

                    if (!authOperational) {
                        return;
                    }

                    startTransition(async () => {
                        try {
                            const response = await fetch(endpoint, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    email: normalizedEmail,
                                    displayName: displayName || undefined,
                                    next: nextPath,
                                    invitationToken: invitationToken || undefined,
                                }),
                            });
                            const payload = (await response.json()) as AuthActionResponse<AuthActionData>;
                            setResponseCode(payload.code ?? null);
                            setResponseData(payload.data);
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to continue.");
                            }
                            setMessage(payload.message || "Check your inbox.");
                        } catch (authError) {
                            setError(authError instanceof Error ? authError.message : "Unable to continue.");
                        }
                    });
                }}
            >
                <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Email</label>
                    <input
                        type="email"
                        name="email"
                        data-testid="auth-email-input"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="producer@studio.com"
                        required
                        disabled={submitDisabled}
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                </div>

                {mode === "register" ? (
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Display name</label>
                        <input
                            type="text"
                            name="displayName"
                            data-testid="auth-display-name-input"
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            placeholder="Amir"
                            disabled={submitDisabled}
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>
                ) : null}

                <button
                    type="submit"
                    data-testid="auth-submit"
                    disabled={submitDisabled}
                    className={cn(
                        "w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                        "bg-[linear-gradient(135deg,#f8fafc_0%,#dbeafe_48%,#fef3c7_100%)] text-black shadow-[0_18px_45px_rgba(148,163,184,0.16)] hover:scale-[1.01] hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100",
                    )}
                >
                    <span className="inline-flex items-center gap-2">
                        {!authOperational ? "Auth unavailable in this shell" : isPending ? "Sending link..." : submitLabel}
                        {!authOperational || isPending ? null : <ArrowRight className="h-4 w-4" />}
                    </span>
                </button>
            </form>

            {showGoogleAuth ? (
                <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Or continue with</p>
                    {googleEnabled ? (
                        <a
                            href={`/api/auth/oauth/google?next=${encodeURIComponent(nextPath)}`}
                            className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                        >
                            Google
                        </a>
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-500">
                            Google auth is disabled in this environment.
                        </div>
                    )}
                </div>
            ) : (
                <div className="rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-400">
                    This launch surface is intentionally narrowed to approved email links so access stays clean and auditable.
                </div>
            )}

            {message ? (
                <AuthStatusNotice
                    tone="ready"
                    title="Link sent"
                    body={
                        mode === "login"
                            ? `${message} Use ${normalizedEmail} to open it. Gauset will verify launch access again before mounting the session.`
                            : `${message} Use ${normalizedEmail} to finish the first account pass. The callback still re-checks launch access before redirecting.`
                    }
                />
            ) : null}
            {error ? <AuthStatusNotice tone="blocked" title="Could not continue" body={error} /> : null}

            {responseCode === "registration_required" ? (
                <AuthStatusNotice
                    tone="info"
                    title="Register this email first"
                    body="This address is approved, but the account still needs the controlled creation step before it can use the login route."
                >
                    <Link
                        href={
                            responseData?.suggestedPath ??
                            buildAuthEntryHref("/auth/register", {
                                nextPath,
                                email: normalizedEmail,
                                invitationToken,
                            })
                        }
                        className="font-medium text-white transition-opacity hover:opacity-80"
                    >
                        Go to registration
                    </Link>
                </AuthStatusNotice>
            ) : null}

            {responseCode === "launch_access_required" ? (
                <AuthStatusNotice
                    tone="warning"
                    title="Access is still invite-first"
                    body="This route only works for emails that are already approved or invited into a studio. It will not activate a new account until that approval exists."
                >
                    <a href={REQUEST_ACCESS_URL} className="font-medium text-white transition-opacity hover:opacity-80">
                        Request early access
                    </a>
                </AuthStatusNotice>
            ) : null}

            {responseCode === "account_restricted" ? (
                <AuthStatusNotice
                    tone="blocked"
                    title="Account is restricted"
                    body="The email was recognized, but the associated profile is suspended or closed. This entry surface will not reopen it automatically."
                />
            ) : null}

            <div className="space-y-3 text-sm text-neutral-500">
                {mode === "register" ? (
                    <div className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-white/10 bg-white/[0.02] px-4 py-3">
                        <span>Already have access?</span>
                        <Link
                            href={buildAuthEntryHref("/auth/login", {
                                nextPath,
                                invitationToken,
                            })}
                            className="font-medium text-white transition-opacity hover:opacity-80"
                        >
                            Log in
                        </Link>
                    </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>{mode === "login" ? "Need access first?" : "Need approval first?"}</span>
                    <a href={REQUEST_ACCESS_URL} className="font-medium text-white transition-opacity hover:opacity-80">
                        Request early access
                    </a>
                </div>
            </div>
        </div>
    );
}
