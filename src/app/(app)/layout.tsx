import type { ReactNode } from "react";

import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/EmptyState";
import { NotificationCenterEntry } from "@/components/platform/NotificationCenterEntry";
import { NotificationSyncController } from "@/components/platform/NotificationSyncController";
import { WorkspaceSwitcher } from "@/components/platform/WorkspaceSwitcher";
import type { PlatformNavGroup } from "@/components/platform/Sidebar";
import { getCurrentAuthSession } from "@/server/auth/session";
import { getPlatformShellSurfaceForSession } from "@/server/platform/surface-shell";

export default async function PlatformAppLayout({ children }: { children: ReactNode }) {
    const session = await getCurrentAuthSession();
    const emptyWorkspaceState = {
        activeStudio: null,
        accessibleStudios: [],
    };
    const surface = session
        ? await getPlatformShellSurfaceForSession(session)
        : {
              coordinationSnapshot: null,
              governanceSnapshot: null,
              workspaceState: emptyWorkspaceState,
              notificationSummary: null,
          };
    const { coordinationSnapshot, governanceSnapshot, notificationSummary } = surface;
    const workspaceState = surface.workspaceState ?? emptyWorkspaceState;
    const appNavGroups: PlatformNavGroup[] = [
        {
            label: "World Workflow",
            items: [
                { href: "/app/worlds", label: "Worlds" },
                { href: "/app/dashboard", label: "Operations" },
            ],
        },
        {
            label: "Operate",
            items: [
                { href: "/app/billing", label: "Billing" },
                { href: "/app/team", label: "Team" },
                { href: "/app/support", label: "Support" },
            ],
        },
        {
            label: "Settings",
            items: [
                { href: "/app/settings/profile", label: "Profile" },
                { href: "/app/settings/governance", label: "Governance" },
                { href: "/app/settings/security", label: "Security" },
                {
                    href: "/app/settings/notifications",
                    label: "Notifications",
                    badge: notificationSummary && notificationSummary.unreadCount > 0 ? String(notificationSummary.unreadCount) : undefined,
                },
            ],
        },
    ];

    return (
        <AppShell
            navGroups={appNavGroups}
            accountLabel={session?.user.displayName ?? session?.user.email ?? "Design partner beta"}
            environmentLabel="World workflow shell"
            eyebrow="Projects, worlds, review, handoff"
            title="Project and world workspace"
            subtitle="Projects own the durable record. Worlds reopen into the workspace, review stays explicit, and handoff posture stays visible."
            statusLabel={
                workspaceState.activeStudio
                    ? `${workspaceState.activeStudio.role} workspace · ${
                          coordinationSnapshot
                              ? coordinationSnapshot.coverage.health === "stable"
                                  ? coordinationSnapshot.operations.urgentCount > 0
                                      ? `${coordinationSnapshot.operations.urgentCount} urgent / ${coordinationSnapshot.operations.watchCount} watch`
                                      : coordinationSnapshot.operations.watchCount > 0
                                        ? `${coordinationSnapshot.operations.watchCount} watch`
                                        : "stable"
                                  : coordinationSnapshot.coverage.health
                              : "stable"
                      }${
                          coordinationSnapshot && coordinationSnapshot.coverage.summary.undercoveredLaneCount > 0
                              ? ` · ${coordinationSnapshot.coverage.summary.undercoveredLaneCount} lane gaps`
                              : coordinationSnapshot && coordinationSnapshot.coverage.summary.unavailableOwnerItemCount > 0
                                ? ` · ${coordinationSnapshot.coverage.summary.unavailableOwnerItemCount} unavailable-owner`
                                : ""
                      }${
                          governanceSnapshot
                              ? governanceSnapshot.pendingApprovalCount > 0
                                  ? ` · ${governanceSnapshot.pendingApprovalCount} approvals`
                                  : governanceSnapshot.overallStatus === "aligned"
                                    ? " · governed"
                                    : ` · ${governanceSnapshot.exceptionCount} exceptions`
                              : ""
                      }`
                    : "Workspace bootstrap"
            }
            workspaceSwitcher={
                session ? (
                    <WorkspaceSwitcher
                        studios={workspaceState.accessibleStudios}
                        activeStudioId={session.activeStudioId}
                        workload={coordinationSnapshot?.workload ?? null}
                        operations={coordinationSnapshot?.operations ?? null}
                        coverage={coordinationSnapshot?.coverage ?? null}
                    />
                ) : null
            }
            actions={notificationSummary ? <NotificationCenterEntry summary={notificationSummary} /> : null}
        >
            {notificationSummary ? (
                <NotificationSyncController
                    workspaceId={notificationSummary.workspaceId}
                    syncedAt={notificationSummary.syncedAt}
                    stale={notificationSummary.stale}
                />
            ) : null}
            {children ?? (
                <EmptyState
                    eyebrow="World workflow"
                    title="World routes mount here"
                    body="Use this shell for project ownership, world launch, review posture, and handoff readiness around the workspace."
                />
            )}
        </AppShell>
    );
}
