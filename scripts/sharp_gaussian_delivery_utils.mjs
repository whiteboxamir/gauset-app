import fs from "node:fs";
import path from "node:path";

const DELIVERY_SCHEMA_VERSION = 2;
const TARGET_POINTS_PER_CHUNK = 16_384;
const MAX_CHUNK_OCTREE_LEVEL = 6;
const DEFAULT_BOOTSTRAP_POINT_CAP = 640_000;
const DEFAULT_BOOTSTRAP_POINT_FLOOR = 180_000;
const DEFAULT_BOOTSTRAP_RATIO = 0.26;
const TARGET_POINTS_PER_PAGE = 220_000;

const PROPERTY_SIZES = {
    char: 1,
    uchar: 1,
    int8: 1,
    uint8: 1,
    short: 2,
    ushort: 2,
    int16: 2,
    uint16: 2,
    int: 4,
    uint: 4,
    int32: 4,
    uint32: 4,
    float: 4,
    float32: 4,
    double: 8,
    float64: 8,
};

function sanitizePositiveInteger(value, fallback) {
    const normalized = Number.isFinite(value) ? Math.floor(value) : NaN;
    return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function readHeader(buffer) {
    let index = 0;
    let line = "";
    let sawEndHeader = false;

    while (index < buffer.length) {
        const char = String.fromCharCode(buffer[index]);
        index += 1;

        if (char !== "\n" && char !== "\r") {
            line += char;
            continue;
        }

        if (line === "end_header") {
            sawEndHeader = true;
            if (char === "\r" && buffer[index] === 10) {
                index += 1;
            }
            break;
        }

        line = "";
    }

    if (!sawEndHeader) {
        throw new Error("PLY header did not contain end_header.");
    }

    return {
        headerText: buffer.subarray(0, index).toString("utf8"),
        headerLength: index,
    };
}

function parseHeaderElements(lines) {
    const elements = [];
    let currentElement = null;

    const flushElement = () => {
        if (currentElement) {
            elements.push(currentElement);
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const tokens = line.split(/\s+/);
        const lineType = tokens.shift();
        if (!lineType) {
            continue;
        }

        if (lineType === "element") {
            flushElement();
            currentElement = {
                name: tokens[0] ?? "",
                count: Number(tokens[1] ?? 0),
                properties: [],
                stride: 0,
            };
            continue;
        }

        if (lineType === "property" && currentElement) {
            if (tokens[0] === "list") {
                throw new Error("PLY list properties are not supported for staged delivery generation.");
            }

            const propertyType = tokens[0] ?? "";
            const propertyName = tokens[1] ?? "";
            const propertySize = PROPERTY_SIZES[propertyType];
            if (!propertySize) {
                throw new Error(`Unsupported PLY property type: ${propertyType}`);
            }

            currentElement.properties.push({
                name: propertyName,
                type: propertyType,
                offset: currentElement.stride,
                size: propertySize,
            });
            currentElement.stride += propertySize;
        }
    }

    flushElement();
    return elements;
}

function parseBinaryLittleEndianPly(buffer) {
    const { headerText, headerLength } = readHeader(buffer);
    const lines = headerText.split(/\r\n|\r|\n/);
    let format = "";

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        const tokens = line.split(/\s+/);
        if (tokens[0] === "format") {
            format = tokens[1] ?? "";
            break;
        }
    }

    if (format !== "binary_little_endian") {
        throw new Error(`Expected binary_little_endian PLY, received ${format || "unknown"}.`);
    }

    const elements = parseHeaderElements(lines);
    const vertexElementIndex = elements.findIndex((element) => element.name === "vertex");
    if (vertexElementIndex === -1) {
        throw new Error("PLY payload does not contain a vertex element.");
    }

    let vertexSectionOffset = headerLength;
    for (let elementIndex = 0; elementIndex < vertexElementIndex; elementIndex += 1) {
        const element = elements[elementIndex];
        vertexSectionOffset += element.count * element.stride;
    }

    const vertexElement = elements[vertexElementIndex];
    return {
        buffer,
        headerText,
        headerLength,
        elements,
        vertexElement,
        vertexSectionOffset,
    };
}

function findProperty(propertyMap, candidates) {
    for (const candidate of candidates) {
        const property = propertyMap.get(candidate);
        if (property) {
            return property;
        }
    }
    return null;
}

function makeScalarReader(dataView, byteOffset, propertyType) {
    switch (propertyType) {
        case "char":
        case "int8":
            return (vertexOffset) => dataView.getInt8(byteOffset + vertexOffset);
        case "uchar":
        case "uint8":
            return (vertexOffset) => dataView.getUint8(byteOffset + vertexOffset);
        case "short":
        case "int16":
            return (vertexOffset) => dataView.getInt16(byteOffset + vertexOffset, true);
        case "ushort":
        case "uint16":
            return (vertexOffset) => dataView.getUint16(byteOffset + vertexOffset, true);
        case "int":
        case "int32":
            return (vertexOffset) => dataView.getInt32(byteOffset + vertexOffset, true);
        case "uint":
        case "uint32":
            return (vertexOffset) => dataView.getUint32(byteOffset + vertexOffset, true);
        case "float":
        case "float32":
            return (vertexOffset) => dataView.getFloat32(byteOffset + vertexOffset, true);
        case "double":
        case "float64":
            return (vertexOffset) => dataView.getFloat64(byteOffset + vertexOffset, true);
        default:
            throw new Error(`Unsupported PLY property type: ${propertyType}`);
    }
}

function boundsCenter(bounds) {
    return [
        (bounds.minX + bounds.maxX) * 0.5,
        (bounds.minY + bounds.maxY) * 0.5,
        (bounds.minZ + bounds.maxZ) * 0.5,
    ];
}

function resolveChunkOctreeLevel(pointCount) {
    const targetChunkCount = Math.max(1, Math.ceil(pointCount / TARGET_POINTS_PER_CHUNK));
    let level = 0;
    let chunkCapacity = 1;

    while (level < MAX_CHUNK_OCTREE_LEVEL && chunkCapacity < targetChunkCount) {
        chunkCapacity *= 8;
        level += 1;
    }

    return level;
}

function computeCodeForPoint(x, y, z, bounds, level) {
    let minX = bounds.minX;
    let minY = bounds.minY;
    let minZ = bounds.minZ;
    let maxX = bounds.maxX;
    let maxY = bounds.maxY;
    let maxZ = bounds.maxZ;
    let code = 0;

    for (let cursor = 0; cursor < level; cursor += 1) {
        const centerX = (minX + maxX) * 0.5;
        const centerY = (minY + maxY) * 0.5;
        const centerZ = (minZ + maxZ) * 0.5;
        let octant = 0;

        if (x >= centerX) {
            octant |= 1;
            minX = centerX;
        } else {
            maxX = centerX;
        }

        if (y >= centerY) {
            octant |= 2;
            minY = centerY;
        } else {
            maxY = centerY;
        }

        if (z >= centerZ) {
            octant |= 4;
            minZ = centerZ;
        } else {
            maxZ = centerZ;
        }

        code = (code << 3) | octant;
    }

    return code;
}

function rewriteVertexCountInHeader(headerText, nextVertexCount) {
    const replaced = headerText.replace(/(^|\r?\n)element vertex \d+(\r?\n)/, `$1element vertex ${nextVertexCount}$2`);
    if (replaced === headerText) {
        throw new Error("Unable to rewrite PLY vertex count in header.");
    }
    return replaced;
}

function formatCompactCount(value) {
    return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function buildStorageUrl(sceneId, filename) {
    return `/storage/scenes/${sceneId}/environment/${filename}`;
}

function resolveBootstrapPointCount(vertexCount, explicitBootstrapPointCount) {
    if (Number.isFinite(explicitBootstrapPointCount) && explicitBootstrapPointCount > 0) {
        return Math.min(vertexCount, Math.max(1, Math.round(explicitBootstrapPointCount)));
    }

    return Math.min(
        vertexCount,
        Math.max(
            DEFAULT_BOOTSTRAP_POINT_FLOOR,
            Math.min(DEFAULT_BOOTSTRAP_POINT_CAP, Math.round(vertexCount * DEFAULT_BOOTSTRAP_RATIO)),
        ),
    );
}

function distributeChunkQuotas(chunkEntries, targetCount, totalVertexCount) {
    if (targetCount >= totalVertexCount) {
        return new Map(chunkEntries.map((entry) => [entry.code, entry.count]));
    }

    const quotas = new Map(chunkEntries.map((entry) => [entry.code, 0]));
    let remaining = targetCount;
    const allocateCoverageSeed = remaining >= chunkEntries.length;

    if (allocateCoverageSeed) {
        for (const entry of chunkEntries) {
            quotas.set(entry.code, 1);
        }
        remaining -= chunkEntries.length;
    }

    if (remaining <= 0) {
        return quotas;
    }

    const weightedEntries = chunkEntries.map((entry) => {
        const seededQuota = quotas.get(entry.code) ?? 0;
        const remainingCapacity = Math.max(0, entry.count - seededQuota);
        const ideal = remainingCapacity > 0 ? (entry.count / totalVertexCount) * remaining : 0;
        const floorQuota = Math.min(remainingCapacity, Math.floor(ideal));
        quotas.set(entry.code, seededQuota + floorQuota);
        return {
            ...entry,
            floorQuota,
            fractionalRemainder: Math.max(0, ideal - floorQuota),
        };
    });

    let allocated = 0;
    for (const entry of weightedEntries) {
        allocated += entry.floorQuota;
    }
    let leftovers = Math.max(0, remaining - allocated);
    weightedEntries.sort((left, right) => {
        if (left.fractionalRemainder !== right.fractionalRemainder) {
            return right.fractionalRemainder - left.fractionalRemainder;
        }
        if (left.count !== right.count) {
            return right.count - left.count;
        }
        return left.code - right.code;
    });

    for (let index = 0; index < weightedEntries.length && leftovers > 0; index += 1) {
        const entry = weightedEntries[index];
        const currentQuota = quotas.get(entry.code) ?? 0;
        if (currentQuota >= entry.count) {
            continue;
        }
        quotas.set(entry.code, currentQuota + 1);
        leftovers -= 1;
        if (index === weightedEntries.length - 1 && leftovers > 0) {
            index = -1;
        }
    }

    return quotas;
}

function buildSelectionIndices(chunkCodes, chunkCounts, chunkQuotas) {
    const selectedCount = Array.from(chunkQuotas.values()).reduce((sum, value) => sum + value, 0);
    const selectedIndices = new Uint32Array(selectedCount);
    const seenCounts = new Map();
    const emittedCounts = new Map();
    let writeOffset = 0;

    for (let vertexIndex = 0; vertexIndex < chunkCodes.length; vertexIndex += 1) {
        const code = chunkCodes[vertexIndex];
        const chunkCount = chunkCounts.get(code) ?? 0;
        const chunkQuota = chunkQuotas.get(code) ?? 0;
        if (chunkCount <= 0 || chunkQuota <= 0) {
            continue;
        }

        const seen = (seenCounts.get(code) ?? 0) + 1;
        const emitted = emittedCounts.get(code) ?? 0;
        seenCounts.set(code, seen);

        if (Math.floor((seen * chunkQuota) / chunkCount) > emitted) {
            selectedIndices[writeOffset] = vertexIndex;
            writeOffset += 1;
            emittedCounts.set(code, emitted + 1);
        }
    }

    return writeOffset === selectedIndices.length ? selectedIndices : selectedIndices.subarray(0, writeOffset);
}

function buildChunkPages(chunkEntries, bootstrapQuotas, targetPointsPerPage) {
    const pages = [];
    let currentPage = null;

    for (const entry of chunkEntries) {
        const bootstrapCount = bootstrapQuotas.get(entry.code) ?? 0;
        const remainingCount = Math.max(0, entry.count - bootstrapCount);
        if (remainingCount <= 0) {
            continue;
        }

        if (!currentPage || currentPage.pointCount >= targetPointsPerPage) {
            currentPage = {
                pageIndex: pages.length,
                id: `page-${pages.length + 1}`,
                label: `Detail page ${pages.length + 1}`,
                role: pages.length === 0 ? "hero" : pages.length <= 2 ? "supporting" : "tail",
                chunkCodes: [],
                pointCount: 0,
                chunkCount: 0,
                priority: pages.length + 1,
            };
            pages.push(currentPage);
        }

        currentPage.chunkCodes.push(entry.code);
        currentPage.pointCount += remainingCount;
        currentPage.chunkCount += 1;
    }

    return pages;
}

function buildPageSelectionIndices(chunkCodes, bootstrapMask, pageChunkCodeSet) {
    const selected = [];
    for (let vertexIndex = 0; vertexIndex < chunkCodes.length; vertexIndex += 1) {
        if (bootstrapMask[vertexIndex] === 1) {
            continue;
        }
        if (pageChunkCodeSet.has(chunkCodes[vertexIndex])) {
            selected.push(vertexIndex);
        }
    }
    return Uint32Array.from(selected);
}

function writeSelectionPly({
    parsed,
    sourceBuffer,
    sourcePath,
    outputPath,
    selectedIndices,
}) {
    const { vertexElement, vertexSectionOffset } = parsed;
    const header = Buffer.from(rewriteVertexCountInHeader(parsed.headerText, selectedIndices.length), "utf8");
    const vertexBytes = Buffer.allocUnsafe(selectedIndices.length * vertexElement.stride);
    let writeOffset = 0;
    for (let selectionIndex = 0; selectionIndex < selectedIndices.length; selectionIndex += 1) {
        const sourceVertexIndex = selectedIndices[selectionIndex];
        const sourceStart = vertexSectionOffset + sourceVertexIndex * vertexElement.stride;
        const sourceEnd = sourceStart + vertexElement.stride;
        sourceBuffer.copy(vertexBytes, writeOffset, sourceStart, sourceEnd);
        writeOffset += vertexElement.stride;
    }
    const trailingBytes = sourceBuffer.subarray(vertexSectionOffset + vertexElement.count * vertexElement.stride);
    fs.writeFileSync(outputPath, Buffer.concat([header, vertexBytes, trailingBytes]));
    return fs.statSync(outputPath);
}

function synthesizeManifest({
    sceneId,
    sceneLabel,
    sourceFilename,
    bootstrapFilename,
    manifestId,
    manifestUrl,
    summaryUrl,
    sourceBytes,
    bootstrapBytes,
    fullPointCount,
    bootstrapPointCount,
    pages,
    rootLevel,
    chunkCount,
    renderTargets,
}) {
    const variants = [
        {
            id: "bootstrap",
            label: "Fast first light",
            role: "bootstrap",
            url: `./${bootstrapFilename}`,
            codec: "ply",
            progressive: true,
            preferred: false,
            bytes: bootstrapBytes,
            point_count: bootstrapPointCount,
            chunk_source: "spatial_octree",
        },
        {
            id: "full",
            label: "Premium live",
            role: "full",
            url: `./${sourceFilename}`,
            codec: "ply",
            progressive: false,
            preferred: true,
            bytes: sourceBytes,
            point_count: fullPointCount,
            chunk_source: "spatial_octree",
        },
    ];

    const normalizedPages = pages.map((page) => ({
        id: page.id,
        label: page.label,
        role: page.role,
        url: `./${page.filename}`,
        codec: "ply",
        progressive: true,
        preferred: false,
        bytes: page.bytes,
        point_count: page.pointCount,
        page_index: page.pageIndex,
        chunk_count: page.chunkCount,
        priority: page.priority,
        focus_center: page.focusCenter,
        focus_radius: page.focusRadius,
        sticky: page.role === "hero",
        preload: page.role === "hero" || page.role === "supporting",
        eviction_priority: page.role === "tail" ? 3 : page.role === "supporting" ? 2 : 1,
    }));

    return {
        manifest_id: manifestId,
        manifest_first: true,
        bootstrap_variant: "bootstrap",
        full_variant: "full",
        page_count: normalizedPages.length,
        summary_url: `./${path.basename(summaryUrl)}`,
        source_format: "sharp_ply_chunk_bootstrap",
        delivery: {
            label: `${sceneLabel} staged delivery`,
            summary: `${formatCompactCount(bootstrapPointCount)} bootstrap splats refine into ${formatCompactCount(fullPointCount)} full splats without swapping renderers.`,
            manifest_url: manifestUrl,
            manifest_id: manifestId,
            manifest_first: true,
            bootstrap_variant: "bootstrap",
            full_variant: "full",
            runtime_variants: variants,
            pages: normalizedPages,
            chunking: {
                mode: "spatial_octree",
                root_level: rootLevel,
                target_points_per_chunk: TARGET_POINTS_PER_CHUNK,
                chunk_count: chunkCount,
                page_count: normalizedPages.length,
                summary_url: `./${path.basename(summaryUrl)}`,
            },
            render_targets: renderTargets,
        },
        runtime_variants: variants,
        variants,
        pages: normalizedPages,
    };
}

function mergeDeliveryIntoMetadata({
    metadata,
    manifestUrl,
    manifestId,
    variants,
    pages = [],
    sceneLabel,
    fullPointCount,
    bootstrapPointCount,
    chunkCount,
    rootLevel,
}) {
    const nextMetadata = metadata && typeof metadata === "object" ? { ...metadata } : {};
    const nextRendering = nextMetadata.rendering && typeof nextMetadata.rendering === "object" ? { ...nextMetadata.rendering } : {};
    const nextDelivery = nextMetadata.delivery && typeof nextMetadata.delivery === "object" ? { ...nextMetadata.delivery } : {};
    const nextRenderTargets =
        nextDelivery.render_targets && typeof nextDelivery.render_targets === "object"
            ? { ...nextDelivery.render_targets }
            : {};

    nextRenderTargets.preferred_point_budget = fullPointCount;
    nextRenderTargets.bootstrap_point_budget = bootstrapPointCount;

    nextRendering.manifest_url = manifestUrl;
    nextRendering.manifest_id = manifestId;
    nextRendering.manifest_first = true;
    nextRendering.runtime_variant = "full";
    nextRendering.source_format = nextRendering.source_format || "sharp_ply";
    nextRendering.runtime_variants = variants;

    nextDelivery.label = nextDelivery.label || `${sceneLabel} staged delivery`;
    nextDelivery.summary =
        nextDelivery.summary ||
        `${formatCompactCount(bootstrapPointCount)} bootstrap splats refine into ${formatCompactCount(fullPointCount)} full splats.`;
    nextDelivery.manifest_url = manifestUrl;
    nextDelivery.manifest_id = manifestId;
    nextDelivery.manifest_first = true;
    nextDelivery.runtime_variant = "full";
    nextDelivery.runtime_variants = variants;
    nextDelivery.pages = pages;
    nextDelivery.render_targets = nextRenderTargets;
    nextDelivery.chunking = {
        mode: "spatial_octree",
        root_level: rootLevel,
        target_points_per_chunk: TARGET_POINTS_PER_CHUNK,
        chunk_count: chunkCount,
        page_count: Array.isArray(variants) ? Math.max(0, variants.filter((variant) => variant?.role === "page").length) : undefined,
    };

    nextMetadata.manifest_url = manifestUrl;
    nextMetadata.manifest_id = manifestId;
    nextMetadata.manifest_first = true;
    nextMetadata.runtime_variant = "full";
    nextMetadata.runtime_variants = variants;
    nextMetadata.delivery_pages = pages;
    nextMetadata.rendering = nextRendering;
    nextMetadata.delivery = nextDelivery;
    nextMetadata.splat_manifest = {
        manifest_url: manifestUrl,
        manifest_id: manifestId,
        manifest_first: true,
        runtime_variants: variants,
        pages,
    };

    return nextMetadata;
}

export function readPlyLayoutSummary(plyPath) {
    const buffer = fs.readFileSync(plyPath);
    const { headerText, vertexElement } = parseBinaryLittleEndianPly(buffer);
    return {
        headerText,
        vertexCount: vertexElement.count,
        stride: vertexElement.stride,
    };
}

export function ensureSceneDeliveryBundle({
    sceneId,
    environmentDir,
    sourceFilename = "splats.ply",
    bootstrapFilename = "bootstrap.ply",
    manifestFilename = "delivery-manifest.json",
    summaryFilename = "delivery-summary.json",
    metadataFilename = "metadata.json",
    pageFilenamePrefix = "page",
    sceneLabel = "Scene",
    bootstrapPointCount = null,
} = {}) {
    const resolvedEnvironmentDir = path.resolve(environmentDir);
    const sourcePath = path.join(resolvedEnvironmentDir, sourceFilename);
    const bootstrapPath = path.join(resolvedEnvironmentDir, bootstrapFilename);
    const manifestPath = path.join(resolvedEnvironmentDir, manifestFilename);
    const summaryPath = path.join(resolvedEnvironmentDir, summaryFilename);
    const metadataPath = path.join(resolvedEnvironmentDir, metadataFilename);
    const sourceStats = fs.statSync(sourcePath);
    const layout = readPlyLayoutSummary(sourcePath);
    const resolvedBootstrapPointCount = resolveBootstrapPointCount(layout.vertexCount, bootstrapPointCount);
    const manifestId = `sharp-delivery-${sceneId}`;
    const manifestUrl = buildStorageUrl(sceneId, manifestFilename);
    const summaryUrl = buildStorageUrl(sceneId, summaryFilename);

    if (fs.existsSync(summaryPath) && fs.existsSync(manifestPath) && fs.existsSync(bootstrapPath)) {
        try {
            const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
            if (
                summary?.schema_version === DELIVERY_SCHEMA_VERSION &&
                summary?.source_filename === sourceFilename &&
                summary?.source_size_bytes === sourceStats.size &&
                summary?.source_mtime_ms === sourceStats.mtimeMs &&
                summary?.full_point_count === layout.vertexCount &&
                summary?.bootstrap_point_count === resolvedBootstrapPointCount
            ) {
                const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
                const variants = Array.isArray(summary?.runtime_variants) ? summary.runtime_variants : [];
                const mergedMetadata = mergeDeliveryIntoMetadata({
                    metadata,
                    manifestUrl,
                    manifestId,
                    variants,
                    pages: Array.isArray(summary?.pages) ? summary.pages : [],
                    sceneLabel,
                    fullPointCount: layout.vertexCount,
                    bootstrapPointCount: resolvedBootstrapPointCount,
                    chunkCount: sanitizePositiveInteger(summary?.chunk_count, 1),
                    rootLevel: Math.max(0, Number(summary?.root_level ?? 0)),
                });
                fs.writeFileSync(metadataPath, `${JSON.stringify(mergedMetadata, null, 2)}\n`);

                return {
                    manifestPath,
                    summaryPath,
                    manifestUrl,
                    manifestId,
                    bootstrapPath,
                    bootstrapUrl: buildStorageUrl(sceneId, bootstrapFilename),
                    fullUrl: buildStorageUrl(sceneId, sourceFilename),
                    runtimeVariants: variants,
                    chunkCount: sanitizePositiveInteger(summary?.chunk_count, 1),
                    rootLevel: Math.max(0, Number(summary?.root_level ?? 0)),
                    fullPointCount: layout.vertexCount,
                    bootstrapPointCount: resolvedBootstrapPointCount,
                };
            }
        } catch {
            // Ignore cache misses and rebuild.
        }
    }

    const buffer = fs.readFileSync(sourcePath);
    const parsed = parseBinaryLittleEndianPly(buffer);
    const { vertexElement, vertexSectionOffset } = parsed;
    const vertexCount = vertexElement.count;
    const propertyMap = new Map(vertexElement.properties.map((property) => [property.name, property]));
    const xProperty = findProperty(propertyMap, ["x", "px", "posx"]);
    const yProperty = findProperty(propertyMap, ["y", "py", "posy"]);
    const zProperty = findProperty(propertyMap, ["z", "pz", "posz"]);

    if (!xProperty || !yProperty || !zProperty) {
        throw new Error(`PLY ${sourcePath} is missing x/y/z vertex properties.`);
    }

    const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const readX = makeScalarReader(dataView, vertexSectionOffset + xProperty.offset, xProperty.type);
    const readY = makeScalarReader(dataView, vertexSectionOffset + yProperty.offset, yProperty.type);
    const readZ = makeScalarReader(dataView, vertexSectionOffset + zProperty.offset, zProperty.type);

    const positions = new Float32Array(vertexCount * 3);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        const vertexOffset = vertexIndex * vertexElement.stride;
        const positionOffset = vertexIndex * 3;
        const x = Number(readX(vertexOffset));
        const y = Number(readY(vertexOffset));
        const z = Number(readZ(vertexOffset));
        positions[positionOffset + 0] = x;
        positions[positionOffset + 1] = y;
        positions[positionOffset + 2] = z;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
    }

    const bounds = { minX, minY, minZ, maxX, maxY, maxZ };
    const rootLevel = resolveChunkOctreeLevel(vertexCount);
    const chunkCodes = new Uint32Array(vertexCount);
    const chunkCounts = new Map();

    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        const positionOffset = vertexIndex * 3;
        const code = computeCodeForPoint(
            positions[positionOffset + 0],
            positions[positionOffset + 1],
            positions[positionOffset + 2],
            bounds,
            rootLevel,
        );
        chunkCodes[vertexIndex] = code;
        chunkCounts.set(code, (chunkCounts.get(code) ?? 0) + 1);
    }

    const chunkEntries = Array.from(chunkCounts.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((left, right) => left.code - right.code);
    const quotas = distributeChunkQuotas(chunkEntries, resolvedBootstrapPointCount, vertexCount);
    const selectedIndices = buildSelectionIndices(chunkCodes, chunkCounts, quotas);
    const bootstrapMask = new Uint8Array(vertexCount);
    for (let selectionIndex = 0; selectionIndex < selectedIndices.length; selectionIndex += 1) {
        bootstrapMask[selectedIndices[selectionIndex]] = 1;
    }
    const bootstrapStats = writeSelectionPly({
        parsed,
        sourceBuffer: buffer,
        sourcePath,
        outputPath: bootstrapPath,
        selectedIndices,
    });
    const chunkPages = buildChunkPages(chunkEntries, quotas, TARGET_POINTS_PER_PAGE);
    const pageOutputs = chunkPages.map((page) => {
        const pageFilename = `${pageFilenamePrefix}-${String(page.pageIndex + 1).padStart(2, "0")}.ply`;
        const pagePath = path.join(resolvedEnvironmentDir, pageFilename);
        const pageSelectionIndices = buildPageSelectionIndices(chunkCodes, bootstrapMask, new Set(page.chunkCodes));
        let centerX = 0;
        let centerY = 0;
        let centerZ = 0;
        let minPageX = Number.POSITIVE_INFINITY;
        let minPageY = Number.POSITIVE_INFINITY;
        let minPageZ = Number.POSITIVE_INFINITY;
        let maxPageX = Number.NEGATIVE_INFINITY;
        let maxPageY = Number.NEGATIVE_INFINITY;
        let maxPageZ = Number.NEGATIVE_INFINITY;
        for (let selectionIndex = 0; selectionIndex < pageSelectionIndices.length; selectionIndex += 1) {
            const vertexIndex = pageSelectionIndices[selectionIndex];
            const positionOffset = vertexIndex * 3;
            const x = positions[positionOffset + 0];
            const y = positions[positionOffset + 1];
            const z = positions[positionOffset + 2];
            centerX += x;
            centerY += y;
            centerZ += z;
            minPageX = Math.min(minPageX, x);
            minPageY = Math.min(minPageY, y);
            minPageZ = Math.min(minPageZ, z);
            maxPageX = Math.max(maxPageX, x);
            maxPageY = Math.max(maxPageY, y);
            maxPageZ = Math.max(maxPageZ, z);
        }
        const pagePointCount = pageSelectionIndices.length;
        const focusCenter =
            pagePointCount > 0
                ? [centerX / pagePointCount, centerY / pagePointCount, centerZ / pagePointCount]
                : [0, 0, 0];
        const focusRadius =
            pagePointCount > 0
                ? Math.max(
                      0.1,
                      Math.hypot(maxPageX - minPageX, maxPageY - minPageY, maxPageZ - minPageZ) * 0.5,
                  )
                : 0.1;
        const pageStats = writeSelectionPly({
            parsed,
            sourceBuffer: buffer,
            sourcePath,
            outputPath: pagePath,
            selectedIndices: pageSelectionIndices,
        });
        return {
            ...page,
            filename: pageFilename,
            path: pagePath,
            bytes: pageStats.size,
            pointCount: pagePointCount,
            focusCenter,
            focusRadius,
            sticky: page.role === "hero",
            preload: page.role === "hero" || page.role === "supporting",
            evictionPriority: page.role === "tail" ? 3 : page.role === "supporting" ? 2 : 1,
        };
    });
    const renderTargets = {
        preferred_point_budget: vertexCount,
        bootstrap_point_budget: selectedIndices.length,
    };
    const manifest = synthesizeManifest({
        sceneId,
        sceneLabel,
        sourceFilename,
        bootstrapFilename,
        manifestId,
        manifestUrl,
        summaryUrl,
        sourceBytes: sourceStats.size,
        bootstrapBytes: bootstrapStats.size,
        fullPointCount: vertexCount,
        bootstrapPointCount: selectedIndices.length,
        pages: pageOutputs,
        rootLevel,
        chunkCount: chunkEntries.length,
        renderTargets,
    });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const summary = {
        schema_version: DELIVERY_SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        scene_id: sceneId,
        scene_label: sceneLabel,
        source_filename: sourceFilename,
        source_size_bytes: sourceStats.size,
        source_mtime_ms: sourceStats.mtimeMs,
        bootstrap_filename: bootstrapFilename,
        bootstrap_size_bytes: bootstrapStats.size,
        manifest_filename: manifestFilename,
        manifest_id: manifestId,
        full_point_count: vertexCount,
        bootstrap_point_count: selectedIndices.length,
        root_level: rootLevel,
        chunk_count: chunkEntries.length,
        page_count: pageOutputs.length,
        chunk_center: boundsCenter(bounds),
        chunk_bounds: bounds,
        runtime_variants: manifest.runtime_variants,
        pages: pageOutputs.map((page) => ({
            id: page.id,
            filename: page.filename,
            point_count: page.pointCount,
            bytes: page.bytes,
            priority: page.priority,
            chunk_count: page.chunkCount,
            focus_center: page.focusCenter,
            focus_radius: page.focusRadius,
            sticky: page.sticky,
            preload: page.preload,
            eviction_priority: page.evictionPriority,
        })),
    };
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

    const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
    const mergedMetadata = mergeDeliveryIntoMetadata({
        metadata,
        manifestUrl,
        manifestId,
        variants: manifest.runtime_variants,
        pages: manifest.pages,
        sceneLabel,
        fullPointCount: vertexCount,
        bootstrapPointCount: selectedIndices.length,
        chunkCount: chunkEntries.length,
        rootLevel,
    });
    fs.writeFileSync(metadataPath, `${JSON.stringify(mergedMetadata, null, 2)}\n`);

    return {
        manifestPath,
        summaryPath,
        manifestUrl,
        manifestId,
        bootstrapPath,
        bootstrapUrl: buildStorageUrl(sceneId, bootstrapFilename),
        fullUrl: buildStorageUrl(sceneId, sourceFilename),
        runtimeVariants: manifest.runtime_variants,
        chunkCount: chunkEntries.length,
        rootLevel,
        fullPointCount: vertexCount,
        bootstrapPointCount: selectedIndices.length,
    };
}
