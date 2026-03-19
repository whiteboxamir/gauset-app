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
    const isLocalPreviewShell = !session;
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
    const appNavGroups: PlatformNavGroup[] = isLocalPreviewShell
        ? [
              {
                  label: "Primary flow",
                  items: [{ href: "/app/worlds", label: "Worlds" }],
              },
          ]
        : [
              {
                  label: "Primary flow",
                  items: [{ href: "/app/worlds", label: "Worlds" }],
              },
              {
                  label: "Studio admin",
                  items: [
                      { href: "/app/dashboard", label: "Operations" },
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
            accountLabel={isLocalPreviewShell ? undefined : session?.user.displayName ?? session?.user.email ?? undefined}
            environmentLabel={isLocalPreviewShell ? "Local preview" : "World workflow"}
            eyebrow={isLocalPreviewShell ? "World-first workflow" : "Project-first workflow"}
            title="Worlds"
            subtitle={
                isLocalPreviewShell
                    ? "Pick a sample project and move straight into the world-first flow."
                    : "Open a project, start or reopen the world, then save once before sharing or exporting."
            }
            statusLabel={
                isLocalPreviewShell
                    ? "Local preview"
                    : workspaceState.activeStudio
                    ? `${workspaceState.activeStudio.role} workspace · ${
                          coordinationSnapshot
                              ? coordinationSnapshot.operations.urgentCount > 0
                                  ? `${coordinationSnapshot.operations.urgentCount} workflow blocker${coordinationSnapshot.operations.urgentCount === 1 ? "" : "s"}`
                                  : coordinationSnapshot.operations.watchCount > 0
                                    ? `${coordinationSnapshot.operations.watchCount} workflow watch item${coordinationSnapshot.operations.watchCount === 1 ? "" : "s"}`
                                    : "workflow stable"
                              : "world workflow active"
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
