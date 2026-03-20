import type {
    AdminAccountFlagAssignment,
    AdminAccountSummary,
    AdminBillingAlert,
    AdminFeatureFlagAssignment,
    AdminNote,
    AdminOperationsSnapshot,
    AdminStudioDetail,
    AdminSupportQueueItem,
} from "@/server/contracts/admin";
import type { AuthSession } from "@/server/contracts/auth";

import { featureFlagCatalog, featureFlagKeys, isKnownFeatureFlag } from "@/server/flags";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restInsert, restSelect, restUpdate } from "@/server/db/rest";
import { recordCreditLedgerEntry } from "@/server/billing/ledger";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import { supportThreadStatusValues } from "@/types/platform/common";

interface StudioRow {
    id: string;
    name: string;
}

interface SubscriptionRow {
    id: string;
    studio_id: string;
    status: AdminAccountSummary["subscriptionStatus"];
    seat_count: number;
    created_at: string;
    plans?: {
        code: string;
        seat_limit: number | null;
        features: Record<string, unknown> | null;
    } | null;
}

interface InvoiceRow {
    id: string;
    studio_id: string;
    status: AdminBillingAlert["invoiceStatus"];
    currency: string;
    total_cents: number;
    amount_remaining_cents: number;
    due_at: string | null;
    paid_at: string | null;
    issued_at: string | null;
}

interface PaymentRow {
    id: string;
    studio_id: string;
    status: Exclude<AdminAccountSummary["latestPaymentStatus"], null>;
    currency: string;
    amount_cents: number;
    paid_at: string | null;
}

interface MembershipRow {
    studio_id: string;
    status: "active" | "invited" | "suspended";
}

interface InvitationRow {
    studio_id: string;
    status: "pending" | "accepted" | "revoked" | "expired";
}

interface CreditLedgerRow {
    id: string;
    studio_id: string;
    balance_after: number | null;
    amount: number;
    note: string | null;
    created_at: string;
}

interface SupportThreadRow {
    id: string;
    studio_id: string;
    project_id: string | null;
    subject: string;
    status: AdminSupportQueueItem["status"];
    priority: AdminSupportQueueItem["priority"];
    assigned_admin_user_id: string | null;
    latest_message_at: string | null;
    created_at: string;
}

interface SupportMessageRow {
    id: string;
    thread_id: string;
    author_user_id: string | null;
    author_type: "user" | "admin" | "system";
    body: string;
    created_at: string;
}

interface ProjectRow {
    id: string;
    name: string;
}

interface FeatureFlagRow {
    id: string;
    flag_key: string;
    scope_type: AdminFeatureFlagAssignment["scopeType"];
    studio_id: string | null;
    user_id: string | null;
    enabled: boolean;
    config: Record<string, unknown> | null;
    created_at: string;
}

interface AccountFlagRow {
    id: string;
    flag_key: string;
    studio_id: string | null;
    user_id: string | null;
    flag_value: unknown;
    reason: string | null;
    expires_at: string | null;
    created_at: string;
}

interface AdminNoteRow {
    id: string;
    studio_id: string | null;
    user_id: string | null;
    project_id: string | null;
    author_user_id: string;
    body: string;
    visibility: "internal" | "finance";
    created_at: string;
}

interface ProfileRow {
    id: string;
    email: string;
}

interface AuditRow {
    id: string;
    studio_id: string | null;
    event_type: string;
    summary: string;
    created_at: string;
}

type AdminStudioDetailView = AdminStudioDetail & {
    activation: {
        provisionedSeatCount: number | null;
        planSeatLimit: number | null;
        projectedSeatCount: number;
        availableSeatCount: number | null;
    };
};

function parseDateValue(value: string | null | undefined) {
    if (!value) {
        return 0;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function studioNameFor(studios: StudioRow[], studioId: string | null) {
    return studios.find((studio) => studio.id === studioId)?.name ?? "Unknown studio";
}

async function resolveStudios(studioIds?: string[]) {
    if (studioIds && studioIds.length === 0) {
        return [] as StudioRow[];
    }

    return restSelect<StudioRow[]>("studios", {
        select: "id,name",
        filters: studioIds
            ? {
                  id: `in.(${studioIds.join(",")})`,
              }
            : {
                  order: "name.asc",
              },
    });
}

async function resolveProjects(projectIds: string[]) {
    if (projectIds.length === 0) {
        return [] as ProjectRow[];
    }

    return restSelect<ProjectRow[]>("projects", {
        select: "id,name",
        filters: {
            id: `in.(${projectIds.join(",")})`,
        },
    });
}

async function resolveProfiles(userIds: string[]) {
    if (userIds.length === 0) {
        return [] as ProfileRow[];
    }

    return restSelect<ProfileRow[]>("profiles", {
        select: "id,email",
        filters: {
            id: `in.(${userIds.join(",")})`,
        },
    });
}

function mapSupportQueueItem({
    thread,
    studioName,
    projectName,
    messages,
}: {
    thread: SupportThreadRow;
    studioName: string;
    projectName: string | null;
    messages: SupportMessageRow[];
}): AdminSupportQueueItem {
    const latestMessage =
        messages
            .slice()
            .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;

    return {
        threadId: thread.id,
        studioId: thread.studio_id,
        studioName,
        projectId: thread.project_id,
        projectName,
        subject: thread.subject,
        status: thread.status,
        priority: thread.priority,
        assignedAdminUserId: thread.assigned_admin_user_id,
        latestMessageAt: thread.latest_message_at,
        latestMessagePreview: latestMessage ? latestMessage.body.slice(0, 180) : null,
        createdAt: thread.created_at,
        messageCount: messages.length,
    };
}

function buildAccountSummaries({
    studios,
    subscriptions,
    invoices,
    payments,
    memberships,
    invitations,
    supportThreads,
    credits,
}: {
    studios: StudioRow[];
    subscriptions: SubscriptionRow[];
    invoices: InvoiceRow[];
    payments: PaymentRow[];
    memberships: MembershipRow[];
    invitations: InvitationRow[];
    supportThreads: SupportThreadRow[];
    credits: CreditLedgerRow[];
}) {
    return studios.map((studio): AdminAccountSummary => {
        const subscription =
            subscriptions
                .filter((entry) => entry.studio_id === studio.id)
                .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;
        const studioInvoices = invoices.filter((entry) => entry.studio_id === studio.id);
        const studioPayments = payments.filter((entry) => entry.studio_id === studio.id);
        const latestInvoice =
            studioInvoices
                .slice()
                .sort((left, right) => parseDateValue(right.issued_at ?? right.due_at) - parseDateValue(left.issued_at ?? left.due_at))[0] ??
            null;
        const latestPayment =
            studioPayments
                .slice()
                .sort((left, right) => parseDateValue(right.paid_at) - parseDateValue(left.paid_at))[0] ?? null;
        const features = (subscription?.plans?.features ?? {}) as Record<string, unknown>;
        const latestCredit = credits.find((entry) => entry.studio_id === studio.id && entry.balance_after !== null) ?? null;

        return {
            studioId: studio.id,
            studioName: studio.name,
            planCode: subscription?.plans?.code ?? null,
            subscriptionStatus: subscription?.status ?? null,
            seatsUsed: memberships.filter((entry) => entry.studio_id === studio.id && entry.status === "active").length,
            seatsLimit: subscription?.seat_count ?? subscription?.plans?.seat_limit ?? null,
            pendingInvitations: invitations.filter((entry) => entry.studio_id === studio.id && entry.status === "pending").length,
            openSupportThreads: supportThreads.filter(
                (entry) => entry.studio_id === studio.id && (entry.status === "open" || entry.status === "pending"),
            ).length,
            delinquentInvoiceCount: studioInvoices.filter(
                (entry) => ["open", "uncollectible"].includes(entry.status) && entry.amount_remaining_cents > 0,
            ).length,
            latestInvoiceStatus: latestInvoice?.status ?? null,
            latestPaymentStatus: latestPayment?.status ?? null,
            prioritySupportEnabled: Boolean(features.prioritySupport),
            mvpAccessEnabled: Boolean(features.mvpAccess),
            creditBalance: latestCredit?.balance_after ?? null,
        };
    });
}

async function loadSupportQueue(studioIds?: string[]) {
    const threads = await restSelect<SupportThreadRow[]>("support_threads", {
        select: "id,studio_id,project_id,subject,status,priority,assigned_admin_user_id,latest_message_at,created_at",
        filters: {
            ...(studioIds ? { studio_id: `in.(${studioIds.join(",")})` } : {}),
            order: "latest_message_at.desc.nullslast",
            limit: studioIds ? "40" : "120",
        },
    });

    const threadIds = threads.map((thread) => thread.id);
    const [messages, studios, projects] = await Promise.all([
        threadIds.length > 0
            ? restSelect<SupportMessageRow[]>("support_messages", {
                  select: "id,thread_id,author_user_id,author_type,body,created_at",
                  filters: {
                      thread_id: `in.(${threadIds.join(",")})`,
                      order: "created_at.desc",
                      limit: studioIds ? "300" : "800",
                  },
              })
            : Promise.resolve([] as SupportMessageRow[]),
        resolveStudios(studioIds),
        resolveProjects(Array.from(new Set(threads.map((thread) => thread.project_id).filter(Boolean) as string[]))),
    ]);

    return threads.map((thread) =>
        mapSupportQueueItem({
            thread,
            studioName: studioNameFor(studios, thread.studio_id),
            projectName: projects.find((project) => project.id === thread.project_id)?.name ?? null,
            messages: messages.filter((message) => message.thread_id === thread.id),
        }),
    );
}

export async function getAdminOperationsSnapshot(): Promise<AdminOperationsSnapshot> {
    if (!isPlatformDatabaseConfigured()) {
        return {
            accounts: [],
            billingAlerts: [],
            supportQueue: [],
        };
    }

    const [studios, subscriptions, invoices, payments, memberships, invitations, supportThreads, credits] = await Promise.all([
        resolveStudios(),
        restSelect<SubscriptionRow[]>("subscriptions", {
            select: "id,studio_id,status,seat_count,created_at,plans(code,seat_limit,features)",
            filters: {
                order: "created_at.desc",
                limit: "200",
            },
        }),
        restSelect<InvoiceRow[]>("invoices", {
            select: "id,studio_id,status,currency,total_cents,amount_remaining_cents,due_at,paid_at,issued_at",
            filters: {
                order: "issued_at.desc.nullslast",
                limit: "300",
            },
        }),
        restSelect<PaymentRow[]>("payments", {
            select: "id,studio_id,status,currency,amount_cents,paid_at",
            filters: {
                order: "paid_at.desc.nullslast",
                limit: "300",
            },
        }),
        restSelect<MembershipRow[]>("studio_memberships", {
            select: "studio_id,status",
            filters: {
                limit: "1000",
            },
        }),
        restSelect<InvitationRow[]>("studio_invitations", {
            select: "studio_id,status",
            filters: {
                limit: "1000",
            },
        }),
        restSelect<SupportThreadRow[]>("support_threads", {
            select: "id,studio_id,project_id,subject,status,priority,assigned_admin_user_id,latest_message_at,created_at",
            filters: {
                limit: "400",
            },
        }),
        restSelect<CreditLedgerRow[]>("credit_ledger", {
            select: "id,studio_id,balance_after,amount,note,created_at",
            filters: {
                order: "created_at.desc",
                limit: "400",
            },
        }),
    ]);

    const accounts = buildAccountSummaries({
        studios,
        subscriptions,
        invoices,
        payments,
        memberships,
        invitations,
        supportThreads,
        credits,
    }).sort((left, right) => right.openSupportThreads - left.openSupportThreads || left.studioName.localeCompare(right.studioName));

    const billingAlerts = invoices
        .filter((invoice) => ["open", "uncollectible"].includes(invoice.status) && invoice.amount_remaining_cents > 0)
        .sort((left, right) => parseDateValue(left.due_at ?? left.issued_at) - parseDateValue(right.due_at ?? right.issued_at))
        .slice(0, 24)
        .map((invoice): AdminBillingAlert => ({
            studioId: invoice.studio_id,
            studioName: studioNameFor(studios, invoice.studio_id),
            invoiceId: invoice.id,
            invoiceStatus: invoice.status,
            amountRemainingCents: invoice.amount_remaining_cents,
            currency: invoice.currency,
            dueAt: invoice.due_at,
        }));

    const supportQueue = await loadSupportQueue();

    return {
        accounts,
        billingAlerts,
        supportQueue,
    };
}

export async function getAdminStudioDetail(studioId: string): Promise<AdminStudioDetailView | null> {
    if (!isPlatformDatabaseConfigured()) {
        return null;
    }

    const [studios, subscriptions, invoices, payments, memberships, invitations, credits, featureFlags, accountFlags, notes, audits] = await Promise.all([
        resolveStudios([studioId]),
        restSelect<SubscriptionRow[]>("subscriptions", {
            select: "id,studio_id,status,seat_count,created_at,plans(code,seat_limit,features)",
            filters: {
                studio_id: `eq.${studioId}`,
                order: "created_at.desc",
                limit: "12",
            },
        }),
        restSelect<InvoiceRow[]>("invoices", {
            select: "id,studio_id,status,currency,total_cents,amount_remaining_cents,due_at,paid_at,issued_at",
            filters: {
                studio_id: `eq.${studioId}`,
                order: "issued_at.desc.nullslast",
                limit: "12",
            },
        }),
        restSelect<PaymentRow[]>("payments", {
            select: "id,studio_id,status,currency,amount_cents,paid_at",
            filters: {
                studio_id: `eq.${studioId}`,
                order: "paid_at.desc.nullslast",
                limit: "12",
            },
        }),
        restSelect<MembershipRow[]>("studio_memberships", {
            select: "studio_id,status",
            filters: {
                studio_id: `eq.${studioId}`,
                limit: "200",
            },
        }),
        restSelect<InvitationRow[]>("studio_invitations", {
            select: "studio_id,status",
            filters: {
                studio_id: `eq.${studioId}`,
                limit: "200",
            },
        }),
        restSelect<CreditLedgerRow[]>("credit_ledger", {
            select: "id,studio_id,balance_after,amount,note,created_at",
            filters: {
                studio_id: `eq.${studioId}`,
                order: "created_at.desc",
                limit: "24",
            },
        }),
        restSelect<FeatureFlagRow[]>("feature_flags", {
            select: "id,flag_key,scope_type,studio_id,user_id,enabled,config,created_at",
            filters: {
                or: `(scope_type.eq.global,studio_id.eq.${studioId})`,
                order: "created_at.desc",
                limit: "200",
            },
        }),
        restSelect<AccountFlagRow[]>("account_flags", {
            select: "id,flag_key,studio_id,user_id,flag_value,reason,expires_at,created_at",
            filters: {
                studio_id: `eq.${studioId}`,
                order: "created_at.desc",
                limit: "100",
            },
        }),
        restSelect<AdminNoteRow[]>("admin_notes", {
            select: "id,studio_id,user_id,project_id,author_user_id,body,visibility,created_at",
            filters: {
                studio_id: `eq.${studioId}`,
                order: "created_at.desc",
                limit: "40",
            },
        }),
        restSelect<AuditRow[]>("audit_events", {
            select: "id,studio_id,event_type,summary,created_at",
            filters: {
                studio_id: `eq.${studioId}`,
                order: "created_at.desc",
                limit: "20",
            },
        }),
    ]);

    const studio = studios[0] ?? null;
    if (!studio) {
        return null;
    }

    const supportThreads = await loadSupportQueue([studioId]);
    const userIds = Array.from(
        new Set([
            ...notes.map((note) => note.author_user_id),
            ...featureFlags.map((flag) => flag.user_id).filter(Boolean),
            ...accountFlags.map((flag) => flag.user_id).filter(Boolean),
        ].filter(Boolean) as string[]),
    );
    const profiles = await resolveProfiles(userIds);

    const account =
        buildAccountSummaries({
            studios: [studio],
            subscriptions,
            invoices,
            payments,
            memberships,
            invitations,
            supportThreads: supportThreads.map((thread) => ({
                id: thread.threadId,
                studio_id: thread.studioId,
                project_id: thread.projectId,
                subject: thread.subject,
                status: thread.status,
                priority: thread.priority,
                assigned_admin_user_id: thread.assignedAdminUserId,
                latest_message_at: thread.latestMessageAt,
                created_at: thread.createdAt,
            })),
            credits,
        })[0] ?? null;
    const latestSubscription = subscriptions[0] ?? null;
    const provisionedSeatCount = latestSubscription?.seat_count ?? latestSubscription?.plans?.seat_limit ?? null;
    const planSeatLimit = latestSubscription?.plans?.seat_limit ?? null;
    const projectedSeatCount = (account?.seatsUsed ?? 0) + (account?.pendingInvitations ?? 0);

    return {
        account,
        recentInvoices: invoices.map((invoice) => ({
            invoiceId: invoice.id,
            status: invoice.status,
            currency: invoice.currency,
            totalCents: invoice.total_cents,
            amountRemainingCents: invoice.amount_remaining_cents,
            dueAt: invoice.due_at,
            paidAt: invoice.paid_at,
        })),
        recentPayments: payments.map((payment) => ({
            paymentId: payment.id,
            status: payment.status,
            currency: payment.currency,
            amountCents: payment.amount_cents,
            paidAt: payment.paid_at,
        })),
        supportThreads,
        featureFlags: featureFlags.map((flag) => ({
            assignmentId: flag.id,
            flagKey: flag.flag_key,
            scopeType: flag.scope_type,
            studioId: flag.studio_id,
            studioName: flag.studio_id ? studio.name : null,
            userId: flag.user_id,
            userEmail: profiles.find((profile) => profile.id === flag.user_id)?.email ?? null,
            enabled: flag.enabled,
            config: flag.config ?? {},
            createdAt: flag.created_at,
        })),
        accountFlags: accountFlags.map((flag) => ({
            assignmentId: flag.id,
            flagKey: flag.flag_key,
            studioId: flag.studio_id,
            studioName: flag.studio_id ? studio.name : null,
            userId: flag.user_id,
            userEmail: profiles.find((profile) => profile.id === flag.user_id)?.email ?? null,
            flagValue: flag.flag_value,
            reason: flag.reason,
            expiresAt: flag.expires_at,
            createdAt: flag.created_at,
        })),
        notes: notes.map((note): AdminNote => ({
            noteId: note.id,
            studioId: note.studio_id,
            userId: note.user_id,
            projectId: note.project_id,
            authorUserId: note.author_user_id,
            authorEmail: profiles.find((profile) => profile.id === note.author_user_id)?.email ?? null,
            body: note.body,
            visibility: note.visibility,
            createdAt: note.created_at,
        })),
        recentAuditEvents: audits.map((audit) => ({
            eventId: audit.id,
            eventType: audit.event_type,
            summary: audit.summary,
            createdAt: audit.created_at,
        })),
        activation: {
            provisionedSeatCount,
            planSeatLimit,
            projectedSeatCount,
            availableSeatCount: provisionedSeatCount === null ? null : Math.max(provisionedSeatCount - projectedSeatCount, 0),
        },
    };
}

export async function getAdminSupportThreadDetail(threadId: string) {
    if (!isPlatformDatabaseConfigured()) {
        return null;
    }

    const threadRows = await restSelect<SupportThreadRow[]>("support_threads", {
        select: "id,studio_id,project_id,subject,status,priority,assigned_admin_user_id,latest_message_at,created_at",
        filters: {
            id: `eq.${threadId}`,
            limit: "1",
        },
    });
    const thread = threadRows[0] ?? null;
    if (!thread) {
        return null;
    }

    const [studios, projects, messages, profiles] = await Promise.all([
        resolveStudios([thread.studio_id]),
        resolveProjects(thread.project_id ? [thread.project_id] : []),
        restSelect<SupportMessageRow[]>("support_messages", {
            select: "id,thread_id,author_user_id,author_type,body,created_at",
            filters: {
                thread_id: `eq.${threadId}`,
                order: "created_at.asc",
                limit: "200",
            },
        }),
        resolveProfiles(thread.assigned_admin_user_id ? [thread.assigned_admin_user_id] : []),
    ]);

    return {
        thread: mapSupportQueueItem({
            thread,
            studioName: studioNameFor(studios, thread.studio_id),
            projectName: projects[0]?.name ?? null,
            messages,
        }),
        messages: messages.map((message) => ({
            messageId: message.id,
            threadId: message.thread_id,
            authorUserId: message.author_user_id,
            authorType: message.author_type,
            body: message.body,
            createdAt: message.created_at,
        })),
        assignedAdminEmail: profiles.find((profile) => profile.id === thread.assigned_admin_user_id)?.email ?? null,
    };
}

export async function updateAdminSupportThread({
    session,
    threadId,
    status,
    priority,
    assignToSelf,
}: {
    session: AuthSession;
    threadId: string;
    status?: AdminSupportQueueItem["status"];
    priority?: AdminSupportQueueItem["priority"];
    assignToSelf?: boolean;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const threadRows = await restSelect<SupportThreadRow[]>("support_threads", {
        select: "id,studio_id,project_id,subject,status,priority,assigned_admin_user_id,latest_message_at,created_at",
        filters: {
            id: `eq.${threadId}`,
            limit: "1",
        },
    });
    const thread = threadRows[0] ?? null;
    if (!thread) {
        throw new Error("Support thread not found.");
    }

    const patch: Record<string, unknown> = {};
    if (status && supportThreadStatusValues.includes(status)) {
        patch.status = status;
    }
    if (priority) {
        patch.priority = priority;
    }
    if (assignToSelf) {
        patch.assigned_admin_user_id = session.user.userId;
    }

    if (Object.keys(patch).length === 0) {
        throw new Error("No admin support update was provided.");
    }

    await restUpdate("support_threads", patch, {
        id: `eq.${threadId}`,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "admin",
        studioId: thread.studio_id,
        targetType: "support_thread",
        targetId: threadId,
        eventType: "admin.support_thread_updated",
        summary: `Updated support thread ${thread.subject}.`,
        metadata: patch,
    });

    return {
        studioId: thread.studio_id,
    };
}

export async function replyToSupportThreadAsAdmin({
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

    const threadRows = await restSelect<SupportThreadRow[]>("support_threads", {
        select: "id,studio_id,project_id,subject,status,priority,assigned_admin_user_id,latest_message_at,created_at",
        filters: {
            id: `eq.${threadId}`,
            limit: "1",
        },
    });
    const thread = threadRows[0] ?? null;
    if (!thread) {
        throw new Error("Support thread not found.");
    }

    const now = new Date().toISOString();
    await restInsert("support_messages", {
        thread_id: threadId,
        author_user_id: session.user.userId,
        author_type: "admin",
        body: body.trim(),
    });

    await restUpdate(
        "support_threads",
        {
            latest_message_at: now,
            assigned_admin_user_id: session.user.userId,
            status: thread.status === "open" ? "pending" : thread.status,
        },
        {
            id: `eq.${threadId}`,
        },
    );

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "admin",
        studioId: thread.studio_id,
        targetType: "support_thread",
        targetId: threadId,
        eventType: "admin.support_reply_sent",
        summary: `Replied as admin on support thread ${thread.subject}.`,
    });

    return {
        studioId: thread.studio_id,
    };
}

export async function grantStudioCredits({
    session,
    studioId,
    amount,
    note,
}: {
    session: AuthSession;
    studioId: string;
    amount: number;
    note?: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!Number.isInteger(amount) || amount === 0) {
        throw new Error("Credit adjustment amount must be a non-zero integer.");
    }

    const ledgerEntry = await recordCreditLedgerEntry({
        studioId,
        entryType: "adjustment",
        amount,
        note: note?.trim() || null,
        createdByUserId: session.user.userId,
    });
    const balanceAfter = ledgerEntry.entry.balance_after ?? amount;

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "admin",
        studioId,
        targetType: "credit_ledger",
        targetId: studioId,
        eventType: "admin.credits_adjusted",
        summary: `Adjusted studio credits by ${amount}.`,
        metadata: {
            balanceAfter,
            note: note?.trim() || null,
        },
    });

    return {
        balanceAfter,
    };
}

export async function createAdminNote({
    session,
    studioId,
    body,
    visibility,
}: {
    session: AuthSession;
    studioId: string;
    body: string;
    visibility: AdminNote["visibility"];
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    await restInsert("admin_notes", {
        studio_id: studioId,
        author_user_id: session.user.userId,
        body: body.trim(),
        visibility,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "admin",
        studioId,
        targetType: "admin_note",
        targetId: studioId,
        eventType: "admin.note_created",
        summary: "Created an internal admin note.",
        metadata: {
            visibility,
        },
    });
}

async function resolveExistingFeatureFlag({
    flagKey,
    scopeType,
    studioId,
    userId,
}: {
    flagKey: string;
    scopeType: AdminFeatureFlagAssignment["scopeType"];
    studioId?: string | null;
    userId?: string | null;
}) {
    const rows = await restSelect<FeatureFlagRow[]>("feature_flags", {
        select: "id,flag_key,scope_type,studio_id,user_id,enabled,config,created_at",
        filters: {
            flag_key: `eq.${flagKey}`,
            scope_type: `eq.${scopeType}`,
            ...(scopeType === "studio" ? { studio_id: `eq.${studioId}` } : {}),
            ...(scopeType === "user" ? { user_id: `eq.${userId}` } : {}),
            limit: "1",
        },
    });

    return rows[0] ?? null;
}

export async function setFeatureFlagAssignment({
    session,
    flagKey,
    scopeType,
    enabled,
    studioId,
    userId,
    config,
}: {
    session: AuthSession;
    flagKey: string;
    scopeType: AdminFeatureFlagAssignment["scopeType"];
    enabled: boolean;
    studioId?: string | null;
    userId?: string | null;
    config?: Record<string, unknown>;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!isKnownFeatureFlag(flagKey)) {
        throw new Error("Unknown feature flag key.");
    }

    const existing = await resolveExistingFeatureFlag({
        flagKey,
        scopeType,
        studioId,
        userId,
    });

    if (existing) {
        await restUpdate(
            "feature_flags",
            {
                enabled,
                config: config ?? {},
                created_by_user_id: session.user.userId,
            },
            {
                id: `eq.${existing.id}`,
            },
        );
    } else {
        await restInsert("feature_flags", {
            flag_key: flagKey,
            scope_type: scopeType,
            studio_id: scopeType === "studio" ? studioId ?? null : null,
            user_id: scopeType === "user" ? userId ?? null : null,
            enabled,
            config: config ?? {},
            created_by_user_id: session.user.userId,
        });
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "admin",
        studioId: studioId ?? null,
        targetType: "feature_flag",
        targetId: flagKey,
        eventType: "admin.feature_flag_updated",
        summary: `Updated feature flag ${flagKey}.`,
        metadata: {
            scopeType,
            enabled,
            userId: userId ?? null,
            studioId: studioId ?? null,
        },
    });
}

async function resolveExistingAccountFlag({
    flagKey,
    studioId,
    userId,
}: {
    flagKey: string;
    studioId?: string | null;
    userId?: string | null;
}) {
    const rows = await restSelect<AccountFlagRow[]>("account_flags", {
        select: "id,flag_key,studio_id,user_id,flag_value,reason,expires_at,created_at",
        filters: {
            flag_key: `eq.${flagKey}`,
            ...(studioId ? { studio_id: `eq.${studioId}` } : { studio_id: "is.null" }),
            ...(userId ? { user_id: `eq.${userId}` } : { user_id: "is.null" }),
            limit: "1",
        },
    });

    return rows[0] ?? null;
}

export async function setAccountFlagAssignment({
    session,
    flagKey,
    studioId,
    userId,
    flagValue,
    reason,
    expiresAt,
}: {
    session: AuthSession;
    flagKey: string;
    studioId?: string | null;
    userId?: string | null;
    flagValue: unknown;
    reason?: string | null;
    expiresAt?: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }
    if (!studioId && !userId) {
        throw new Error("Account flags require a studio or user target.");
    }

    const existing = await resolveExistingAccountFlag({
        flagKey,
        studioId,
        userId,
    });

    if (existing) {
        await restUpdate(
            "account_flags",
            {
                flag_value: flagValue,
                reason: reason?.trim() || null,
                expires_at: expiresAt?.trim() || null,
                created_by_user_id: session.user.userId,
            },
            {
                id: `eq.${existing.id}`,
            },
        );
    } else {
        await restInsert("account_flags", {
            flag_key: flagKey,
            studio_id: studioId ?? null,
            user_id: userId ?? null,
            flag_value: flagValue,
            reason: reason?.trim() || null,
            expires_at: expiresAt?.trim() || null,
            created_by_user_id: session.user.userId,
        });
    }

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "admin",
        studioId: studioId ?? null,
        targetType: "account_flag",
        targetId: flagKey,
        eventType: "admin.account_flag_updated",
        summary: `Updated account flag ${flagKey}.`,
        metadata: {
            userId: userId ?? null,
            studioId: studioId ?? null,
            expiresAt: expiresAt?.trim() || null,
        },
    });
}

export async function listAdminFlagAssignments() {
    if (!isPlatformDatabaseConfigured()) {
        return {
            featureFlags: [] as AdminFeatureFlagAssignment[],
            accountFlags: [] as AdminAccountFlagAssignment[],
        };
    }

    const [featureFlags, accountFlags, studios] = await Promise.all([
        restSelect<FeatureFlagRow[]>("feature_flags", {
            select: "id,flag_key,scope_type,studio_id,user_id,enabled,config,created_at",
            filters: {
                order: "created_at.desc",
                limit: "200",
            },
        }),
        restSelect<AccountFlagRow[]>("account_flags", {
            select: "id,flag_key,studio_id,user_id,flag_value,reason,expires_at,created_at",
            filters: {
                order: "created_at.desc",
                limit: "200",
            },
        }),
        resolveStudios(),
    ]);
    const profiles = await resolveProfiles(
        Array.from(new Set([...featureFlags.map((flag) => flag.user_id), ...accountFlags.map((flag) => flag.user_id)].filter(Boolean) as string[])),
    );

    return {
        featureFlags: featureFlags.map((flag) => ({
            assignmentId: flag.id,
            flagKey: flag.flag_key,
            scopeType: flag.scope_type,
            studioId: flag.studio_id,
            studioName: flag.studio_id ? studioNameFor(studios, flag.studio_id) : null,
            userId: flag.user_id,
            userEmail: profiles.find((profile) => profile.id === flag.user_id)?.email ?? null,
            enabled: flag.enabled,
            config: flag.config ?? {},
            createdAt: flag.created_at,
        })),
        accountFlags: accountFlags.map((flag) => ({
            assignmentId: flag.id,
            flagKey: flag.flag_key,
            studioId: flag.studio_id,
            studioName: flag.studio_id ? studioNameFor(studios, flag.studio_id) : null,
            userId: flag.user_id,
            userEmail: profiles.find((profile) => profile.id === flag.user_id)?.email ?? null,
            flagValue: flag.flag_value,
            reason: flag.reason,
            expiresAt: flag.expires_at,
            createdAt: flag.created_at,
        })),
    };
}

export function listKnownAdminFeatureFlags() {
    return featureFlagKeys.map((key) => featureFlagCatalog[key]);
}
