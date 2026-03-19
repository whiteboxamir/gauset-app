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
                  label: "World records",
                  items: [{ href: "/app/worlds", label: "Project library" }],
              },
          ]
        : [
              {
                  label: "World records",
                  items: [{ href: "/app/worlds", label: "Project library" }],
              },
              {
                  label: "Operating lanes",
                  items: [
                      { href: "/app/dashboard", label: "Operations" },
                      { href: "/app/billing", label: "Billing" },
                      { href: "/app/team", label: "Team" },
                      { href: "/app/support", label: "Support" },
                  ],
              },
              {
                  label: "Account",
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
            environmentLabel={isLocalPreviewShell ? "Preview-only record flow" : "Persistent world record"}
            eyebrow={isLocalPreviewShell ? "Persistent world preview" : "Persistent world system of record"}
            title="World record library"
            subtitle={
                isLocalPreviewShell
                    ? "Inspect the project-bound saved-world route without pretending live review, handoff, or studio mutations are already on."
                    : "Open a project record, reopen the same world, save durable versions, and keep review and handoff pinned to one source of truth."
            }
            statusLabel={
                isLocalPreviewShell
                    ? "Preview-only route"
                    : workspaceState.activeStudio
                    ? `${workspaceState.activeStudio.role} studio · ${
                          coordinationSnapshot
                              ? coordinationSnapshot.operations.urgentCount > 0
                                  ? `${coordinationSnapshot.operations.urgentCount} blocker${coordinationSnapshot.operations.urgentCount === 1 ? "" : "s"}`
                                  : coordinationSnapshot.operations.watchCount > 0
                                    ? `${coordinationSnapshot.operations.watchCount} watch item${coordinationSnapshot.operations.watchCount === 1 ? "" : "s"}`
                                    : "record flow stable"
                              : "record flow active"
                      }`
                    : "Studio bootstrap"
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
                    eyebrow="World record flow"
                    title="World routes mount here"
                    body="Use this shell for project records, saved-world launch, review posture, and handoff readiness around one durable filmmaking world."
                />
            )}
        </AppShell>
    );
}
