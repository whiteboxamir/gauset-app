import Link from "next/link";

import { AuthPanelShell } from "@/components/auth/AuthPanelShell";
import { AuthStatusNotice } from "@/components/auth/AuthStatusNotice";
import { InviteAcceptanceCard } from "@/components/auth/InviteAcceptanceCard";
import { getInvitationPreview } from "@/server/auth/invitations";
import { sanitizeNextPath } from "@/server/auth/redirects";
import { getAuthSurfaceStatus } from "@/server/auth/surface";

export default async function AcceptInvitePage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string; next?: string }>;
}) {
    const params = await searchParams;
    const nextPath = sanitizeNextPath(params.next);
    const token = String(params.token || "").trim();
    const loginQuery = new URLSearchParams({
        next: nextPath,
    });
    if (token) {
        loginQuery.set("invite_token", token);
    }
    const surfaceStatus = getAuthSurfaceStatus();
    const invitation = token ? await getInvitationPreview(token).catch(() => null) : null;

    return (
        <AuthPanelShell
            eyebrow="Studio Invitation"
            title="Accept studio access"
            body="Studio access stays invite-first all the way through. We send a secure link to the invited email, authenticate that exact account, and only then mount the workspace membership."
            footer={
                <p className="text-sm text-neutral-500">
                    No token?{" "}
                    <Link href={`/auth/login?${loginQuery.toString()}`} className="font-medium text-white transition-opacity hover:opacity-80">
                        Go to login
                    </Link>
                </p>
            }
        >
            <AuthStatusNotice tone={surfaceStatus.tone} title={surfaceStatus.label} body={surfaceStatus.message} className="mb-4" />
            {!token ? (
                <AuthStatusNotice
                    tone="blocked"
                    title="Missing invite token"
                    body="This route needs the invite token from the studio email. Open the latest invite email or ask the studio owner to resend it."
                />
            ) : !invitation ? (
                <AuthStatusNotice
                    tone="blocked"
                    title="Invite could not be resolved"
                    body="The platform could not find this invite token in the current shell. The token may be stale, or this shell may not have the invite-check env configured."
                />
            ) : invitation.status !== "pending" || invitation.expired ? (
                <AuthStatusNotice
                    tone="warning"
                    title="Invite is no longer active"
                    body="This token exists, but it is no longer pending. Ask the studio owner to issue a fresh invite before trying again."
                />
            ) : (
                <InviteAcceptanceCard
                    invitationToken={token}
                    studioName={invitation.studios?.name ?? "Studio"}
                    invitedEmail={invitation.email}
                    role={invitation.role}
                    nextPath={nextPath}
                    authOperational={surfaceStatus.operational}
                />
            )}
        </AuthPanelShell>
    );
}
