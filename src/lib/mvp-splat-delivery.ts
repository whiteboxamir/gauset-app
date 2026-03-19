type UnknownRecord = Record<string, unknown>;

export interface NormalizedSplatDeliveryVariant {
    id: string;
    label: string;
    role: string | null;
    url: string | null;
    codec: string | null;
    progressive: boolean;
    preferred: boolean;
    fallback: boolean;
    bytes: number | null;
    pointCount: number | null;
    deliveryTier: "bootstrap" | "full" | "fallback" | "standard";
}

export interface NormalizedSplatDeliveryState {
    manifestUrl: string | null;
    manifestId: string | null;
    manifestFirst: boolean;
    runtimeVariant: string | null;
    runtimeCodecs: string[];
    runtimeVariants: NormalizedSplatDeliveryVariant[];
    preferredRuntimeVariant: NormalizedSplatDeliveryVariant | null;
    hasProgressiveVariants: boolean;
    hasCompressedVariants: boolean;
    hasBootstrapVariants: boolean;
    hasFullVariants: boolean;
    hasStagedRuntimePair: boolean;
    pageVariants: NormalizedSplatDeliveryVariant[];
    hasPageStreaming: boolean;
}

type EnvironmentLike = {
    urls?: UnknownRecord | null;
    metadata?: UnknownRecord | null;
};

function asRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown) {
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

function asNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function firstString(...values: unknown[]) {
    for (const value of values) {
        const normalized = asString(value);
        if (normalized) {
            return normalized;
        }
    }
    return "";
}

function readString(record: UnknownRecord | null, keys: string[]) {
    if (!record) {
        return "";
    }
    for (const key of keys) {
        const value = asString(record[key]);
        if (value) {
            return value;
        }
    }
    return "";
}

function readBoolean(record: UnknownRecord | null, keys: string[]) {
    if (!record) {
        return false;
    }
    return keys.some((key) => asBoolean(record[key]));
}

function readNumber(record: UnknownRecord | null, keys: string[]) {
    if (!record) {
        return null;
    }
    for (const key of keys) {
        const value = asNumber(record[key]);
        if (value !== null) {
            return value;
        }
    }
    return null;
}

function collectVariantInputs(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value.flatMap((item) => (item && typeof item === "object" && !Array.isArray(item) ? [item] : typeof item === "string" ? [item] : []));
    }

    const record = asRecord(value);
    if (!record) {
        return [];
    }

    const nestedCollections = [record.runtime_variants, record.variants, record.entries, record.items, record.children];
    for (const nested of nestedCollections) {
        if (Array.isArray(nested)) {
            return nested.filter((item) => item !== null && item !== undefined);
        }
        if (asRecord(nested)) {
            return Object.values(nested as UnknownRecord);
        }
    }

    const descriptorKeys = new Set([
        "id",
        "key",
        "name",
        "label",
        "title",
        "role",
        "kind",
        "type",
        "codec",
        "format",
        "encoding",
        "runtime_codec",
        "url",
        "href",
        "source",
        "asset_url",
        "viewer_url",
        "splat_url",
        "preferred",
        "default",
        "primary",
        "active",
        "selected",
        "progressive",
        "streaming",
        "chunked",
        "lod",
        "fallback",
        "backup",
        "bytes",
        "size",
        "size_bytes",
        "point_count",
        "pointCount",
        "points",
        "count",
    ]);

    const keys = Object.keys(record);
    const looksLikeSingleVariant =
        keys.some((key) => descriptorKeys.has(key)) &&
        !keys.some((key) => key === "runtime_variants" || key === "variants" || key === "entries" || key === "items" || key === "children");

    if (looksLikeSingleVariant) {
        return [record];
    }

    return Object.values(record);
}

function inferCodecFromUrl(url: string) {
    const normalized = url.toLowerCase();
    if (normalized.endsWith(".spz")) {
        return "spz";
    }
    if (normalized.endsWith(".sog")) {
        return "sog";
    }
    if (normalized.endsWith(".ply")) {
        return "ply";
    }
    if (normalized.endsWith(".glb")) {
        return "glb";
    }
    if (normalized.endsWith(".json")) {
        return "json";
    }
    return "";
}

function inferProgressiveCodec(codec: string, url: string) {
    const normalizedCodec = codec.toLowerCase();
    const normalizedUrl = url.toLowerCase();
    return (
        normalizedCodec.includes("spz") ||
        normalizedCodec.includes("sog") ||
        normalizedCodec.includes("compressed") ||
        normalizedCodec.includes("meshopt") ||
        normalizedCodec.includes("basis") ||
        normalizedCodec.includes("ktx2") ||
        normalizedUrl.endsWith(".spz") ||
        normalizedUrl.endsWith(".sog")
    );
}

function classifyVariantDeliveryTier({
    role,
    label,
    id,
}: {
    role?: string | null;
    label?: string | null;
    id?: string | null;
}): "bootstrap" | "full" | "fallback" | "standard" {
    const descriptor = `${role ?? ""} ${label ?? ""} ${id ?? ""}`.trim().toLowerCase();
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

function normalizeVariantEntry(value: unknown, fallbackId: string): NormalizedSplatDeliveryVariant | null {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const codec = inferCodecFromUrl(trimmed);
        return {
            id: trimmed,
            label: trimmed,
            role: null,
            url: trimmed,
            codec: codec || null,
            progressive: inferProgressiveCodec(codec, trimmed),
            preferred: false,
            fallback: false,
            bytes: null,
            pointCount: null,
            deliveryTier: "standard",
        };
    }

    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const url = firstString(
        record.url,
        record.href,
        record.source,
        record.asset_url,
        record.viewer_url,
        record.splat_url,
        record.manifest_url,
    );
    const codec = firstString(
        record.codec,
        record.format,
        record.encoding,
        record.runtime_codec,
        record.viewer_decode,
        record.mime_type,
        record.content_type,
    );
    const role = readString(record, ["role", "kind", "type", "usage"]) || null;
    const id = firstString(record.id, record.key, record.name, record.variant, role, codec, url) || fallbackId;
    const label = firstString(record.label, record.title, record.name, role, id) || id;
    const resolvedCodec = codec || inferCodecFromUrl(url);
    const pointCount = readNumber(record, ["point_count", "pointCount", "points", "count", "preferred_point_budget"]);
    const deliveryTier = classifyVariantDeliveryTier({ role, label, id });

    return {
        id,
        label,
        role,
        url: url || null,
        codec: resolvedCodec || null,
        progressive: readBoolean(record, ["progressive", "streaming", "chunked", "lod", "paged"]) || inferProgressiveCodec(resolvedCodec, url),
        preferred: readBoolean(record, ["preferred", "default", "primary", "active", "selected"]),
        fallback: readBoolean(record, ["fallback", "backup", "legacy"]),
        bytes: readNumber(record, ["bytes", "size", "size_bytes"]),
        pointCount,
        deliveryTier,
    };
}

function mergeVariants(...inputs: unknown[]) {
    const variants: NormalizedSplatDeliveryVariant[] = [];
    const runtimeCodecs = new Set<string>();

    inputs.forEach((input, inputIndex) => {
        collectVariantInputs(input).forEach((entry, entryIndex) => {
            const normalized = normalizeVariantEntry(entry, `variant-${inputIndex + 1}-${entryIndex + 1}`);
            if (!normalized) {
                return;
            }

            variants.push(normalized);
            if (normalized.codec) {
                runtimeCodecs.add(normalized.codec);
            }
        });
    });

    return { variants, runtimeCodecs };
}

export function normalizeSplatDeliveryState(environment: EnvironmentLike | null | undefined): NormalizedSplatDeliveryState {
    const urls = asRecord(environment?.urls);
    const metadata = asRecord(environment?.metadata);
    const rendering = asRecord(metadata?.rendering);
    const delivery = asRecord(metadata?.delivery);
    const manifest =
        asRecord(delivery?.manifest) ??
        asRecord(rendering?.manifest) ??
        asRecord(metadata?.manifest) ??
        asRecord(metadata?.splat_manifest);
    const directViewerUrl = firstString(urls?.viewer, rendering?.viewer_source);
    const directSplatUrl = firstString(urls?.splats, rendering?.splat_source);

    const manifestUrl = firstString(
        urls?.manifest,
        delivery?.manifest_url,
        delivery?.manifestUrl,
        rendering?.manifest_url,
        rendering?.manifestUrl,
        manifest?.manifest_url,
        manifest?.manifestUrl,
        metadata?.manifest_url,
        metadata?.manifestUrl,
        metadata?.splat_manifest_url,
        metadata?.splat_manifestUrl,
    );
    const manifestId = firstString(
        delivery?.manifest_id,
        delivery?.manifestId,
        rendering?.manifest_id,
        rendering?.manifestId,
        manifest?.manifest_id,
        manifest?.manifestId,
        metadata?.manifest_id,
        metadata?.manifestId,
    );
    const manifestFirst =
        readBoolean(delivery, ["manifest_first", "manifestFirst"]) ||
        readBoolean(rendering, ["manifest_first", "manifestFirst"]) ||
        readBoolean(manifest, ["manifest_first", "manifestFirst"]) ||
        Boolean(manifestUrl);
    const explicitRuntimeVariant = firstString(
        delivery?.runtime_variant,
        delivery?.runtimeVariant,
        rendering?.runtime_variant,
        rendering?.runtimeVariant,
        manifest?.runtime_variant,
        manifest?.runtimeVariant,
        metadata?.runtime_variant,
        metadata?.runtimeVariant,
    );

    const { variants, runtimeCodecs } = mergeVariants(
        delivery?.runtime_variants,
        delivery?.variants,
        rendering?.runtime_variants,
        rendering?.variants,
        manifest?.runtime_variants,
        manifest?.variants,
    );
    const { variants: pageVariants } = mergeVariants(
        delivery?.pages,
        delivery?.page_variants,
        rendering?.pages,
        rendering?.page_variants,
        manifest?.pages,
        manifest?.page_variants,
        metadata?.delivery_pages,
    );

    const directVariants = [
        directViewerUrl
            ? normalizeVariantEntry(
                  {
                      id: "viewer",
                      label: "viewer",
                      role: "viewer",
                      url: directViewerUrl,
                      codec: inferCodecFromUrl(directViewerUrl),
                      preferred: !manifestUrl,
                    },
                  "viewer",
              )
            : null,
        directSplatUrl
            ? normalizeVariantEntry(
                  {
                      id: "splat",
                      label: "splat",
                      role: "splat",
                      url: directSplatUrl,
                      codec: inferCodecFromUrl(directSplatUrl),
                      preferred: !manifestUrl,
                    },
                  "splat",
              )
            : null,
    ].filter((variant): variant is NormalizedSplatDeliveryVariant => Boolean(variant));

    const runtimeVariants = [...variants];
    for (const variant of directVariants) {
        if (!runtimeVariants.some((existing) => (variant.url && existing.url === variant.url) || existing.id === variant.id)) {
            runtimeVariants.push(variant);
            if (variant.codec) {
                runtimeCodecs.add(variant.codec);
            }
        }
    }

    const preferredRuntimeVariant =
        runtimeVariants.find((variant) => variant.preferred) ??
        runtimeVariants.find((variant) => variant.deliveryTier === "full") ??
        runtimeVariants.find((variant) => variant.role === "primary") ??
        runtimeVariants.find((variant) => variant.deliveryTier !== "fallback") ??
        runtimeVariants[0] ??
        null;
    if (preferredRuntimeVariant?.codec) {
        runtimeCodecs.add(preferredRuntimeVariant.codec);
    }

    const runtimeVariant =
        explicitRuntimeVariant ||
        preferredRuntimeVariant?.id ||
        preferredRuntimeVariant?.label ||
        null;
    const hasBootstrapVariants = runtimeVariants.some((variant) => variant.deliveryTier === "bootstrap");
    const hasFullVariants = runtimeVariants.some((variant) => variant.deliveryTier === "full");

    return {
        manifestUrl: manifestUrl || null,
        manifestId: manifestId || null,
        manifestFirst,
        runtimeVariant,
        runtimeCodecs: Array.from(runtimeCodecs),
        runtimeVariants,
        preferredRuntimeVariant,
        hasProgressiveVariants: runtimeVariants.some((variant) => variant.progressive),
        hasCompressedVariants: runtimeVariants.some((variant) => Boolean(variant.codec && inferProgressiveCodec(variant.codec, variant.url ?? ""))),
        hasBootstrapVariants,
        hasFullVariants,
        hasStagedRuntimePair: hasBootstrapVariants && hasFullVariants,
        pageVariants,
        hasPageStreaming: pageVariants.length > 0,
    };
}
