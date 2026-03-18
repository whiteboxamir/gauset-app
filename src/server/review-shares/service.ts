import { randomBytes, randomUUID } from "node:crypto";

import type {
    CreateReviewShareRequest,
    CreateReviewShareResponse,
    ProjectReviewSharesResponse,
    ReviewShareReadiness,
    ReviewShareEvent,
    ReviewShareSummary,
    ReviewShareTruthSummary,
} from "@/server/contracts/review-shares";
import type { AuthSession } from "@/server/contracts/auth";
import { canSessionAccessMvp, ensureSessionSceneAccess } from "@/server/mvp/access";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import {
    getProjectDetailForSession,
    recordProjectReviewShareForSession,
    recordProjectReviewShareRevocationForSession,
} from "@/server/projects/service";
import { deriveReviewShareReadiness } from "@/server/review-shares/readiness";
import { canManageProjectReviewShares, getReviewShareRolePermissions } from "./permissions";
import type { ReviewShareTokenPayload } from "@/server/review-shares/shareToken";
import { deriveWorldTruthSummary, flattenWorldTruthSummary } from "@/server/world-truth";
import { buildUpstreamRequestHeaders, buildUpstreamUrl, resolveBackendBaseUrlForOrigin, resolveBackendWorkerToken } from "@/server/mvp/proxyBackend";
import {
    buildAllowedApiPaths,
    buildReviewPath,
    createReviewSharePayload,
    createSignedReviewShareToken,
    evaluateReviewShareAccess,
    normalizeProxyPathValue,
    normalizeStoragePath,
    verifyReviewSharePayload,
} from "@/server/review-shares/shareToken";

import {
    getReviewShareById,
    getReviewShareByToken,
    insertReviewShare,
    insertReviewShareEvent,
    listProjectReviewShares,
    listReviewShareEvents,
    listStudioReviewShares,
    resolveReviewShareProfiles,
    type ReviewShareEventRow,
    type ReviewShareProfileRow,
    type ReviewShareRow,
    updateReviewShare,
} from "./repository";
import { findReusableActiveReviewShare } from "./reuse";

const REVIEW_SHARE_ACCESS_WRITE_WINDOW_MS = 60_000;

class ReviewShareServiceError extends Error {
    readonly status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = "ReviewShareServiceError";
        this.status = status;
    }
}

function normalizeSecretCandidate(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

function isManageableProjectReviewRole(role: string | null | undefined) {
    return canManageProjectReviewShares(role);
}

function getReviewShareSecret(env: NodeJS.ProcessEnv = process.env) {
    return (
        normalizeSecretCandidate(env.GAUSET_REVIEW_SHARE_SECRET) ??
        normalizeSecretCandidate(env.SUPABASE_SERVICE_ROLE_KEY) ??
        normalizeSecretCandidate(env.GAUSET_BACKEND_WORKER_TOKEN) ??
        normalizeSecretCandidate(env.GAUSET_WORKER_TOKEN)
    );
}

function deriveStoragePrefix(pathname: string) {
    const segments = pathname.replace(/^\/+/, "").split("/");
    if (segments[0] !== "storage" || !segments[1] || !segments[2]) {
        return pathname.endsWith("/") ? pathname : `${pathname}/`;
    }

    if (segments[1] === "scenes" || segments[1] === "assets") {
        return `storage/${segments[1]}/${segments[2]}/`;
    }

    return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function collectStoragePrefixes(value: unknown, prefixes: Set<string>, visited: WeakSet<object>) {
    if (typeof value === "string") {
        const normalizedPath = normalizeStoragePath(value);
        if (normalizedPath) {
            prefixes.add(deriveStoragePrefix(normalizedPath));
        }
        return;
    }

    if (!value || typeof value !== "object") {
        return;
    }

    if (visited.has(value)) {
        return;
    }
    visited.add(value);

    if (Array.isArray(value)) {
        value.forEach((entry) => collectStoragePrefixes(entry, prefixes, visited));
        return;
    }

    Object.values(value as Record<string, unknown>).forEach((entry) => {
        collectStoragePrefixes(entry, prefixes, visited);
    });
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function readUnknownArray(value: unknown): unknown[] | null {
    return Array.isArray(value) ? value : null;
}

function resolveServerAppOrigin(env: NodeJS.ProcessEnv = process.env) {
    const explicitHost =
        env.NEXT_PUBLIC_GAUSET_APP_HOST?.trim() ||
        env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
        env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
        env.VERCEL_URL?.trim() ||
        "";
    if (explicitHost) {
        return explicitHost.startsWith("http://") || explicitHost.startsWith("https://") ? explicitHost : `https://${explicitHost}`;
    }

    const port = env.PORT?.trim() || "3000";
    return `http://127.0.0.1:${port}`;
}

async function fetchJsonFromMvpBackend<T>({
    pathname,
    session,
}: {
    pathname: string;
    session: AuthSession;
}) {
    const backendBaseUrl = resolveBackendBaseUrlForOrigin({
        origin: resolveServerAppOrigin(),
    });
    if (!backendBaseUrl) {
        return null as T | null;
    }

    const response = await fetch(
        buildUpstreamUrl({
            backendBaseUrl,
            pathname,
            searchParams: new URLSearchParams(),
        }),
        {
            headers: buildUpstreamRequestHeaders({
                requestHeaders: new Headers(),
                workerToken: resolveBackendWorkerToken(),
                studioId: session.activeStudioId ?? null,
                userId: session.user.userId,
            }),
            cache: "no-store",
        },
    );
    if (!response.ok) {
        return null as T | null;
    }

    return (await response.json()) as T;
}

function readReviewIssueVersion(record: Record<string, unknown> | null) {
    const issues = readUnknownArray(record?.issues);
    if (!issues || issues.length === 0) {
        return "";
    }

    return readString(asRecord(issues[0])?.version_id);
}

interface SceneVersionPayload {
    scene_document?: unknown;
    scene_graph?: unknown;
    sceneGraph?: unknown;
}

interface SavedVersionReviewShareArtifacts {
    sceneDocument: Record<string, unknown> | null;
    sceneGraph: Record<string, unknown> | null;
    assetsList: unknown[];
}

function resolveReviewShareRequestArtifacts(payload: CreateReviewShareRequest) {
    const reviewPackage = asRecord(payload.reviewPackage);
    const sceneDocument =
        asRecord(payload.sceneDocument) ??
        asRecord(reviewPackage?.sceneDocument) ??
        asRecord(reviewPackage?.scene_document);
    const sceneGraph =
        asRecord(payload.sceneGraph) ??
        asRecord(reviewPackage?.sceneGraph) ??
        asRecord(reviewPackage?.scene_graph);
    const reviewFromSceneDocument = asRecord(sceneDocument?.review);
    const reviewFromPackage = asRecord(reviewPackage?.review) ?? asRecord(reviewPackage?.legacyReview);
    const reviewRecord = reviewFromPackage ?? reviewFromSceneDocument;

    const sceneId =
        readString(payload.sceneId) ||
        readString(reviewPackage?.sceneId) ||
        readString(reviewPackage?.scene_id) ||
        readString(sceneDocument?.sceneId) ||
        readString(sceneDocument?.scene_id) ||
        readString(reviewFromSceneDocument?.scene_id) ||
        readString(reviewRecord?.scene_id);
    const versionId =
        readString(payload.versionId) ||
        readString(reviewPackage?.versionId) ||
        readString(reviewPackage?.version_id) ||
        readString(reviewRecord?.version_id) ||
        readReviewIssueVersion(reviewRecord) ||
        readReviewIssueVersion(reviewFromSceneDocument);

    return {
        sceneId: sceneId || null,
        versionId: versionId || null,
        sceneDocument,
        sceneGraph,
        reviewPackage,
        assetsList: readUnknownArray(payload.assetsList) ?? readUnknownArray(reviewPackage?.assetsList) ?? [],
    };
}

function buildReviewShareScope({
    sceneId,
    versionId,
    reviewPackage,
    sceneDocument,
    sceneGraph,
    assetsList,
}: {
    sceneId?: string | null;
    versionId?: string | null;
    reviewPackage?: unknown;
    sceneDocument?: unknown;
    sceneGraph?: unknown;
    assetsList?: unknown[];
}) {
    const storagePrefixes = new Set<string>();
    const reviewPackageRecord = asRecord(reviewPackage);

    if (sceneId?.trim()) {
        storagePrefixes.add(`storage/scenes/${sceneId.trim()}/`);
    }

    collectStoragePrefixes(sceneDocument ?? reviewPackageRecord?.sceneDocument ?? null, storagePrefixes, new WeakSet<object>());
    collectStoragePrefixes(sceneGraph, storagePrefixes, new WeakSet<object>());
    collectStoragePrefixes(reviewPackageRecord?.sceneGraph ?? null, storagePrefixes, new WeakSet<object>());
    collectStoragePrefixes(assetsList ?? [], storagePrefixes, new WeakSet<object>());
    collectStoragePrefixes(reviewPackageRecord?.assetsList ?? [], storagePrefixes, new WeakSet<object>());

    return {
        allowedApiPaths: buildAllowedApiPaths(sceneId, versionId),
        storagePrefixes: Array.from(storagePrefixes).sort(),
    };
}

async function deriveReviewShareTruthSummary({
    session,
    sceneId,
    versionId,
    reviewPackage,
    sceneDocument,
    sceneGraph,
}: {
    session: AuthSession;
    sceneId?: string | null;
    versionId?: string | null;
    reviewPackage?: unknown;
    sceneDocument?: unknown;
    sceneGraph?: unknown;
}): Promise<ReviewShareTruthSummary | null> {
    const reviewPackageRecord = asRecord(reviewPackage);
    const packageSceneDocument = asRecord(reviewPackageRecord?.sceneDocument) ?? asRecord(reviewPackageRecord?.scene_document);
    const packageSceneGraph = asRecord(reviewPackageRecord?.sceneGraph) ?? asRecord(reviewPackageRecord?.scene_graph);
    const normalizedSceneId = readString(sceneId) || null;
    const normalizedVersionId = readString(versionId) || null;

    if (normalizedSceneId && normalizedVersionId) {
        if (sceneDocument || packageSceneDocument || sceneGraph || packageSceneGraph) {
            return deriveWorldTruthSummary({
                sceneId: normalizedSceneId,
                versionId: normalizedVersionId,
                sceneDocument: sceneDocument ?? packageSceneDocument ?? null,
                sceneGraph: sceneGraph ?? packageSceneGraph ?? null,
            });
        }

        try {
            const versionPayload = await fetchJsonFromMvpBackend<SceneVersionPayload>({
                pathname: `scene/${encodeURIComponent(normalizedSceneId)}/versions/${encodeURIComponent(normalizedVersionId)}`,
                session,
            });

            return deriveWorldTruthSummary({
                sceneId: normalizedSceneId,
                versionId: normalizedVersionId,
                sceneDocument:
                    asRecord(versionPayload?.scene_document) ??
                    asRecord((asRecord(versionPayload?.scene_graph) as Record<string, unknown> | undefined)?.__scene_document_v2),
                sceneGraph: asRecord(versionPayload?.scene_graph) ?? asRecord(versionPayload?.sceneGraph),
            });
        } catch {
            return null;
        }
    }

    return deriveWorldTruthSummary({
        sceneId,
        versionId,
        sceneDocument: sceneDocument ?? packageSceneDocument ?? null,
        sceneGraph: sceneGraph ?? packageSceneGraph ?? null,
    });
}

async function resolveSavedVersionReviewShareArtifacts({
    session,
    sceneId,
    versionId,
}: {
    session: AuthSession;
    sceneId: string;
    versionId: string;
}): Promise<SavedVersionReviewShareArtifacts | null> {
    const versionPayload = await fetchJsonFromMvpBackend<SceneVersionPayload>({
        pathname: `scene/${encodeURIComponent(sceneId)}/versions/${encodeURIComponent(versionId)}`,
        session,
    });

    if (!versionPayload) {
        return null;
    }

    const versionSceneGraph = asRecord(versionPayload.scene_graph) ?? asRecord(versionPayload.sceneGraph);
    const versionSceneDocument =
        asRecord(versionPayload.scene_document) ??
        asRecord((versionSceneGraph as { __scene_document_v2?: unknown } | null)?.__scene_document_v2);

    return {
        sceneDocument: versionSceneDocument,
        sceneGraph: versionSceneGraph,
        assetsList: readUnknownArray(versionSceneGraph?.assets) ?? [],
    };
}

async function resolveSavedVersionReviewShareReadiness({
    session,
    sceneId,
    versionId,
    sceneDocument,
    sceneGraph,
}: {
    session: AuthSession;
    sceneId: string;
    versionId: string;
    sceneDocument?: unknown;
    sceneGraph?: unknown;
}): Promise<ReviewShareReadiness> {
    const truthSummary = await deriveReviewShareTruthSummary({
        session,
        sceneId,
        versionId,
        sceneDocument,
        sceneGraph,
    });

    return deriveReviewShareReadiness({
        sceneId,
        versionId,
        versionResolved: Boolean(sceneDocument || sceneGraph),
        truthSummary,
    });
}

function assertReviewShareConfigured() {
    const secret = getReviewShareSecret();
    if (!secret) {
        throw new Error("Secure review shares are not configured. Set GAUSET_REVIEW_SHARE_SECRET before enabling external review links.");
    }
    return secret;
}

function normalizeOptionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

function deriveDefaultLabel({
    sceneId,
    versionId,
    hasInlinePayload,
}: {
    sceneId?: string | null;
    versionId?: string | null;
    hasInlinePayload: boolean;
}) {
    if (sceneId && versionId) {
        return `${sceneId} · ${versionId}`;
    }
    if (sceneId) {
        return `${sceneId} review share`;
    }
    if (hasInlinePayload) {
        return "Inline review package";
    }
    return "Secure review share";
}

function buildAbsoluteReviewUrl(origin: string, path: string) {
    return new URL(path, origin).toString();
}

function mapCreatorLabel(profile: ReviewShareProfileRow | null) {
    return profile?.display_name?.trim() || profile?.email?.trim() || "Unknown operator";
}

function mapEvent(row: ReviewShareEventRow): ReviewShareEvent {
    return {
        id: row.id,
        shareId: row.review_share_id,
        actorUserId: row.actor_user_id,
        eventType: row.event_type,
        summary: row.summary,
        requestPath: row.request_path,
        createdAt: row.created_at,
    };
}

function buildTokenPayloadFromRow(row: ReviewShareRow) {
    return createReviewSharePayload({
        shareId: row.id,
        tokenId: row.token_id,
        sceneId: row.scene_id,
        versionId: row.version_id,
        allowedApiPaths: row.allowed_api_paths ?? [],
        storagePrefixes: row.storage_prefixes ?? [],
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
    });
}

function buildAccessSnapshotFromRow(row: ReviewShareRow) {
    return {
        shareId: row.id,
        tokenId: row.token_id,
        sceneId: row.scene_id ?? null,
        versionId: row.version_id ?? null,
        allowedApiPaths: row.allowed_api_paths ?? [],
        storagePrefixes: row.storage_prefixes ?? [],
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        status: row.status,
    } as const;
}

function buildSharePathFromRow(row: ReviewShareRow) {
    return buildReviewPath({
        sceneId: row.scene_id,
        versionId: row.version_id,
        inlinePayload: row.inline_payload,
        shareToken: createSignedReviewShareToken(buildTokenPayloadFromRow(row), assertReviewShareConfigured()),
    });
}

function mapSummary(
    row: ReviewShareRow,
    profiles: ReviewShareProfileRow[],
    events: ReviewShareEventRow[],
    truthSummary?: ReviewShareSummary["truthSummary"] | null,
    options?: {
        includeSharePath?: boolean;
    },
): ReviewShareSummary {
    const creator = profiles.find((profile) => profile.id === row.created_by_user_id) ?? null;
    const resolvedTruthSummary = truthSummary ?? (asRecord(row.metadata)?.truthSummary ?? null);
    const truth = asRecord(resolvedTruthSummary) as ReviewShareSummary["truthSummary"] | null;
    const includeSharePath = options?.includeSharePath ?? false;

    return {
        id: row.id,
        projectId: row.project_id,
        studioId: row.studio_id,
        createdByUserId: row.created_by_user_id,
        createdByLabel: mapCreatorLabel(creator),
        sceneId: row.scene_id,
        versionId: row.version_id,
        status: row.status,
        tokenId: row.token_id,
        label: row.label,
        note: row.note,
        deliveryMode: row.delivery_mode,
        contentMode: row.inline_payload ? "inline_package" : "saved_version",
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        lastAccessedAt: row.last_accessed_at,
        revokedAt: row.revoked_at,
        createdAt: row.created_at,
        sharePath: includeSharePath ? buildSharePathFromRow(row) : null,
        recentEvents: events.filter((event) => event.review_share_id === row.id).slice(0, 4).map(mapEvent),
        truthSummary: truth,
        ...flattenWorldTruthSummary(truth),
    };
}

async function logReviewShareEvent({
    row,
    actorUserId,
    eventType,
    summary,
    requestPath,
    metadata,
}: {
    row: ReviewShareRow;
    actorUserId?: string | null;
    eventType: ReviewShareEventRow["event_type"];
    summary: string;
    requestPath?: string | null;
    metadata?: Record<string, unknown>;
}) {
    await insertReviewShareEvent({
        review_share_id: row.id,
        project_id: row.project_id,
        studio_id: row.studio_id,
        actor_user_id: actorUserId ?? null,
        event_type: eventType,
        request_path: requestPath ?? null,
        summary,
        metadata: metadata ?? {},
    });
}

async function expireReviewShare(row: ReviewShareRow) {
    if (row.status === "expired") {
        return row;
    }

    const updated = await updateReviewShare(
        row.id,
        {
            status: "expired",
        },
        {
            status: "eq.active",
        },
    );

    const nextRow = updated ?? { ...row, status: "expired" as const };
    await logReviewShareEvent({
        row: nextRow,
        eventType: "expired",
        summary: `Review share ${nextRow.label ?? nextRow.id} expired.`,
    });
    return nextRow;
}

async function syncReviewShareExpiry(row: ReviewShareRow) {
    if (row.status !== "active") {
        return row;
    }

    if (Date.parse(row.expires_at) <= Date.now()) {
        return expireReviewShare(row);
    }

    return row;
}

async function touchReviewShareAccess(row: ReviewShareRow, requestPath: string | null) {
    const lastAccessedAt = row.last_accessed_at ? Date.parse(row.last_accessed_at) : null;
    if (lastAccessedAt && Date.now() - lastAccessedAt < REVIEW_SHARE_ACCESS_WRITE_WINDOW_MS) {
        return;
    }

    const now = new Date().toISOString();
    await updateReviewShare(row.id, {
        last_accessed_at: now,
    });

    await logReviewShareEvent({
        row,
        eventType: row.last_accessed_at ? "accessed" : "opened",
        summary: row.last_accessed_at
            ? `Accessed review share ${row.label ?? row.id}.`
            : `Opened review share ${row.label ?? row.id}.`,
        requestPath,
    });
}

async function recordFailedAccess(row: ReviewShareRow, requestPath: string | null, reason: string) {
    await logReviewShareEvent({
        row,
        eventType: "failed_access",
        summary: `Rejected review share access for ${row.label ?? row.id}.`,
        requestPath,
        metadata: {
            reason,
        },
    });
}

async function resolveManageableReviewShareForSession(session: AuthSession, shareId: string) {
    const row = await getReviewShareById(shareId);
    if (!row) {
        throw new ReviewShareServiceError("Review share not found.", 404);
    }

    const syncedRow = await syncReviewShareExpiry(row);
    if (syncedRow.project_id) {
        const detail = await getProjectDetailForSession(session, syncedRow.project_id);
        if (!detail) {
            throw new ReviewShareServiceError("Review share not found.", 404);
        }
        if (!isManageableProjectReviewRole(detail.project.membershipRole)) {
            throw new ReviewShareServiceError("Project review share management requires owner, editor, or reviewer access.", 403);
        }
        return syncedRow;
    }

    const activeStudio = session.studios.find((studio) => studio.studioId === syncedRow.studio_id) ?? null;
    const canManageStandaloneShare =
        syncedRow.created_by_user_id === session.user.userId || Boolean(activeStudio && ["owner", "admin"].includes(activeStudio.role));

    if (!canManageStandaloneShare) {
        throw new ReviewShareServiceError("Review share management is limited to the creator or a studio owner/admin.", 403);
    }

    return syncedRow;
}

export function getReviewShareErrorStatus(error: unknown) {
    if (error instanceof ReviewShareServiceError) {
        return error.status;
    }
    return 400;
}

export function isReviewShareSigningConfigured(env: NodeJS.ProcessEnv = process.env) {
    return Boolean(getReviewShareSecret(env));
}

export function createLocalhostReviewShareResponse({
    origin,
    payload,
}: {
    origin: string;
    payload: CreateReviewShareRequest;
}): CreateReviewShareResponse {
    const resolved = resolveReviewShareRequestArtifacts(payload);
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.hostname !== "localhost") {
        throw new Error("Local review share fallback is restricted to localhost.");
    }

    const sharePath = buildReviewPath({
        sceneId: resolved.sceneId,
        versionId: resolved.versionId,
        inlinePayload: payload.payload ?? null,
    });

    return {
        shareMode: "localhost_fallback",
        shareUrl: buildAbsoluteReviewUrl(origin, sharePath),
        shareToken: null,
        expiresAt: new Date(Date.now() + (payload.expiresInHours ?? 24 * 7) * 60 * 60 * 1000).toISOString(),
    };
}

export async function createReviewShareForSession({
    session,
    origin,
    payload,
}: {
    session: AuthSession;
    origin: string;
    payload: CreateReviewShareRequest;
}): Promise<CreateReviewShareResponse> {
    assertReviewShareConfigured();
    const resolved = resolveReviewShareRequestArtifacts(payload);

    const sceneId = resolved.sceneId;
    const versionId = resolved.versionId;
    const hasSavedVersionIdentity = Boolean(sceneId && versionId);
    const savedVersionArtifacts = hasSavedVersionIdentity
        ? await resolveSavedVersionReviewShareArtifacts({
              session,
              sceneId: sceneId ?? "",
              versionId: versionId ?? "",
          })
        : null;
    const savedVersionReadiness = hasSavedVersionIdentity
        ? await resolveSavedVersionReviewShareReadiness({
              session,
              sceneId: sceneId ?? "",
              versionId: versionId ?? "",
              sceneDocument: savedVersionArtifacts?.sceneDocument ?? null,
              sceneGraph: savedVersionArtifacts?.sceneGraph ?? null,
          })
        : null;

    const sceneAccess = sceneId
        ? await ensureSessionSceneAccess({
              session,
              sceneId,
          })
        : null;

    if (sceneAccess?.linkedElsewhere) {
        throw new Error("Scene is linked to another account.");
    }

    const effectiveProjectId = payload.projectId ?? sceneAccess?.projectId ?? null;
    const projectDetail = effectiveProjectId ? await getProjectDetailForSession(session, effectiveProjectId) : null;
    if (effectiveProjectId && !projectDetail) {
        throw new ReviewShareServiceError("Project not found.", 404);
    }

    if (effectiveProjectId && !sceneId) {
        throw new ReviewShareServiceError("Project-scoped review shares require a scene identifier.");
    }

    if (effectiveProjectId && projectDetail && !canManageProjectReviewShares(projectDetail.project.membershipRole)) {
        throw new ReviewShareServiceError("Project review sharing requires owner, editor, or reviewer access.", 403);
    }

    if (effectiveProjectId && sceneId && projectDetail && !projectDetail.worldLinks.some((entry) => entry.sceneId === sceneId)) {
        throw new ReviewShareServiceError("Project does not own the requested scene.", 403);
    }

    if (savedVersionReadiness && !savedVersionReadiness.canCreate) {
        throw new ReviewShareServiceError(savedVersionReadiness.detail, 409);
    }

    const scope = buildReviewShareScope({
        sceneId,
        versionId,
        reviewPackage: hasSavedVersionIdentity ? null : resolved.reviewPackage,
        sceneDocument: hasSavedVersionIdentity ? savedVersionArtifacts?.sceneDocument ?? null : resolved.sceneDocument,
        sceneGraph: hasSavedVersionIdentity ? savedVersionArtifacts?.sceneGraph ?? null : resolved.sceneGraph,
        assetsList: hasSavedVersionIdentity ? savedVersionArtifacts?.assetsList ?? [] : resolved.assetsList,
    });
    const truthSummary = await deriveReviewShareTruthSummary({
        session,
        sceneId,
        versionId,
        reviewPackage: hasSavedVersionIdentity ? null : resolved.reviewPackage,
        sceneDocument: hasSavedVersionIdentity ? savedVersionArtifacts?.sceneDocument ?? null : resolved.sceneDocument,
        sceneGraph: hasSavedVersionIdentity ? savedVersionArtifacts?.sceneGraph ?? null : resolved.sceneGraph,
    });

    if (!sceneId && scope.storagePrefixes.length > 0) {
        throw new Error("Inline review shares with protected storage assets require a sceneId.");
    }

    const now = Date.now();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + (payload.expiresInHours ?? 24 * 7) * 60 * 60 * 1000).toISOString();
    const inlinePayload = hasSavedVersionIdentity ? null : payload.payload ?? null;
    const label = normalizeOptionalText(payload.label) ?? deriveDefaultLabel({
        sceneId,
        versionId,
        hasInlinePayload: Boolean(inlinePayload),
    });
    const note = normalizeOptionalText(payload.note);
    const reusableShareRows =
        effectiveProjectId
            ? await listProjectReviewShares(effectiveProjectId)
            : projectDetail?.project.studioId ?? session.activeStudioId
              ? await listStudioReviewShares(projectDetail?.project.studioId ?? session.activeStudioId ?? "", 120)
              : [];
    const reusableShare = findReusableActiveReviewShare({
        rows: reusableShareRows,
        candidate: {
            projectId: effectiveProjectId,
            studioId: projectDetail?.project.studioId ?? session.activeStudioId ?? null,
            createdByUserId: session.user.userId,
            sceneId,
            versionId,
            label,
            note,
            deliveryMode: payload.deliveryMode ?? "secure_link",
            inlinePayload,
            allowedApiPaths: scope.allowedApiPaths,
            storagePrefixes: scope.storagePrefixes,
        },
        now,
    });
    if (reusableShare) {
        const sharePath = buildSharePathFromRow(reusableShare);
        return {
            shareMode: "secure_authenticated",
            shareUrl: buildAbsoluteReviewUrl(origin, sharePath),
            shareToken: createSignedReviewShareToken(buildTokenPayloadFromRow(reusableShare), assertReviewShareConfigured()),
            expiresAt: reusableShare.expires_at,
        };
    }

    const shareId = randomUUID();
    const tokenId = randomBytes(18).toString("hex");

    const inserted = await insertReviewShare({
        id: shareId,
        project_id: effectiveProjectId,
        studio_id: projectDetail?.project.studioId ?? session.activeStudioId ?? null,
        created_by_user_id: session.user.userId,
        scene_id: sceneId,
        version_id: versionId,
        status: "active",
        token_id: tokenId,
        label,
        note,
        delivery_mode: payload.deliveryMode ?? "secure_link",
        allowed_api_paths: scope.allowedApiPaths,
        storage_prefixes: scope.storagePrefixes,
        inline_payload: inlinePayload,
        issued_at: issuedAt,
        expires_at: expiresAt,
        metadata: {
            assetCount: resolved.assetsList.length,
            hasInlinePayload: Boolean(inlinePayload),
            truthSummary,
        },
    });

    if (!inserted) {
        throw new Error("Unable to persist secure review share.");
    }

    await logReviewShareEvent({
        row: inserted,
        actorUserId: session.user.userId,
        eventType: "created",
        summary: `Created review share ${inserted.label ?? inserted.id}.`,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: inserted.studio_id,
        targetType: "review_share",
        targetId: inserted.id,
        eventType: "review_share.created",
        summary: `Created secure review share ${inserted.label ?? inserted.id}.`,
        metadata: {
            projectId: inserted.project_id,
            sceneId: inserted.scene_id,
            versionId: inserted.version_id,
            expiresAt: inserted.expires_at,
        },
    });

    if (effectiveProjectId) {
        await recordProjectReviewShareForSession({
            session,
            projectId: effectiveProjectId,
            shareId: inserted.id,
            sceneId: inserted.scene_id ?? "inline review package",
            versionId: inserted.version_id,
            expiresAt: inserted.expires_at,
            label: inserted.label,
            enforceRole: true,
        });
    }

    const sharePath = buildSharePathFromRow(inserted);
    return {
        shareMode: "secure_authenticated",
        shareUrl: buildAbsoluteReviewUrl(origin, sharePath),
        shareToken: createSignedReviewShareToken(buildTokenPayloadFromRow(inserted), assertReviewShareConfigured()),
        expiresAt: inserted.expires_at,
    };
}

export async function getProjectReviewShareReadinessForSession({
    session,
    projectId,
    sceneId,
    versionId,
}: {
    session: AuthSession;
    projectId: string;
    sceneId: string;
    versionId: string;
}): Promise<ReviewShareReadiness | null> {
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        return null;
    }

    if (!(await canSessionAccessMvp(session))) {
        throw new ReviewShareServiceError("Current account is not entitled to inspect MVP version history.", 403);
    }

    if (!detail.worldLinks.some((entry) => entry.sceneId === sceneId)) {
        throw new ReviewShareServiceError("Project does not own the requested scene.", 403);
    }

    const savedVersionArtifacts = await resolveSavedVersionReviewShareArtifacts({
        session,
        sceneId,
        versionId,
    });

    return resolveSavedVersionReviewShareReadiness({
        session,
        sceneId,
        versionId,
        sceneDocument: savedVersionArtifacts?.sceneDocument ?? null,
        sceneGraph: savedVersionArtifacts?.sceneGraph ?? null,
    });
}

export async function getProjectReviewSharesForSession(
    session: AuthSession,
    projectId: string,
): Promise<ProjectReviewSharesResponse | null> {
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        return null;
    }

    const rows = await Promise.all((await listProjectReviewShares(projectId)).map((row) => syncReviewShareExpiry(row)));
    const shareIds = rows.map((row) => row.id);
    const userIds = Array.from(new Set(rows.map((row) => row.created_by_user_id).filter(Boolean) as string[]));
    const [profiles, events, canInspectSavedTruth] = await Promise.all([
        resolveReviewShareProfiles(userIds),
        listReviewShareEvents(shareIds),
        canSessionAccessMvp(session),
    ]);
    const reviewSharePermissions = getReviewShareRolePermissions(detail.project.membershipRole);
    const includeSharePath = reviewSharePermissions.canRevealReviewSharePath;

    const sharesWithTruth = await Promise.all(
        rows.map(async (row) => {
            if (!canInspectSavedTruth) {
                return {
                    row,
                    truthSummary: null as ReviewShareSummary["truthSummary"],
                };
            }

            const metadataTruth = asRecord(row.metadata)?.truthSummary as ReviewShareSummary["truthSummary"] | undefined;
            if (metadataTruth) {
                return {
                    row,
                    truthSummary: metadataTruth,
                };
            }

            if (!row.scene_id || !row.version_id) {
                return {
                    row,
                    truthSummary: null as ReviewShareSummary["truthSummary"],
                };
            }

            const truthSummary = await deriveReviewShareTruthSummary({
                session,
                sceneId: row.scene_id,
                versionId: row.version_id,
                sceneDocument: null,
                sceneGraph: null,
            });

            return {
                row,
                truthSummary,
            };
        }),
    );

    return {
        shares: sharesWithTruth.map(({ row, truthSummary }) =>
            mapSummary(row, profiles, events, truthSummary, {
                includeSharePath,
            }),
        ),
        summary: {
            totalCount: rows.length,
            activeCount: rows.filter((row) => row.status === "active").length,
            revokedCount: rows.filter((row) => row.status === "revoked").length,
            expiredCount: rows.filter((row) => row.status === "expired").length,
        },
    };
}

export async function revokeReviewShareForSession({
    session,
    shareId,
}: {
    session: AuthSession;
    shareId: string;
}) {
    const share = await resolveManageableReviewShareForSession(session, shareId);
    if (share.status !== "active") {
        throw new Error("Only active review shares can be revoked.");
    }

    const revokedAt = new Date().toISOString();
    const updated = await updateReviewShare(
        share.id,
        {
            status: "revoked",
            revoked_at: revokedAt,
            revoked_by_user_id: session.user.userId,
        },
        {
            status: "eq.active",
        },
    );

    const nextShare = updated ?? { ...share, status: "revoked" as const, revoked_at: revokedAt, revoked_by_user_id: session.user.userId };
    await logReviewShareEvent({
        row: nextShare,
        actorUserId: session.user.userId,
        eventType: "revoked",
        summary: `Revoked review share ${nextShare.label ?? nextShare.id}.`,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: nextShare.studio_id,
        targetType: "review_share",
        targetId: nextShare.id,
        eventType: "review_share.revoked",
        summary: `Revoked secure review share ${nextShare.label ?? nextShare.id}.`,
        metadata: {
            projectId: nextShare.project_id,
            sceneId: nextShare.scene_id,
            versionId: nextShare.version_id,
        },
    });

    if (nextShare.project_id) {
        await recordProjectReviewShareRevocationForSession({
            session,
            projectId: nextShare.project_id,
            shareId: nextShare.id,
            sceneId: nextShare.scene_id,
            versionId: nextShare.version_id,
            label: nextShare.label,
        });
    }
}

export async function recordReviewShareCopiedForSession({
    session,
    shareId,
}: {
    session: AuthSession;
    shareId: string;
}) {
    const share = await resolveManageableReviewShareForSession(session, shareId);
    if (share.status !== "active") {
        throw new Error("Only active review shares can be copied.");
    }

    await logReviewShareEvent({
        row: share,
        actorUserId: session.user.userId,
        eventType: "copied",
        summary: `Copied review share ${share.label ?? share.id}.`,
    });

    await logPlatformAuditEvent({
        actorUserId: session.user.userId,
        actorType: "user",
        studioId: share.studio_id,
        targetType: "review_share",
        targetId: share.id,
        eventType: "review_share.copied",
        summary: `Copied secure review share ${share.label ?? share.id}.`,
    });
}

export async function authorizeReviewShareToken({
    token,
    pathname,
    method,
}: {
    token: string;
    pathname: string;
    method: string;
}) {
    const secret = getReviewShareSecret();
    if (!secret) {
        return null as ReviewShareTokenPayload | null;
    }

    const payload = verifyReviewSharePayload(token, secret);
    if (!payload) {
        return null as ReviewShareTokenPayload | null;
    }

    const row = await getReviewShareByToken(payload.shareId, payload.tokenId);
    if (!row) {
        return null as ReviewShareTokenPayload | null;
    }

    const syncedRow = await syncReviewShareExpiry(row);
    const requestPath = normalizeProxyPathValue(pathname);
    const accessDecision = evaluateReviewShareAccess({
        payload,
        pathname,
        method,
        row: buildAccessSnapshotFromRow(syncedRow),
    });
    if (!accessDecision.allowed) {
        if (accessDecision.reason && accessDecision.reason !== "expired" && accessDecision.reason !== "method_not_allowed") {
            await recordFailedAccess(syncedRow, requestPath, accessDecision.reason);
        }
        return null as ReviewShareTokenPayload | null;
    }

    await touchReviewShareAccess(syncedRow, requestPath);
    return accessDecision.payload;
}

export async function getReviewShareDashboardSummaryForSession(session: AuthSession) {
    if (!session.activeStudioId) {
        return {
            totalCount: 0,
            activeCount: 0,
            revokedCount: 0,
            expiredCount: 0,
            lastCreatedAt: null,
            lastAccessedAt: null,
        };
    }

    const rows = await Promise.all((await listStudioReviewShares(session.activeStudioId, 160)).map((row) => syncReviewShareExpiry(row)));

    return {
        totalCount: rows.length,
        activeCount: rows.filter((row) => row.status === "active").length,
        revokedCount: rows.filter((row) => row.status === "revoked").length,
        expiredCount: rows.filter((row) => row.status === "expired").length,
        lastCreatedAt: rows[0]?.created_at ?? null,
        lastAccessedAt:
            rows
                .map((row) => row.last_accessed_at)
                .filter((value): value is string => Boolean(value))
                .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
    };
}
