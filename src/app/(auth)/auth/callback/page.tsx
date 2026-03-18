import { AuthPanelShell } from "@/components/auth/AuthPanelShell";
import { AuthCallbackClient } from "@/components/auth/AuthCallbackClient";
import { sanitizeNextPath } from "@/server/auth/redirects";
import { getAuthSurfaceStatus } from "@/server/auth/surface";

export default async function AuthCallbackPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; invite_token?: string; provider?: "magic_link" | "google" | "sso" | "admin" }>;
}) {
    const params = await searchParams;
    const nextPath = sanitizeNextPath(params.next);
    const surfaceStatus = getAuthSurfaceStatus();

    return (
        <AuthPanelShell
            eyebrow="Callback"
            title="Finalizing your session"
            body="We are validating the provider return, checking invite-first access, and mounting any pending studio invite before handing you into the protected workspace."
        >
            <AuthCallbackClient
                nextPath={nextPath}
                invitationToken={params.invite_token || null}
                provider={params.provider ?? "magic_link"}
                authOperational={surfaceStatus.operational}
                surfaceCode={surfaceStatus.authConfigured ? "database_unavailable" : "auth_unavailable"}
                surfaceMessage={surfaceStatus.message}
            />
        </AuthPanelShell>
    );
}
