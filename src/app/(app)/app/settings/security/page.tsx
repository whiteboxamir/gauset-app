import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { SecurityOverviewPanel } from "@/components/settings/SecurityOverviewPanel";
import { LogoutButton } from "@/components/settings/LogoutButton";
import { SecuritySessionControlPanel } from "@/components/settings/SecuritySessionControlPanel";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { requireAuthSession } from "@/server/auth/guards";
import { getPlatformSecuritySettingsSurfaceForSession } from "@/server/platform/surface-settings";

export default async function PlatformSecuritySettingsPage() {
    const session = await requireAuthSession("/app/settings/security");
    const { securityOverview: security } = await getPlatformSecuritySettingsSurfaceForSession(session);
    if (!security) {
        return null;
    }

    return (
        <div className="space-y-6">
            <section className="grid gap-4 xl:grid-cols-4">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Onboarding state</p>
                    <div className="mt-3">
                        <StatusBadge label={security.onboardingState} tone="info" />
                    </div>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Workspace role</p>
                    <div className="mt-3">
                        <StatusBadge label={security.activeStudioRole ?? "No studio"} tone="neutral" />
                    </div>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Plan code</p>
                    <p className="mt-3 text-lg text-white">{security.planCode ?? "No active plan"}</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Entitlements</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge label={security.canAccessMvp ? "MVP access" : "MVP blocked"} tone={security.canAccessMvp ? "success" : "warning"} />
                        <StatusBadge label={security.canInviteSeats ? "Invite seats" : "No invites"} tone="neutral" />
                    </div>
                </article>
            </section>

            <SecuritySessionControlPanel
                currentSession={security.currentSession}
                otherSessions={security.otherSessions}
                legacySessionDetected={security.legacySessionDetected}
                actionSlot={<LogoutButton />}
            />
            <AccessReasonPanel accessReasons={security.accessReasons} />
            <SecurityOverviewPanel security={security} />
        </div>
    );
}
