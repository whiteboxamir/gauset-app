"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AuthActionCode, AuthActionResponse } from "@/server/auth/response";

import { AuthStatusNotice } from "./AuthStatusNotice";

type CallbackPhase = "provider" | "session" | "invite" | "redirect";

function buildAuthEntryHref(pathname: string, nextPath: string, invitationToken?: string | null) {
    const params = new URLSearchParams({
        next: nextPath,
    });

    const normalizedInvitationToken = String(invitationToken || "").trim();
    if (normalizedInvitationToken) {
        params.set("invite_token", normalizedInvitationToken);
    }

    return `${pathname}?${params.toString()}`;
}

export function AuthCallbackClient({
    nextPath,
    invitationToken,
    provider = "magic_link",
    authOperational,
    surfaceCode,
    surfaceMessage,
}: {
    nextPath: string;
    invitationToken?: string | null;
    provider?: "magic_link" | "google" | "sso" | "admin";
    authOperational: boolean;
    surfaceCode: Extract<AuthActionCode, "auth_unavailable" | "database_unavailable">;
    surfaceMessage: string;
}) {
    const router = useRouter();
    const [phase, setPhase] = useState<CallbackPhase>("provider");
    const [message, setMessage] = useState("Reading provider return...");
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<AuthActionCode | null>(null);

    useEffect(() => {
        let cancelled = false;

        const finish = async () => {
            try {
                if (!authOperational) {
                    const payloadError = new Error(surfaceMessage);
                    payloadError.name = surfaceCode;
                    throw payloadError;
                }

                const hashParams = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "");
                const accessToken = hashParams.get("access_token");
                const refreshToken = hashParams.get("refresh_token");
                const errorCode = hashParams.get("error_code") || new URLSearchParams(window.location.search).get("error");
                const errorDescription =
                    hashParams.get("error_description") || new URLSearchParams(window.location.search).get("error_description");

                if (errorCode) {
                    throw new Error(errorDescription || errorCode);
                }

                setPhase("session");
                setMessage("Verifying launch access and securing your session...");

                if (accessToken) {
                    const sessionResponse = await fetch("/api/auth/session", {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            accessToken,
                            refreshToken: refreshToken || undefined,
                            provider,
                        }),
                    });
                    const sessionPayload = (await sessionResponse.json()) as AuthActionResponse;
                    if (!sessionResponse.ok || !sessionPayload.success) {
                        const payloadError = new Error(sessionPayload.message || "Unable to establish session.");
                        payloadError.name = sessionPayload.code ?? "session_unavailable";
                        throw payloadError;
                    }
                } else {
                    const existingResponse = await fetch("/api/auth/session", { cache: "no-store" });
                    const existingPayload = (await existingResponse.json()) as { session?: unknown };
                    if (!existingPayload.session) {
                        throw new Error("No auth session returned from provider.");
                    }
                }

                if (invitationToken) {
                    setPhase("invite");
                    setMessage("Activating studio access...");
                    const finalizeResponse = await fetch("/api/auth/finalize-invite", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            invitationToken,
                        }),
                    });
                    const finalizePayload = (await finalizeResponse.json()) as AuthActionResponse;
                    if (!finalizeResponse.ok || !finalizePayload.success) {
                        const payloadError = new Error(finalizePayload.message || "Unable to finalize invite.");
                        payloadError.name = finalizePayload.code ?? "session_unavailable";
                        throw payloadError;
                    }
                }

                if (!cancelled) {
                    setPhase("redirect");
                    setMessage("Redirecting into the protected surface...");
                    router.replace(nextPath);
                }
            } catch (callbackError) {
                if (!cancelled) {
                    setErrorCode(callbackError instanceof Error ? ((callbackError.name as AuthActionCode) ?? null) : null);
                    setError(callbackError instanceof Error ? callbackError.message : "Unable to finalize auth.");
                }
            }
        };

        void finish();

        return () => {
            cancelled = true;
        };
    }, [authOperational, invitationToken, nextPath, provider, router, surfaceCode, surfaceMessage]);

    const stepOrder: CallbackPhase[] = invitationToken ? ["provider", "session", "invite", "redirect"] : ["provider", "session", "redirect"];
    const currentStepIndex = stepOrder.indexOf(phase);

    return (
        <div className="space-y-5">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    <p className="text-sm text-neutral-300">{message}</p>
                </div>
            </div>

            <div className="space-y-3">
                {stepOrder.map((step, index) => {
                    const complete = !error && index < currentStepIndex;
                    const current = !error && index === currentStepIndex;
                    const label =
                        step === "provider"
                            ? "Provider return"
                            : step === "session"
                              ? "Launch-access check"
                              : step === "invite"
                                ? "Studio invitation"
                                : "Protected redirect";
                    const detail =
                        step === "provider"
                            ? "Read the auth provider response."
                            : step === "session"
                              ? "Validate the token and establish the platform session."
                              : step === "invite"
                                ? "Mount the pending studio membership before entry."
                                : "Send the authenticated operator to the requested surface.";

                    return (
                        <div key={step} className="flex items-start gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div
                                className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                                    error ? "bg-rose-300" : complete ? "bg-emerald-300" : current ? "bg-cyan-200" : "bg-white/20"
                                }`}
                            />
                            <div>
                                <p className="text-sm font-medium text-white">{label}</p>
                                <p className="mt-1 text-sm leading-7 text-neutral-400">{detail}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {error ? <AuthStatusNotice tone="blocked" title="Could not finalize auth" body={error} /> : null}

            {errorCode === "launch_access_required" ? (
                <AuthStatusNotice
                    tone="warning"
                    title="Access still needs approval"
                    body="The provider authenticated the email, but the platform did not confirm launch access for it. This surface will not create live access without approval."
                >
                    <a href="https://gauset.com" className="font-medium text-white transition-opacity hover:opacity-80">
                        Request early access
                    </a>
                </AuthStatusNotice>
            ) : null}

            {errorCode === "invite_not_found" || errorCode === "invite_inactive" ? (
                <AuthStatusNotice
                    tone="warning"
                    title="Invite can no longer be mounted"
                    body="The sign-in returned successfully, but the studio invite token was missing or stale. Ask the studio owner to resend the invite from the platform shell."
                />
            ) : null}

            {errorCode === "auth_unavailable" || errorCode === "database_unavailable" ? (
                <AuthStatusNotice
                    tone="warning"
                    title="This shell is not staging-operational"
                    body={surfaceMessage}
                />
            ) : null}

            {errorCode === "registration_required" ? (
                <AuthStatusNotice
                    tone="info"
                    title="Approved email still needs registration"
                    body="The email is approved, but the account still needs the first controlled creation pass before the login route can finish."
                >
                    <Link
                        href={buildAuthEntryHref("/auth/register", nextPath, invitationToken)}
                        className="font-medium text-white transition-opacity hover:opacity-80"
                    >
                        Go to registration
                    </Link>
                </AuthStatusNotice>
            ) : null}

            {error ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
                    <Link
                        href={buildAuthEntryHref("/auth/login", nextPath, invitationToken)}
                        className="font-medium text-white transition-opacity hover:opacity-80"
                    >
                        Back to login
                    </Link>
                    <a href="https://gauset.com" className="transition-opacity hover:opacity-80">
                        Request early access
                    </a>
                </div>
            ) : null}
        </div>
    );
}
