import type { SupportThreadPriority, SupportThreadStatus } from "./common";

export interface SupportMessage {
    messageId: string;
    threadId: string;
    authorUserId: string | null;
    authorType: "user" | "admin" | "system";
    body: string;
    createdAt: string;
}

export interface SupportThreadSummary {
    threadId: string;
    studioId: string;
    projectId: string | null;
    projectName: string | null;
    subject: string;
    status: SupportThreadStatus;
    priority: SupportThreadPriority;
    openedByUserId: string | null;
    assignedAdminUserId: string | null;
    latestMessageAt: string | null;
    createdAt: string;
    messageCount: number;
    latestMessagePreview: string | null;
}

export interface SupportThreadDetail {
    thread: SupportThreadSummary;
    messages: SupportMessage[];
}
