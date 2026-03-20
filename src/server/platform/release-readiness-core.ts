export type CoreReleaseReadinessState = "ready" | "at_risk" | "blocked";

export interface CoreReleaseGate {
    state: CoreReleaseReadinessState;
    summary: string;
    detail: string;
}

export interface CoreReleaseReadinessSnapshot {
    state: CoreReleaseReadinessState;
    summary: string;
    generatedAt: string;
    gates: CoreReleaseGate[];
}

export interface CoreProjectReadinessNotificationInput {
    projectId: string;
    name: string;
    lastActivityAt: string | null;
    releaseReadiness: CoreReleaseReadinessSnapshot;
}

export function deriveReleaseReadinessState(states: CoreReleaseReadinessState[]): CoreReleaseReadinessState {
    if (states.some((state) => state === "blocked")) {
        return "blocked";
    }
    if (states.some((state) => state === "at_risk")) {
        return "at_risk";
    }
    return "ready";
}

export function buildProjectReadinessNotificationPreview(project: CoreProjectReadinessNotificationInput) {
    const topGates = project.releaseReadiness.gates.filter((gate) => gate.state !== "ready").slice(0, 2);

    return {
        signalKey: `projects:project:${project.projectId}`,
        severity: project.releaseReadiness.state === "blocked" ? ("urgent" as const) : ("warning" as const),
        title: `${project.name} is ${project.releaseReadiness.state === "blocked" ? "blocked" : "at risk"} for release`,
        body: topGates.map((gate) => gate.summary).join(" · ") || project.releaseReadiness.summary,
        href: `/app/worlds/${project.projectId}`,
        why: topGates[0]?.detail ?? "Project release readiness no longer meets the shared platform threshold.",
        updatedAt: project.lastActivityAt ?? project.releaseReadiness.generatedAt,
    };
}
