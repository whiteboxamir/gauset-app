import type { AuthSession } from "@/server/contracts/auth";
import type { SupportMessage, SupportThreadDetail, SupportThreadSummary } from "@/server/contracts/support";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restInsert, restSelect, restUpdate } from "@/server/db/rest";
import { logPlatformAuditEvent } from "@/server/platform/audit";

interface SupportThreadRow {
    id: string;
    studio_id: string;
    project_id: string | null;
    opened_by_user_id: string | null;
    assigned_admin_user_id: string | null;
    status: SupportThreadSummary["status"];
    priority: SupportThreadSummary["priority"];
    subject: string;
    latest_message_at: string | null;
    created_at: string;
}

interface SupportMessageRow {
    id: string;
    thread_id: string;
    author_user_id: string | null;
    author_type: SupportMessage["authorType"];
    body: string;
    created_at: string;
}

interface ProjectRow {
    id: string;
    studio_id: string | null;
    name: string;
}

async function resolveProjects(projectIds: string[]) {
    if (projectIds.length === 0) {
        return [] as ProjectRow[];
    }

    return restSelect<ProjectRow[]>("projects", {
        select: "id,studio_id,name",
        filters: {
            id: `in.(${projectIds.join(",")})`,
        },
    });
}

async function resolveProjectForStudio(studioId: string, projectId: string) {
    const rows = await restSelect<ProjectRow[]>("projects", {
        select: "id,studio_id,name",
        filters: {
            id: `eq.${projectId}`,
            studio_id: `eq.${studioId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function resolveThreadById(studioId: string, threadId: string) {
    const rows = await restSelect<SupportThreadRow[]>("support_threads", {
        select: "id,studio_id,project_id,opened_by_user_id,assigned_admin_user_id,status,priority,subject,latest_message_at,created_at",
        filters: {
            studio_id: `eq.${studioId}`,
            id: `eq.${threadId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

function mapMessages(rows: SupportMessageRow[]): SupportMessage[] {
    return rows.map((row) => ({
        messageId: row.id,
        threadId: row.thread_id,
        authorUserId: row.author_user_id,
        authorType: row.author_type,
        body: row.body,
        createdAt: row.created_at,
    }));
}

function mapThreadSummary({
    row,
    projectName,
    messages,
}: {
    row: SupportThreadRow;
    projectName: string | null;
    messages: SupportMessageRow[];
}): SupportThreadSummary {
    const latestMessage = messages
        .slice()
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;

    return {
        threadId: row.id,
        studioId: row.studio_id,
        projectId: row.project_id,
        projectName,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        openedByUserId: row.opened_by_user_id,
        assignedAdminUserId: row.assigned_admin_user_id,
        latestMessageAt: row.latest_message_at,
        createdAt: row.created_at,
        messageCount: messages.length,
        latestMessagePreview: latestMessage ? latestMessage.body.slice(0, 180) : null,
    };
}

export async function listSupportThreadsForSession(session: AuthSession): Promise<SupportThreadSummary[]> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return [];
    }

    const threadRows = await restSelect<SupportThreadRow[]>("support_threads", {
        select: "id,studio_id,project_id,opened_by_user_id,assigned_admin_user_id,status,priority,subject,latest_message_at,created_at",
        filters: {
            studio_id: `eq.${session.activeStudioId}`,
            order: "latest_message_at.desc.nullslast",
            limit: "24",
        },
    });

    const threadIds = threadRows.map((thread) => thread.id);
    const projectIds = Array.from(new Set(threadRows.map((thread) => thread.project_id).filter(Boolean) as string[]));
    const [projects, messages] = await Promise.all([
        resolveProjects(projectIds),
        threadIds.length > 0
            ? restSelect<SupportMessageRow[]>("support_messages", {
                  select: "id,thread_id,author_user_id,author_type,body,created_at",
                  filters: {
                      thread_id: `in.(${threadIds.join(",")})`,
                      order: "created_at.desc",
                      limit: "120",
                  },
              })
            : Promise.resolve([] as SupportMessageRow[]),
    ]);

    return threadRows.map((row) =>
        mapThreadSummary({
            row,
            projectName: projects.find((project) => project.id === row.project_id)?.name ?? null,
            messages: messages.filter((message) => message.thread_id === row.id),
        }),
    );
}

export async function getSupportThreadDetailForSession(session: AuthSession, threadId: string): Promise<SupportThreadDetail | null> {
    if (!isPlatformDatabaseConfigured() || !session.activeStudioId) {
        return null;
    }

    const thread = await resolveThreadById(session.activeStudioId, threadId);
    if (!thread) {
        return null;
    }

    const [projects, messageRows] = await Promise.all([
        resolveProjects(thread.project_id ? [thread.project_id] : []),
        restSelect<SupportMessageRow[]>("support_messages", {
            select: "id,thread_id,author_user_id,author_type,body,created_at",
            filters: {
                thread_id: `eq.${threadId}`,
                order: "created_at.asc",
            },
        }),
    ]);

    return {
        thread: mapThreadSummary({
            row: thread,
            projectName: projects[0]?.name ?? null,
            messages: messageRows,
        }),
        messages: mapMessages(messageRows),
    };
}

export async function createSupportThreadForSession({
    session,
    subject,
    body,
    priority,
    projectId,
}: {
    session: AuthSession;
    subject: string;
    body: string;
    priority: SupportThreadSummary["priority"];
    projectId?: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!session.activeStudioId) {
        throw new Error("Support threads require an active studio.");
    }

    const normalizedProjectId = projectId?.trim() || null;
    if (normalizedProjectId) {
        const project = await resolveProjectForStudio(session.activeStudioId, normalizedProjectId);
        if (!project) {
            throw new Error("Selected project is not available in the active workspace.");
        }
    }

    const now = new Date().toISOString();
    const insertedThreads = await restInsert<Array<{ id: string }>>("support_threads", {
        studio_id: session.activeStudioId,
        project_id: normalizedProjectId,
        opened_by_user_id: session.user.userId,
        status: "open",
        priority,
        subject: subject.trim(),
        latest_message_at: now,
    });

    const threadId = insertedThreads[0]?.id;
    if (!threadId) {
        throw new Error("Unable to create support thread.");
    }

    await restInsert("support_messages", {
        thread_id: threadId,
        author_user_id: session.user.userId,
        author_type: "user",
        body: body.trim(),
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "support_thread",
        targetId: threadId,
        eventType: "support.thread_opened",
        summary: `Opened support thread: ${subject.trim()}.`,
        metadata: {
            priority,
            projectId: normalizedProjectId,
        },
    });

    return threadId;
}

export async function replyToSupportThreadForSession({
    session,
    threadId,
    body,
}: {
    session: AuthSession;
    threadId: string;
    body: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!session.activeStudioId) {
        throw new Error("Support threads require an active studio.");
    }

    const thread = await resolveThreadById(session.activeStudioId, threadId);
    if (!thread) {
        throw new Error("Support thread not found.");
    }

    const now = new Date().toISOString();
    await restInsert("support_messages", {
        thread_id: threadId,
        author_user_id: session.user.userId,
        author_type: "user",
        body: body.trim(),
    });

    await restUpdate(
        "support_threads",
        {
            latest_message_at: now,
            status: ["resolved", "closed"].includes(thread.status) ? "pending" : thread.status,
        },
        {
            id: `eq.${threadId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: session.activeStudioId,
        targetType: "support_thread",
        targetId: threadId,
        eventType: "support.message_sent",
        summary: "Sent a support reply from the platform workspace.",
    });
}
