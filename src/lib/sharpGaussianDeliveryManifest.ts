type SharpGaussianManifestVariant = {
    id: string | null;
    label: string | null;
    role: string | null;
    codec: string | null;
    source: string;
    pointCount: number | null;
    bytes: number | null;
    maxTextureSize: number | null;
    priority: number | null;
    progressive: boolean;
};

export type SharpGaussianManifestPage = {
    id: string;
    label: string | null;
    role: string | null;
    source: string;
    pointCount: number | null;
    bytes: number | null;
    priority: number | null;
    pageIndex: number | null;
    chunkCount: number | null;
    progressive: boolean;
    focusCenter: [number, number, number] | null;
    focusRadius: number | null;
    sticky: boolean;
    preload: boolean;
    evictionPriority: number | null;
};

type SharpGaussianManifestResolution = {
    source: string;
    manifestUrl: string;
    variant: SharpGaussianManifestVariant | null;
    staged: boolean;
    streaming: boolean;
    refinePages: SharpGaussianManifestPage[];
    upgradeSource: string | null;
    upgradeVariant: SharpGaussianManifestVariant | null;
};

type ManifestProgressReporter = (message: string) => void;

const SHARP_GAUSSIAN_MANIFEST_CACHE_MODE: RequestCache = process.env.NODE_ENV === "development" ? "no-store" : "force-cache";
const STAGED_DELIVERY_MIN_POINT_DELTA = 160_000;
const STAGED_DELIVERY_MIN_BYTES_DELTA = 24 * 1024 * 1024;

type SharpGaussianVariantDeliveryTier = "bootstrap" | "full" | "fallback" | "standard";

function normalizeString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeVariantKey(value: unknown) {
    return normalizeString(value).toLowerCase();
}

function classifyVariantDeliveryTier({
    id,
    label,
    role,
}: {
    id?: string | null;
    label?: string | null;
    role?: string | null;
}): SharpGaussianVariantDeliveryTier {
    const descriptor = normalizeVariantKey(`${role ?? ""} ${label ?? ""} ${id ?? ""}`);
    if (!descriptor) {
        return "standard";
    }

    if (/(fallback|backup|legacy|compat)/.test(descriptor)) {
        return "fallback";
    }

    if (/(bootstrap|initial|faststart|fast-start|fast|preview|safe|balanced|mobile|starter)/.test(descriptor)) {
        return "bootstrap";
    }

    if (/(hero|premium|cinematic|final|full)/.test(descriptor)) {
        return "full";
    }

    return "standard";
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
}

function isManifestLikeUrl(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return false;
    }

    return (
        normalized.includes("manifest=") ||
        normalized.includes("asset_manifest") ||
        normalized.includes("/manifest") ||
        normalized.includes(".manifest") ||
        normalized.includes("delivery-manifest")
    );
}

function readManifestUrl(value: unknown) {
    return normalizeString(value);
}

function resolveManifestRelativeUrl(manifestUrl: string, value: string) {
    try {
        const baseUrl = typeof window !== "undefined" ? new URL(manifestUrl, window.location.href).toString() : manifestUrl;
        return new URL(value, baseUrl).toString();
    } catch {
        return value;
    }
}

function readVariantSource(record: Record<string, unknown>) {
    return (
        normalizeString(record.url) ||
        normalizeString(record.source) ||
        normalizeString(record.viewer_source) ||
        normalizeString(record.splat_source) ||
        normalizeString(record.asset_url) ||
        normalizeString(record.href) ||
        normalizeString(record.path)
    );
}

function readVariantCodec(record: Record<string, unknown>) {
    return normalizeString(record.codec) || normalizeString(record.format) || null;
}

function readVariantRole(record: Record<string, unknown>) {
    return normalizeString(record.role) || normalizeString(record.kind) || normalizeString(record.type) || null;
}

function readVariantLabel(record: Record<string, unknown>) {
    return normalizeString(record.label) || normalizeString(record.name) || normalizeString(record.title) || null;
}

function readVariantId(record: Record<string, unknown>) {
    return normalizeString(record.id) || normalizeString(record.key) || normalizeString(record.variant_id) || null;
}

function readVariantPointCount(record: Record<string, unknown>) {
    return asNumber(record.point_count ?? record.pointCount ?? record.points ?? record.count ?? record.preferred_point_budget);
}

function readVariantBytes(record: Record<string, unknown>) {
    return asNumber(record.bytes ?? record.size_bytes ?? record.sizeBytes ?? record.byte_length ?? record.byteLength ?? record.size);
}

function readVariantMaxTextureSize(record: Record<string, unknown>) {
    return asNumber(record.max_texture_size ?? record.maxTextureSize ?? record.texture_size ?? record.textureSize);
}

function readVariantPriority(record: Record<string, unknown>) {
    const priority = Number(record.priority ?? record.rank ?? record.order);
    return Number.isFinite(priority) ? priority : null;
}

function readVariantProgressive(record: Record<string, unknown>) {
    return Boolean(record.progressive ?? record.streaming ?? record.is_progressive ?? record.isStreaming);
}

function readPageIndex(record: Record<string, unknown>) {
    const pageIndex = Number(record.page_index ?? record.pageIndex ?? record.index ?? record.order_index);
    return Number.isFinite(pageIndex) && pageIndex >= 0 ? pageIndex : null;
}

function readChunkCount(record: Record<string, unknown>) {
    return asNumber(record.chunk_count ?? record.chunkCount ?? record.chunks ?? record.chunk_total);
}

function readVector3Tuple(value: unknown): [number, number, number] | null {
    if (!Array.isArray(value) || value.length < 3) {
        return null;
    }
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return [x, y, z];
}

function readBooleanLike(value: unknown) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
    }
    return false;
}

function collectVariantRecords(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizeVariant(record: Record<string, unknown>): SharpGaussianManifestVariant | null {
    const source = readVariantSource(record);
    if (!source) {
        return null;
    }

    return {
        id: readVariantId(record),
        label: readVariantLabel(record),
        role: readVariantRole(record),
        codec: readVariantCodec(record),
        source,
        pointCount: readVariantPointCount(record),
        bytes: readVariantBytes(record),
        maxTextureSize: readVariantMaxTextureSize(record),
        priority: readVariantPriority(record),
        progressive: readVariantProgressive(record),
    };
}

function normalizePage(record: Record<string, unknown>): SharpGaussianManifestPage | null {
    const source = readVariantSource(record);
    if (!source) {
        return null;
    }

    const id = readVariantId(record) || `page-${readPageIndex(record) ?? "x"}`;

    return {
        id,
        label: readVariantLabel(record),
        role: readVariantRole(record),
        source,
        pointCount: readVariantPointCount(record),
        bytes: readVariantBytes(record),
        priority: readVariantPriority(record),
        pageIndex: readPageIndex(record),
        chunkCount: readChunkCount(record),
        progressive: readVariantProgressive(record),
        focusCenter: readVector3Tuple(record.focus_center ?? record.focusCenter ?? record.center),
        focusRadius: asNumber(record.focus_radius ?? record.focusRadius ?? record.radius),
        sticky: readBooleanLike(record.sticky ?? record.keep_resident ?? record.keepResident),
        preload: readBooleanLike(record.preload ?? record.hero_preload ?? record.heroPreload),
        evictionPriority: asNumber(record.eviction_priority ?? record.evictionPriority ?? record.evict_priority),
    };
}

function collectManifestVariants(manifest: Record<string, unknown>) {
    const delivery = asRecord(manifest.delivery);
    const variants = [
        ...collectVariantRecords(delivery?.variants),
        ...collectVariantRecords(delivery?.runtime_variants),
        ...collectVariantRecords(manifest.variants),
        ...collectVariantRecords(manifest.assets),
        ...collectVariantRecords(manifest.levels),
        ...collectVariantRecords(manifest.outputs),
    ]
        .map(normalizeVariant)
        .filter((variant): variant is SharpGaussianManifestVariant => Boolean(variant));

    const topLevelVariant = normalizeVariant({
        url: manifest.url,
        source: manifest.source,
        viewer_source: manifest.viewer_source,
        splat_source: manifest.splat_source,
        asset_url: manifest.asset_url,
        href: manifest.href,
        path: manifest.path,
        codec: manifest.codec,
        format: manifest.format,
        label: manifest.label,
        name: manifest.name,
        title: manifest.title,
        point_count: manifest.point_count,
        pointCount: manifest.pointCount,
        bytes: manifest.bytes,
        size_bytes: manifest.size_bytes,
        sizeBytes: manifest.sizeBytes,
        byte_length: manifest.byte_length,
        byteLength: manifest.byteLength,
        size: manifest.size,
        max_texture_size: manifest.max_texture_size,
        maxTextureSize: manifest.maxTextureSize,
        priority: manifest.priority,
        rank: manifest.rank,
        order: manifest.order,
        progressive: manifest.progressive,
        streaming: manifest.streaming,
    });

    if (topLevelVariant) {
        variants.unshift(topLevelVariant);
    }

    return variants;
}

function collectManifestPages(manifest: Record<string, unknown>) {
    const delivery = asRecord(manifest.delivery);

    return [
        ...collectVariantRecords(delivery?.pages),
        ...collectVariantRecords(delivery?.page_variants),
        ...collectVariantRecords(delivery?.page_assets),
        ...collectVariantRecords(manifest.pages),
        ...collectVariantRecords(manifest.page_variants),
        ...collectVariantRecords(manifest.page_assets),
    ]
        .map(normalizePage)
        .filter((page): page is SharpGaussianManifestPage => Boolean(page));
}

function isPlyLikeVariantSource(source: string) {
    return /\.(ply)(\?.*)?$/i.test(source.trim());
}

function isBrowserSafeVariant(variant: SharpGaussianManifestVariant) {
    const codec = normalizeVariantKey(variant.codec);
    if (codec) {
        return codec.includes("ply");
    }

    return isPlyLikeVariantSource(variant.source);
}

function readVariantDeliveryTier(variant: SharpGaussianManifestVariant) {
    return classifyVariantDeliveryTier({
        id: variant.id,
        label: variant.label,
        role: variant.role,
    });
}

function isBootstrapVariant(variant: SharpGaussianManifestVariant) {
    return readVariantDeliveryTier(variant) === "bootstrap";
}

function isFullVariant(variant: SharpGaussianManifestVariant) {
    return readVariantDeliveryTier(variant) === "full";
}

function isFallbackVariant(variant: SharpGaussianManifestVariant) {
    return readVariantDeliveryTier(variant) === "fallback";
}

function isProvenLighterVariant(candidate: SharpGaussianManifestVariant, reference: SharpGaussianManifestVariant) {
    let hasEvidence = false;

    if (candidate.pointCount !== null && reference.pointCount !== null) {
        if (candidate.pointCount >= reference.pointCount) {
            return false;
        }
        hasEvidence = true;
    }

    if (candidate.bytes !== null && reference.bytes !== null) {
        if (candidate.bytes >= reference.bytes) {
            return false;
        }
        hasEvidence = true;
    }

    return hasEvidence;
}

function hasMeaningfulStagedUpgrade(initialVariant: SharpGaussianManifestVariant, selectedVariant: SharpGaussianManifestVariant) {
    let meaningfulDelta = false;

    if (initialVariant.pointCount !== null && selectedVariant.pointCount !== null) {
        const pointDelta = selectedVariant.pointCount - initialVariant.pointCount;
        if (pointDelta > 0 && pointDelta >= Math.max(STAGED_DELIVERY_MIN_POINT_DELTA, Math.round(selectedVariant.pointCount * 0.14))) {
            meaningfulDelta = true;
        }
    }

    if (initialVariant.bytes !== null && selectedVariant.bytes !== null) {
        const bytesDelta = selectedVariant.bytes - initialVariant.bytes;
        if (bytesDelta > 0 && bytesDelta >= Math.max(STAGED_DELIVERY_MIN_BYTES_DELTA, Math.round(selectedVariant.bytes * 0.16))) {
            meaningfulDelta = true;
        }
    }

    return meaningfulDelta;
}

function formatVariantSummary(variant: SharpGaussianManifestVariant | null) {
    if (!variant) {
        return "manifest variant";
    }

    const label = variant.label ?? variant.role ?? variant.id ?? "manifest variant";
    const details: string[] = [];
    if (variant.codec) {
        details.push(variant.codec);
    }
    if (variant.pointCount !== null) {
        details.push(`${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(variant.pointCount)} pts`);
    }
    if (variant.bytes !== null) {
        details.push(`${Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(variant.bytes / (1024 * 1024))} MB`);
    }

    return details.length > 0 ? `${label} (${details.join(", ")})` : label;
}

function isBetterVariant(candidate: SharpGaussianManifestVariant, current: SharpGaussianManifestVariant | null, targetPointBudget: number | null) {
    if (!current) {
        return true;
    }

    if (targetPointBudget !== null) {
        const candidatePointCount = candidate.pointCount;
        const currentPointCount = current.pointCount;
        const candidateWithinBudget = candidatePointCount !== null && candidatePointCount <= targetPointBudget;
        const currentWithinBudget = currentPointCount !== null && currentPointCount <= targetPointBudget;

        if (candidateWithinBudget !== currentWithinBudget) {
            return candidateWithinBudget;
        }

        if (candidateWithinBudget && currentWithinBudget) {
            return (candidatePointCount ?? 0) > (currentPointCount ?? 0);
        }

        const candidateOvershoot =
            candidatePointCount === null ? Number.POSITIVE_INFINITY : Math.max(0, candidatePointCount - targetPointBudget);
        const currentOvershoot =
            currentPointCount === null ? Number.POSITIVE_INFINITY : Math.max(0, currentPointCount - targetPointBudget);
        if (candidateOvershoot !== currentOvershoot) {
            return candidateOvershoot < currentOvershoot;
        }
    }

    const candidatePriority = candidate.priority ?? Number.POSITIVE_INFINITY;
    const currentPriority = current.priority ?? Number.POSITIVE_INFINITY;
    if (candidatePriority !== currentPriority) {
        return candidatePriority < currentPriority;
    }

    if ((candidate.pointCount ?? 0) !== (current.pointCount ?? 0)) {
        return (candidate.pointCount ?? 0) > (current.pointCount ?? 0);
    }

    if ((candidate.bytes ?? 0) !== (current.bytes ?? 0)) {
        const candidateBytes = candidate.bytes ?? Number.POSITIVE_INFINITY;
        const currentBytes = current.bytes ?? Number.POSITIVE_INFINITY;
        if (candidateBytes !== currentBytes) {
            return candidateBytes < currentBytes;
        }
    }

    return Boolean(candidate.progressive) && !current.progressive;
}

function matchesVariantKey(variant: SharpGaussianManifestVariant, value: string) {
    const normalizedValue = normalizeVariantKey(value);
    if (!normalizedValue) {
        return false;
    }

    return (
        normalizeVariantKey(variant.id) === normalizedValue ||
        normalizeVariantKey(variant.label) === normalizedValue ||
        normalizeVariantKey(variant.role) === normalizedValue ||
        normalizeVariantKey(variant.codec) === normalizedValue
    );
}

function readInitialVariantPreference(manifest: Record<string, unknown>, delivery: Record<string, unknown> | null) {
    return (
        normalizeString(manifest.initial_variant) ||
        normalizeString(manifest.bootstrap_variant) ||
        normalizeString(manifest.safe_variant) ||
        normalizeString(manifest.fast_variant) ||
        normalizeString(delivery?.initial_variant) ||
        normalizeString(delivery?.bootstrap_variant) ||
        normalizeString(delivery?.safe_variant) ||
        normalizeString(delivery?.fast_variant)
    );
}

function readPreferredVariantPreference(manifest: Record<string, unknown>, delivery: Record<string, unknown> | null) {
    return (
        normalizeString(manifest.preferred_variant) ||
        normalizeString(manifest.default_variant) ||
        normalizeString(manifest.full_variant) ||
        normalizeString(manifest.hero_variant) ||
        normalizeString(manifest.premium_variant) ||
        normalizeString(manifest.final_variant) ||
        normalizeString(delivery?.recommended_variant) ||
        normalizeString(delivery?.recommended_viewer_mode) ||
        normalizeString(delivery?.full_variant) ||
        normalizeString(delivery?.hero_variant) ||
        normalizeString(delivery?.premium_variant) ||
        normalizeString(delivery?.final_variant)
    );
}

function readVariantIntentScore(variant: SharpGaussianManifestVariant) {
    const tier = readVariantDeliveryTier(variant);
    if (tier === "bootstrap") {
        return 2;
    }
    if (tier === "full") {
        return -1;
    }
    if (tier === "fallback") {
        return -2;
    }
    return 0;
}

function readNavigatorDeviceMemory() {
    if (typeof navigator === "undefined") {
        return null;
    }

    const nextValue = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return typeof nextValue === "number" ? nextValue : null;
}

function isHighCapabilityUpgradeHost(maxTextureSize: number | null) {
    const deviceMemory = readNavigatorDeviceMemory();
    const hardwareConcurrency =
        typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
    const coarsePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

    return (
        !coarsePointer &&
        deviceMemory !== null &&
        deviceMemory >= 8 &&
        hardwareConcurrency !== null &&
        hardwareConcurrency >= 8 &&
        maxTextureSize !== null &&
        maxTextureSize >= 8192
    );
}

function selectManifestInitialVariant({
    variants,
    preferredVariant,
    manifest,
    delivery,
    targetPointBudget,
    maxTextureSize,
}: {
    variants: SharpGaussianManifestVariant[];
    preferredVariant: SharpGaussianManifestVariant;
    manifest: Record<string, unknown>;
    delivery: Record<string, unknown> | null;
    targetPointBudget: number | null;
    maxTextureSize: number | null;
}) {
    const preferredPointCount = preferredVariant.pointCount;
    const preferredBytes = preferredVariant.bytes;
    if (!isHighCapabilityUpgradeHost(maxTextureSize)) {
        return null;
    }

    const safeVariants = variants.filter(
        (variant) =>
            variant.source !== preferredVariant.source &&
            isBrowserSafeVariant(variant) &&
            (!variant.maxTextureSize || !maxTextureSize || variant.maxTextureSize <= maxTextureSize) &&
            isProvenLighterVariant(variant, preferredVariant),
    );
    if (safeVariants.length === 0) {
        return null;
    }

    const explicitInitialVariantKey = readInitialVariantPreference(manifest, delivery);
    if (explicitInitialVariantKey) {
        const explicitVariant = safeVariants.find((variant) => matchesVariantKey(variant, explicitInitialVariantKey));
        if (explicitVariant && hasMeaningfulStagedUpgrade(explicitVariant, preferredVariant)) {
            return explicitVariant;
        }
    }

    const candidateVariants = safeVariants.filter((variant) => {
        if (!hasMeaningfulStagedUpgrade(variant, preferredVariant)) {
            return false;
        }

        if (preferredPointCount !== null && variant.pointCount !== null) {
            const minimumInitialPointCount = Math.max(200_000, Math.round(preferredPointCount * 0.45));
            if (variant.pointCount < minimumInitialPointCount) {
                return false;
            }
        }

        if (preferredBytes !== null && variant.bytes !== null) {
            const minimumInitialBytes = Math.max(16 * 1024 * 1024, Math.round(preferredBytes * 0.35));
            if (variant.bytes < minimumInitialBytes) {
                return false;
            }
        }

        return true;
    });
    if (candidateVariants.length === 0) {
        return null;
    }

    const targetInitialPointCount =
        preferredPointCount !== null
            ? Math.min(targetPointBudget ? Math.round(targetPointBudget * 0.72) : preferredPointCount, Math.round(preferredPointCount * 0.8))
            : null;
    const targetInitialBytes = preferredBytes !== null ? Math.round(preferredBytes * 0.72) : null;
    const sortedCandidates = [...candidateVariants].sort((left, right) => {
        const leftIntent = readVariantIntentScore(left);
        const rightIntent = readVariantIntentScore(right);
        if (leftIntent !== rightIntent) {
            return rightIntent - leftIntent;
        }

        const leftWithinPointTarget = Boolean(targetInitialPointCount !== null && left.pointCount !== null && left.pointCount <= targetInitialPointCount);
        const rightWithinPointTarget = Boolean(targetInitialPointCount !== null && right.pointCount !== null && right.pointCount <= targetInitialPointCount);
        if (leftWithinPointTarget !== rightWithinPointTarget) {
            return leftWithinPointTarget ? -1 : 1;
        }

        const leftWithinByteTarget = Boolean(targetInitialBytes !== null && left.bytes !== null && left.bytes <= targetInitialBytes);
        const rightWithinByteTarget = Boolean(targetInitialBytes !== null && right.bytes !== null && right.bytes <= targetInitialBytes);
        if (leftWithinByteTarget !== rightWithinByteTarget) {
            return leftWithinByteTarget ? -1 : 1;
        }

        const leftTier = readVariantDeliveryTier(left);
        const rightTier = readVariantDeliveryTier(right);
        if (leftTier !== rightTier) {
            if (leftTier === "bootstrap") {
                return -1;
            }
            if (rightTier === "bootstrap") {
                return 1;
            }
        }

        const leftPointDistance = targetInitialPointCount !== null && left.pointCount !== null ? Math.abs(left.pointCount - targetInitialPointCount) : Number.POSITIVE_INFINITY;
        const rightPointDistance = targetInitialPointCount !== null && right.pointCount !== null ? Math.abs(right.pointCount - targetInitialPointCount) : Number.POSITIVE_INFINITY;
        if (leftPointDistance !== rightPointDistance) {
            return leftPointDistance - rightPointDistance;
        }

        const leftByteDistance = targetInitialBytes !== null && left.bytes !== null ? Math.abs(left.bytes - targetInitialBytes) : Number.POSITIVE_INFINITY;
        const rightByteDistance = targetInitialBytes !== null && right.bytes !== null ? Math.abs(right.bytes - targetInitialBytes) : Number.POSITIVE_INFINITY;
        if (leftByteDistance !== rightByteDistance) {
            return leftByteDistance - rightByteDistance;
        }

        if ((left.bytes ?? 0) !== (right.bytes ?? 0)) {
            const leftBytes = left.bytes ?? Number.POSITIVE_INFINITY;
            const rightBytes = right.bytes ?? Number.POSITIVE_INFINITY;
            if (leftBytes !== rightBytes) {
                return leftBytes - rightBytes;
            }
        }

        if (left.progressive !== right.progressive) {
            return left.progressive ? -1 : 1;
        }

        if ((left.pointCount ?? 0) !== (right.pointCount ?? 0)) {
            return (right.pointCount ?? 0) - (left.pointCount ?? 0);
        }

        return (left.label ?? left.role ?? left.id ?? "").localeCompare(right.label ?? right.role ?? right.id ?? "");
    });

    return sortedCandidates[0] ?? null;
}

function selectManifestVariant(variants: SharpGaussianManifestVariant[], targetPointBudget: number | null, maxTextureSize: number | null) {
    const safeVariants = variants.filter(
        (variant) => isBrowserSafeVariant(variant) && (!variant.maxTextureSize || !maxTextureSize || variant.maxTextureSize <= maxTextureSize),
    );
    if (safeVariants.length === 0) {
        return null;
    }

    const fullCandidates = safeVariants.filter((variant) => isFullVariant(variant));
    const standardCandidates = safeVariants.filter((variant) => !isFullVariant(variant) && !isBootstrapVariant(variant) && !isFallbackVariant(variant));
    const bootstrapCandidates = safeVariants.filter((variant) => isBootstrapVariant(variant));
    const candidatePool =
        fullCandidates.length > 0
            ? fullCandidates
            : standardCandidates.length > 0
              ? standardCandidates
              : bootstrapCandidates.length > 0
                ? bootstrapCandidates
                : safeVariants;

    const preferredCandidates = candidatePool.filter((variant) => variant.priority !== null && variant.priority <= 0);
    if (preferredCandidates.length > 0) {
        return preferredCandidates.reduce((current, candidate) => (isBetterVariant(candidate, current, targetPointBudget) ? candidate : current), null as SharpGaussianManifestVariant | null);
    }

    return candidatePool.reduce((current, candidate) => (isBetterVariant(candidate, current, targetPointBudget) ? candidate : current), null as SharpGaussianManifestVariant | null);
}

export function isLikelySharpGaussianManifestSource(source: string) {
    return isManifestLikeUrl(source);
}

export async function resolveSharpGaussianManifestSource({
    source,
    maxTextureSize,
    desiredPointBudget,
    signal,
    onProgress,
}: {
    source: string;
    maxTextureSize: number | null;
    desiredPointBudget: number | null;
    signal: AbortSignal;
    onProgress?: ManifestProgressReporter;
}): Promise<SharpGaussianManifestResolution> {
    const manifestUrl = readManifestUrl(source);
    if (!isManifestLikeUrl(manifestUrl)) {
        return {
            source,
            manifestUrl: "",
            variant: null,
            staged: false,
            streaming: false,
            refinePages: [],
            upgradeSource: null,
            upgradeVariant: null,
        };
    }

    onProgress?.("Reading environment manifest...");

    const response = await fetch(manifestUrl, {
        cache: SHARP_GAUSSIAN_MANIFEST_CACHE_MODE,
        signal,
    });
    if (!response.ok) {
        throw new Error(`Could not load environment manifest ${manifestUrl}: ${response.status} ${response.statusText}`.trim());
    }

    const manifest = asRecord(await response.json());
    if (!manifest) {
        throw new Error(`Environment manifest ${manifestUrl} did not contain a JSON object.`);
    }

    const variants = collectManifestVariants(manifest);
    const pages = collectManifestPages(manifest);
    const delivery = asRecord(manifest.delivery);
    const preferredVariantId = readPreferredVariantPreference(manifest, delivery);

    const preferredVariant = preferredVariantId
        ? variants.find((variant) => matchesVariantKey(variant, preferredVariantId))
        : null;
    const selectedVariant =
        preferredVariant &&
        isBrowserSafeVariant(preferredVariant) &&
        (!preferredVariant.maxTextureSize || !maxTextureSize || preferredVariant.maxTextureSize <= maxTextureSize)
        ? preferredVariant
        : selectManifestVariant(variants, desiredPointBudget, maxTextureSize);
    const initialVariant =
        selectedVariant && variants.length > 1
            ? selectManifestInitialVariant({
                  variants,
                  preferredVariant: selectedVariant,
                  manifest,
                  delivery,
                  targetPointBudget: desiredPointBudget,
                  maxTextureSize,
              }) ?? selectedVariant
            : selectedVariant;

    if (!selectedVariant) {
        const fallbackSource = readManifestUrl(manifest.source) || readManifestUrl(manifest.url) || readManifestUrl(manifest.viewer_source) || readManifestUrl(manifest.splat_source);
        if (!fallbackSource || !isPlyLikeVariantSource(fallbackSource)) {
            throw new Error(`Environment manifest ${manifestUrl} did not expose a browser-safe PLY asset.`);
        }

        return {
            source: resolveManifestRelativeUrl(manifestUrl, fallbackSource),
            manifestUrl,
            variant: null,
            staged: false,
            streaming: false,
            refinePages: [],
            upgradeSource: null,
            upgradeVariant: null,
        };
    }

    const safePages = pages
        .filter(
            (page) =>
                isPlyLikeVariantSource(page.source) &&
                page.source !== selectedVariant.source &&
                page.source !== initialVariant?.source,
        )
        .sort((left, right) => {
            const leftPriority = left.priority ?? Number.POSITIVE_INFINITY;
            const rightPriority = right.priority ?? Number.POSITIVE_INFINITY;
            if (leftPriority !== rightPriority) {
                return leftPriority - rightPriority;
            }

            const leftIndex = left.pageIndex ?? Number.POSITIVE_INFINITY;
            const rightIndex = right.pageIndex ?? Number.POSITIVE_INFINITY;
            if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
            }

            return left.id.localeCompare(right.id);
        })
        .map((page) => ({
            ...page,
            source: resolveManifestRelativeUrl(manifestUrl, page.source),
        }));
    const stagedUpgrade = Boolean(
        initialVariant &&
            selectedVariant &&
            initialVariant.source !== selectedVariant.source &&
            hasMeaningfulStagedUpgrade(initialVariant, selectedVariant),
    );
    const stagedStreaming = safePages.length > 0;
    const selectedSummary = formatVariantSummary(selectedVariant);
    const initialSummary = formatVariantSummary(initialVariant ?? selectedVariant);

    onProgress?.(
        stagedStreaming
            ? `${initialSummary} selected for fast first light. Progressive page refinement is available after the first stable frame.`
            : stagedUpgrade
            ? `${initialSummary} selected for fast first light. ${selectedSummary} is eligible to refine later if the browser keeps enough headroom.`
            : `${selectedSummary} selected from manifest. Loading environment splat...`,
    );

    return {
        source: resolveManifestRelativeUrl(manifestUrl, (initialVariant ?? selectedVariant).source),
        manifestUrl,
        variant: initialVariant ?? selectedVariant,
        staged: stagedStreaming || stagedUpgrade,
        streaming: stagedStreaming,
        refinePages: safePages,
        upgradeSource: stagedStreaming ? null : stagedUpgrade ? resolveManifestRelativeUrl(manifestUrl, selectedVariant.source) : null,
        upgradeVariant: stagedStreaming ? null : stagedUpgrade ? selectedVariant : null,
    };
}
