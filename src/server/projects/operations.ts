import type { AuthSession } from "@/server/contracts/auth";
import type { OperationsStatus, ProjectOperationalRisk } from "@/server/contracts/operations";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";
import { getEffectiveGovernancePolicyForStudio } from "@/server/platform/governance-policy";
import { formatFreshnessLabel, hoursSince } from "@/server/platform/attention";

import { listProjectsForSession } from "./service";

interface ReviewShareRow {
    id: string;
    project_id: string | null;
    status: "active" | "revoked" | "expired";
}

const URGENT_REVIEW_SHARE_STALE_HOURS = 24 * 21;

function getProjectRiskRank(riskLevel: OperationsStatus) {
    return {
        urgent: 0,
        watch: 1,
        stable: 2,
    }[riskLevel];
}

export async function getProjectOperationsForSession(session: AuthSession): Promise<ProjectOperationalRisk[]> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return [];
    }

    const now = Date.now();
    const [policy, projects, reviewShares] = await Promise.all([
        getEffectiveGovernancePolicyForStudio(session.activeStudioId),
        listProjectsForSession(session),
        restSelect<ReviewShareRow[]>("review_shares", {
            select: "id,project_id,status",
            filters: {
                studio_id: `eq.${session.activeStudioId}`,
                order: "created_at.desc",
                limit: "250",
            },
        }),
    ]);

    return projects
        .map((project): ProjectOperationalRisk => {
            const projectShares = reviewShares.filter((share) => share.project_id === project.projectId);
            const activeReviewShareCount = projectShares.filter((share) => share.status === "active").length;
            const totalReviewShareCount = projectShares.length;
            const projectAgeHours = hoursSince(project.lastActivityAt, now);
            const reasons: string[] = [];
            let riskLevel: OperationsStatus = "stable";

            if (project.worldCount === 0) {
                reasons.push("No linked world");
                riskLevel = "watch";
            }

            if (projectAgeHours !== null && projectAgeHours >= policy.staleProjectHours) {
                reasons.push(`No recent activity for ${Math.floor(projectAgeHours / 24)}d`);
                riskLevel = "watch";
            }

            if (activeReviewShareCount > 0) {
                reasons.push(
                    activeReviewShareCount === 1 ? "1 active review link live" : `${activeReviewShareCount} active review links live`,
                );
            }

            if (
                (project.status === "archived" && activeReviewShareCount > 0) ||
                (projectAgeHours !== null && projectAgeHours >= URGENT_REVIEW_SHARE_STALE_HOURS && activeReviewShareCount > 0)
            ) {
                reasons.push(project.status === "archived" ? "Archived project still has live review access" : "Live review access on a stale project");
                riskLevel = "urgent";
            }

            return {
                projectId: project.projectId,
                name: project.name,
                slug: project.slug,
                status: project.status,
                href: `/app/worlds/${project.projectId}`,
                riskLevel,
                reasons: reasons.length > 0 ? reasons : ["No immediate project risk"],
                lastActivityAt: project.lastActivityAt,
                lastActivityLabel: formatFreshnessLabel(project.lastActivityAt, now, "Activity"),
                hasWorldLink: project.worldCount > 0,
                activeReviewShareCount,
                totalReviewShareCount,
            };
        })
        .sort((left, right) => {
            const riskOrder = getProjectRiskRank(left.riskLevel) - getProjectRiskRank(right.riskLevel);
            if (riskOrder !== 0) {
                return riskOrder;
            }

            return (right.activeReviewShareCount ?? 0) - (left.activeReviewShareCount ?? 0);
        });
}
