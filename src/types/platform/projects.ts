import type { ProjectMembershipRole, ProjectStatus } from "./common";

export interface ProjectCard {
    projectId: string;
    studioId: string | null;
    studioName: string | null;
    ownerUserId: string;
    name: string;
    slug: string;
    description: string | null;
    status: ProjectStatus;
    coverImageUrl: string | null;
    lastActivityAt: string | null;
    lastWorldOpenedAt: string | null;
    membershipRole: ProjectMembershipRole;
    worldCount: number;
    primarySceneId: string | null;
    primaryEnvironmentLabel: string | null;
}

export interface ProjectWorldLink {
    id: string;
    projectId: string;
    sceneId: string;
    environmentLabel: string | null;
    isPrimary: boolean;
    createdAt: string;
}

export interface ProjectActivityEvent {
    id: string;
    projectId: string;
    actorUserId: string | null;
    actorType: "user" | "system" | "admin";
    eventType: string;
    summary: string;
    createdAt: string;
}
