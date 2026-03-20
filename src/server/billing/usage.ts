import { isPlatformDatabaseConfigured } from "../db/client.ts";
import { restSelect, restUpdate, restUpsert } from "../db/rest.ts";
import { recordRefundCredit, recordUsageDebit } from "./ledger.ts";

const ELIGIBLE_USAGE_JOB_TYPES = new Set(["generated_image", "environment", "asset"] as const);
const DEFAULT_USAGE_DEBIT_AMOUNT = 1;
const BACKFILL_PAGE_SIZE = 100;

type EligibleUsageJobType = "generated_image" | "environment" | "asset";

interface UsageEventRow {
    id: string;
    studio_id: string;
    user_id: string | null;
    job_id: string;
    job_type: EligibleUsageJobType;
    job_status: string;
    image_id: string | null;
    debit_amount: number;
    result_ids: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    reversed_by_refund_id: string | null;
    reversed_at: string | null;
    created_at: string;
    updated_at: string;
}

interface UsageLedgerReferenceRow {
    reference_id: string | null;
}

export interface BackendUsageJobPayload {
    id: string;
    type?: string | null;
    status?: string | null;
    image_id?: string | null;
    studio_id?: string | null;
    user_id?: string | null;
    provider_job_id?: string | null;
    remote_scene_id?: string | null;
    provider?: string | null;
    model?: string | null;
    prompt?: string | null;
    source_type?: string | null;
    warnings?: unknown;
    input?: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
    result?: {
        scene_id?: string | null;
        asset_id?: string | null;
        images?: Array<{
            image_id?: string | null;
        }>;
    } | null;
}

export interface SyncUsageEventResult {
    usageEvent: UsageEventRow | null;
    usageEventCreated: boolean;
    debitCreated: boolean;
    skippedReason: string | null;
}

export interface RefundUsageRestoreResult {
    linkedJobIds: string[];
    restoredJobIds: string[];
    restoredCredits: number;
    ledgerCreated: boolean;
}

export interface ReconcileUsageEventsResult {
    backendJobsFetched: number;
    usageEventsSynced: number;
    usageDebitsCreated: number;
    preMetadataJobsSkipped: number;
    skippedReason: string | null;
}

interface BackendJobsPage {
    jobs: BackendUsageJobPayload[];
    nextOffset: number | null;
}

function normalizeOptionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function normalizeTimestamp(value?: string | null, fallback = new Date().toISOString()) {
    const trimmed = normalizeOptionalText(value);
    if (!trimmed) {
        return fallback;
    }

    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeEligibleUsageJobType(value?: string | null): EligibleUsageJobType | null {
    const normalized = normalizeOptionalText(value);
    if (!normalized || !ELIGIBLE_USAGE_JOB_TYPES.has(normalized as EligibleUsageJobType)) {
        return null;
    }
    return normalized as EligibleUsageJobType;
}

function normalizeWarningList(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
        .slice(0, 6);
}

function normalizeBackendBaseUrl(value: string) {
    return value.trim().replace(/\/$/, "");
}

function buildUsageEventResultIds(job: BackendUsageJobPayload) {
    const imageIds =
        job.result?.images
            ?.map((image) => normalizeOptionalText(image.image_id))
            .filter((imageId): imageId is string => Boolean(imageId)) ?? [];

    return {
        ...(normalizeOptionalText(job.result?.scene_id) ? { sceneId: normalizeOptionalText(job.result?.scene_id) } : {}),
        ...(normalizeOptionalText(job.result?.asset_id) ? { assetId: normalizeOptionalText(job.result?.asset_id) } : {}),
        ...(imageIds.length > 0 ? { imageIds } : {}),
    };
}

function buildUsageEventMetadata(job: BackendUsageJobPayload) {
    return {
        ...(normalizeOptionalText(job.provider_job_id) ? { providerJobId: normalizeOptionalText(job.provider_job_id) } : {}),
        ...(normalizeOptionalText(job.remote_scene_id) ? { remoteSceneId: normalizeOptionalText(job.remote_scene_id) } : {}),
        ...(normalizeOptionalText(job.provider) ? { provider: normalizeOptionalText(job.provider) } : {}),
        ...(normalizeOptionalText(job.model) ? { model: normalizeOptionalText(job.model) } : {}),
        ...(normalizeOptionalText(job.prompt) ? { prompt: normalizeOptionalText(job.prompt) } : {}),
        ...(normalizeOptionalText(job.source_type) ? { sourceType: normalizeOptionalText(job.source_type) } : {}),
        ...(normalizeWarningList(job.warnings).length > 0 ? { warnings: normalizeWarningList(job.warnings) } : {}),
        ...(job.input ? { input: job.input } : {}),
    };
}

function usageDebitNote(job: BackendUsageJobPayload, jobType: EligibleUsageJobType) {
    const label = jobType.replaceAll("_", " ");
    return `Usage debit recorded from completed ${label} job ${job.id}.`;
}

async function resolveUsageEventByJobId(jobId: string) {
    const normalizedJobId = normalizeOptionalText(jobId);
    if (!normalizedJobId) {
        return null;
    }

    const rows = await restSelect<UsageEventRow[]>("usage_events", {
        select:
            "id,studio_id,user_id,job_id,job_type,job_status,image_id,debit_amount,result_ids,metadata,reversed_by_refund_id,reversed_at,created_at,updated_at",
        filters: {
            job_id: `eq.${normalizedJobId}`,
            limit: "1",
        },
    });
    return rows[0] ?? null;
}

async function upsertUsageEvent({
    job,
    studioId,
    userId,
}: {
    job: BackendUsageJobPayload;
    studioId: string;
    userId: string;
}) {
    const existing = await resolveUsageEventByJobId(job.id);
    const jobType = normalizeEligibleUsageJobType(job.type);
    if (!jobType) {
        return {
            usageEvent: null,
            created: false,
        };
    }

    const createdAt = existing?.created_at ?? normalizeTimestamp(job.created_at);
    const metadata = {
        ...(existing?.metadata ?? {}),
        ...buildUsageEventMetadata(job),
    };
    const resultIds = buildUsageEventResultIds(job);

    const rows = await restUpsert<UsageEventRow[]>(
        "usage_events",
        {
            studio_id: studioId,
            user_id: userId,
            job_id: job.id,
            job_type: jobType,
            job_status: "completed",
            image_id: normalizeOptionalText(job.image_id),
            debit_amount: existing?.debit_amount ?? DEFAULT_USAGE_DEBIT_AMOUNT,
            result_ids: resultIds,
            metadata,
            reversed_by_refund_id: existing?.reversed_by_refund_id ?? null,
            reversed_at: existing?.reversed_at ?? null,
            created_at: createdAt,
            updated_at: normalizeTimestamp(job.updated_at, createdAt),
        },
        { onConflict: "job_id" },
    );

    return {
        usageEvent: rows[0] ?? (await resolveUsageEventByJobId(job.id)),
        created: !existing,
    };
}

export async function syncUsageEventFromJobPayload({
    job,
    studioId,
    userId,
}: {
    job: BackendUsageJobPayload;
    studioId?: string | null;
    userId?: string | null;
}): Promise<SyncUsageEventResult> {
    if (!isPlatformDatabaseConfigured()) {
        return {
            usageEvent: null,
            usageEventCreated: false,
            debitCreated: false,
            skippedReason: "platform database unavailable",
        };
    }

    const normalizedStudioId = normalizeOptionalText(studioId);
    const normalizedUserId = normalizeOptionalText(userId);
    const jobType = normalizeEligibleUsageJobType(job.type);
    if (!jobType) {
        return {
            usageEvent: null,
            usageEventCreated: false,
            debitCreated: false,
            skippedReason: "job type not billable",
        };
    }

    if (normalizeOptionalText(job.status) !== "completed") {
        return {
            usageEvent: null,
            usageEventCreated: false,
            debitCreated: false,
            skippedReason: "job not completed",
        };
    }

    if (!normalizedStudioId || !normalizedUserId) {
        return {
            usageEvent: null,
            usageEventCreated: false,
            debitCreated: false,
            skippedReason: "missing studio or user context",
        };
    }

    const { usageEvent, created } = await upsertUsageEvent({
        job,
        studioId: normalizedStudioId,
        userId: normalizedUserId,
    });
    if (!usageEvent) {
        return {
            usageEvent: null,
            usageEventCreated: false,
            debitCreated: false,
            skippedReason: "usage event upsert failed",
        };
    }

    const debit = await recordUsageDebit({
        studioId: normalizedStudioId,
        userId: normalizedUserId,
        usageEventId: usageEvent.id,
        amount: usageEvent.debit_amount,
        note: usageDebitNote(job, jobType),
    });

    return {
        usageEvent,
        usageEventCreated: created,
        debitCreated: debit.created,
        skippedReason: null,
    };
}

export function parseRefundUsageJobIds(metadata: Record<string, string | undefined> | null | undefined) {
    const raw = normalizeOptionalText(metadata?.usage_job_ids);
    if (!raw) {
        return [];
    }

    return Array.from(
        new Set(
            raw
                .split(/[,\n]/)
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0),
        ),
    );
}

export async function restoreRefundLinkedUsageDebits({
    refundId,
    studioId,
    usageJobIds,
}: {
    refundId: string;
    studioId: string;
    usageJobIds: string[];
}): Promise<RefundUsageRestoreResult> {
    const linkedJobIds = Array.from(
        new Set(
            usageJobIds
                .map((jobId) => jobId.trim())
                .filter((jobId) => jobId.length > 0),
        ),
    );
    if (!linkedJobIds.length) {
        return {
            linkedJobIds,
            restoredJobIds: [],
            restoredCredits: 0,
            ledgerCreated: false,
        };
    }

    const rows = await restSelect<UsageEventRow[]>("usage_events", {
        select:
            "id,studio_id,user_id,job_id,job_type,job_status,image_id,debit_amount,result_ids,metadata,reversed_by_refund_id,reversed_at,created_at,updated_at",
        filters: {
            studio_id: `eq.${studioId}`,
            job_id: `in.(${linkedJobIds.join(",")})`,
            limit: String(linkedJobIds.length),
        },
    });
    if (!rows.length) {
        return {
            linkedJobIds,
            restoredJobIds: [],
            restoredCredits: 0,
            ledgerCreated: false,
        };
    }
    const debitedUsageRows = await restSelect<UsageLedgerReferenceRow[]>("credit_ledger", {
        select: "reference_id",
        filters: {
            studio_id: `eq.${studioId}`,
            entry_type: "eq.usage",
            reference_type: "eq.usage_event",
            reference_id: `in.(${rows.map((row) => row.id).join(",")})`,
            limit: String(rows.length || 1),
        },
    });
    const debitedUsageEventIds = new Set(
        debitedUsageRows
            .map((row) => normalizeOptionalText(row.reference_id))
            .filter((referenceId): referenceId is string => Boolean(referenceId)),
    );

    const restoredAt = new Date().toISOString();
    const restoredJobIds: string[] = [];
    let restoredCredits = 0;
    let existingCredits = 0;
    let ledgerCreated = false;

    for (const row of rows) {
        if (!debitedUsageEventIds.has(row.id)) {
            continue;
        }
        if (row.reversed_by_refund_id === refundId) {
            existingCredits += row.debit_amount;
            continue;
        }
        if (row.reversed_by_refund_id) {
            continue;
        }

        await restUpdate(
            "usage_events",
            {
                reversed_by_refund_id: refundId,
                reversed_at: restoredAt,
            },
            {
                id: `eq.${row.id}`,
            },
        );
        restoredCredits += row.debit_amount;
        restoredJobIds.push(row.job_id);
    }

    const creditAmount = restoredCredits > 0 ? restoredCredits : existingCredits;
    if (creditAmount > 0) {
        const ledger = await recordRefundCredit({
            studioId,
            refundId,
            amount: creditAmount,
            note:
                restoredJobIds.length > 0
                    ? `Refund restored ${restoredJobIds.length} usage debit(s): ${restoredJobIds.join(", ")}.`
                    : "Refund preserved a previously synchronized usage restoration.",
        });
        ledgerCreated = ledger.created;
    }

    return {
        linkedJobIds,
        restoredJobIds,
        restoredCredits: creditAmount,
        ledgerCreated,
    };
}

function resolveUsageBackfillBaseUrl(env: NodeJS.ProcessEnv = process.env) {
    const explicit =
        env.GAUSET_BILLING_SYNC_MVP_BACKEND_URL ??
        env.GAUSET_BACKEND_URL ??
        env.NEXT_PUBLIC_GAUSET_API_BASE_URL ??
        "";
    if (explicit.trim()) {
        return normalizeBackendBaseUrl(explicit);
    }

    const appBaseUrl = env.GAUSET_PLATFORM_BASE_URL ?? env.GAUSET_PLATFORM_E2E_BASE_URL ?? "";
    if (appBaseUrl.trim()) {
        return `${normalizeBackendBaseUrl(appBaseUrl)}/api/_mvp_backend`;
    }

    return "";
}

function buildBackendWorkerHeaders(env: NodeJS.ProcessEnv = process.env) {
    const workerToken =
        env.GAUSET_BACKEND_WORKER_TOKEN ?? env.GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN ?? env.GAUSET_WORKER_TOKEN ?? "";
    const normalizedWorkerToken = workerToken.trim();
    const headers = new Headers();
    if (normalizedWorkerToken) {
        headers.set("authorization", `Bearer ${normalizedWorkerToken}`);
        headers.set("x-gauset-worker-token", normalizedWorkerToken);
    }
    return headers;
}

async function fetchBackendJobsPage({
    studioId,
    createdGte,
    offset,
    limit,
    env,
}: {
    studioId: string;
    createdGte?: number | null;
    offset: number;
    limit: number;
    env?: NodeJS.ProcessEnv;
}): Promise<BackendJobsPage> {
    const baseUrl = resolveUsageBackfillBaseUrl(env);
    if (!baseUrl) {
        throw new Error("MVP backend URL is not configured for usage backfill.");
    }

    const url = new URL(`${baseUrl}/jobs`);
    url.searchParams.set("studio_id", studioId);
    url.searchParams.set("status", "completed");
    url.searchParams.set("types", "generated_image,environment,asset");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    if (typeof createdGte === "number" && Number.isFinite(createdGte) && createdGte > 0) {
        url.searchParams.set("created_gte", new Date(createdGte * 1000).toISOString());
    }

    const response = await fetch(url, {
        headers: buildBackendWorkerHeaders(env),
        cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
        | { jobs?: BackendUsageJobPayload[]; next_offset?: number | null }
        | BackendUsageJobPayload[]
        | null;
    if (!response.ok) {
        const detail =
            payload && typeof payload === "object" && !Array.isArray(payload) && "detail" in payload
                ? String(payload.detail)
                : `${response.status}`;
        throw new Error(`Usage backfill job listing failed: ${detail}`);
    }

    if (Array.isArray(payload)) {
        return {
            jobs: payload,
            nextOffset: payload.length === limit ? offset + payload.length : null,
        };
    }

    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    const nextOffset =
        typeof payload?.next_offset === "number" && Number.isFinite(payload.next_offset) ? payload.next_offset : null;
    return {
        jobs,
        nextOffset,
    };
}

export async function reconcileUsageEventsForStudios({
    studioIds,
    createdGte = null,
    env = process.env,
}: {
    studioIds: string[];
    createdGte?: number | null;
    env?: NodeJS.ProcessEnv;
}): Promise<ReconcileUsageEventsResult> {
    if (!isPlatformDatabaseConfigured(env)) {
        return {
            backendJobsFetched: 0,
            usageEventsSynced: 0,
            usageDebitsCreated: 0,
            preMetadataJobsSkipped: 0,
            skippedReason: "platform database unavailable",
        };
    }

    if (!studioIds.length) {
        return {
            backendJobsFetched: 0,
            usageEventsSynced: 0,
            usageDebitsCreated: 0,
            preMetadataJobsSkipped: 0,
            skippedReason: null,
        };
    }

    const normalizedStudioIds = Array.from(
        new Set(
            studioIds
                .map((studioId) => studioId.trim())
                .filter((studioId) => studioId.length > 0),
        ),
    );
    if (!normalizedStudioIds.length) {
        return {
            backendJobsFetched: 0,
            usageEventsSynced: 0,
            usageDebitsCreated: 0,
            preMetadataJobsSkipped: 0,
            skippedReason: null,
        };
    }

    if (!resolveUsageBackfillBaseUrl(env)) {
        return {
            backendJobsFetched: 0,
            usageEventsSynced: 0,
            usageDebitsCreated: 0,
            preMetadataJobsSkipped: 0,
            skippedReason: "mvp backend URL is not configured",
        };
    }

    let backendJobsFetched = 0;
    let usageEventsSynced = 0;
    let usageDebitsCreated = 0;
    let preMetadataJobsSkipped = 0;

    for (const studioId of normalizedStudioIds) {
        let offset = 0;

        while (true) {
            const page = await fetchBackendJobsPage({
                studioId,
                createdGte,
                offset,
                limit: BACKFILL_PAGE_SIZE,
                env,
            });
            backendJobsFetched += page.jobs.length;

            for (const job of page.jobs) {
                const jobStudioId = normalizeOptionalText(job.studio_id);
                const jobUserId = normalizeOptionalText(job.user_id);
                if (!jobStudioId || !jobUserId) {
                    preMetadataJobsSkipped += 1;
                    continue;
                }

                const result = await syncUsageEventFromJobPayload({
                    job,
                    studioId: jobStudioId,
                    userId: jobUserId,
                });
                if (result.usageEvent) {
                    usageEventsSynced += 1;
                }
                if (result.debitCreated) {
                    usageDebitsCreated += 1;
                }
            }

            if (page.nextOffset === null || page.nextOffset <= offset) {
                break;
            }
            offset = page.nextOffset;
        }
    }

    return {
        backendJobsFetched,
        usageEventsSynced,
        usageDebitsCreated,
        preMetadataJobsSkipped,
        skippedReason: null,
    };
}
