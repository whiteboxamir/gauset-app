import { redirect } from "next/navigation";

import { AuthPanelShell } from "@/components/auth/AuthPanelShell";
import { AuthStatusNotice } from "@/components/auth/AuthStatusNotice";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { sanitizeNextPath } from "@/server/auth/redirects";
import { getCurrentAuthSession } from "@/server/auth/session";
import { getAuthSurfaceStatus } from "@/server/auth/surface";

export default async function AuthLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; error?: string; email?: string; invite_token?: string }>;
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
            eyebrow="Design-Partner Entry"
            title="Log in to Gauset"
            body="This login route is for operators whose account is already active. Invite-first onboarding stays controlled: approved emails can request a secure link here, while first-time creation stays on the separate registration path."
            footer={
                <p className="text-sm text-neutral-500">
                    Need access first?{" "}
                    <a href="https://gauset.com" className="font-medium text-white transition-opacity hover:opacity-80">
                        Request early access
                    </a>
                </p>
            }
        >
            <AuthStatusNotice tone={surfaceStatus.tone} title={surfaceStatus.label} body={surfaceStatus.message} className="mb-4" />
            {params.error ? <AuthStatusNotice tone="blocked" title="Google auth could not continue" body={params.error} className="mb-4" /> : null}
            <EmailAuthForm
                mode="login"
                nextPath={nextPath}
                invitationToken={invitationToken}
                authOperational={surfaceStatus.operational}
                initialEmail={params.email ?? ""}
                headline="Already approved? We will send your access link."
                submitLabel="Send my secure link"
            />
        </AuthPanelShell>
    );
}
