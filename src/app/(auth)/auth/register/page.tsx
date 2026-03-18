import { redirect } from "next/navigation";

import { AuthPanelShell } from "@/components/auth/AuthPanelShell";
import { AuthStatusNotice } from "@/components/auth/AuthStatusNotice";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { sanitizeNextPath } from "@/server/auth/redirects";
import { getCurrentAuthSession } from "@/server/auth/session";
import { getAuthSurfaceStatus } from "@/server/auth/surface";

export default async function AuthRegisterPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; email?: string; invite_token?: string }>;
}) {
    const params = await searchParams;
    const nextPath = sanitizeNextPath(params.next);
    const invitationToken = String(params.invite_token || "").trim() || null;
    const session = await getCurrentAuthSession();
    const surfaceStatus = getAuthSurfaceStatus();

    if (session) {
        redirect(nextPath);
    }

    return (
        <AuthPanelShell
            eyebrow="Invite-First Registration"
            title="Create your approved account"
            body="Registration is not public. This route only creates an account for an email that is already approved for launch access or attached to an active studio invite, then the callback verifies that access again before entry."
        >
            <AuthStatusNotice tone={surfaceStatus.tone} title={surfaceStatus.label} body={surfaceStatus.message} className="mb-4" />
            <AuthStatusNotice
                tone="info"
                title="Use registration only for the first pass"
                body="If the email already has an active account, go back to login. If the email is tied to a studio invite, the invite will still be attached during the callback after authentication."
                className="mb-4"
            />
            <EmailAuthForm
                mode="register"
                nextPath={nextPath}
                invitationToken={invitationToken}
                authOperational={surfaceStatus.operational}
                initialEmail={params.email ?? ""}
                headline="Use the exact email that was approved for access."
                submitLabel="Send my account link"
            />
        </AuthPanelShell>
    );
}
