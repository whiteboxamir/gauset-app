import fs from "node:fs";
import path from "node:path";

import { ensureSceneDeliveryBundle, readPlyLayoutSummary } from "./sharp_gaussian_delivery_utils.mjs";

const FIXTURE_SCHEMA_VERSION = 2;
const DEFAULT_SCENE_ID = process.env.GAUSET_BENCHMARK_SCENE_ID || "scene_benchmark_5m";
const DEFAULT_POINT_COUNT = Number(process.env.GAUSET_BENCHMARK_POINT_COUNT || "5000000");
const GRID_WIDTH = 500;
const GRID_HEIGHT = 200;
const GRID_DEPTH = 50;

function assertExactPointGrid(pointCount) {
    const capacity = GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH;
    if (pointCount !== capacity) {
        throw new Error(`The benchmark fixture generator is locked to ${capacity} points, received ${pointCount}.`);
    }
}

function sigmoidInverse(alpha) {
    const clamped = Math.min(0.995, Math.max(0.005, alpha));
    return Math.log(clamped / (1 - clamped));
}

function isRichBenchmarkLayout(headerText) {
    return (
        headerText.includes("property uchar red") &&
        headerText.includes("property uchar green") &&
        headerText.includes("property uchar blue") &&
        headerText.includes("property float opacity") &&
        headerText.includes("property float scale_0") &&
        headerText.includes("property float rot_3")
    );
}

function decodeExistingLayout(plyPath) {
    if (!fs.existsSync(plyPath)) {
        return null;
    }

    try {
        const layout = readPlyLayoutSummary(plyPath);
        return {
            pointCount: layout.vertexCount,
            richLayout: isRichBenchmarkLayout(layout.headerText),
            stride: layout.stride,
        };
    } catch {
        return null;
    }
}

function writeRichBenchmarkFixturePly(plyPath, pointCount) {
    const header = Buffer.from(
        [
            "ply",
            "format binary_little_endian 1.0",
            `element vertex ${pointCount}`,
            "property float x",
            "property float y",
            "property float z",
            "property uchar red",
            "property uchar green",
            "property uchar blue",
            "property float opacity",
            "property float scale_0",
            "property float scale_1",
            "property float scale_2",
            "property float rot_0",
            "property float rot_1",
            "property float rot_2",
            "property float rot_3",
            "end_header",
            "",
        ].join("\n"),
        "utf8",
    );

    const fd = fs.openSync(plyPath, "w");
    try {
        fs.writeSync(fd, header);

        const stride = 47;
        const chunkSize = 120_000;
        const buffer = Buffer.allocUnsafe(chunkSize * stride);
        const twoPi = Math.PI * 2;

        for (let start = 0; start < pointCount; start += chunkSize) {
            const count = Math.min(chunkSize, pointCount - start);

            for (let index = 0; index < count; index += 1) {
                const globalIndex = start + index;
                const xIndex = globalIndex % GRID_WIDTH;
                const yIndex = Math.floor(globalIndex / GRID_WIDTH) % GRID_HEIGHT;
                const zIndex = Math.floor(globalIndex / (GRID_WIDTH * GRID_HEIGHT)) % GRID_DEPTH;
                const offset = index * stride;

                const nx = xIndex / (GRID_WIDTH - 1);
                const ny = yIndex / (GRID_HEIGHT - 1);
                const nz = zIndex / (GRID_DEPTH - 1);
                const ribbonPhase = nx * twoPi * 4.5 + nz * 2.1;
                const liftPhase = ny * twoPi * 2.6 + nx * 1.1;
                const swirl = Math.sin(ribbonPhase) * 0.085 + Math.cos(liftPhase) * 0.03;
                const terrace = ((zIndex % 5) - 2) * 0.014;

                const x = (xIndex - GRID_WIDTH / 2) * 0.018 + Math.sin(ny * twoPi * 1.4) * 0.02;
                const y = (yIndex - GRID_HEIGHT / 2) * 0.02 + swirl;
                const z = (zIndex - GRID_DEPTH / 2) * 0.058 + terrace + Math.cos(nx * twoPi * 3.2) * 0.04;

                const ribbonBlend = 0.5 + 0.5 * Math.sin(ribbonPhase);
                const liftBlend = 0.5 + 0.5 * Math.cos(liftPhase);
                const red = Math.max(0, Math.min(255, Math.round(70 + ribbonBlend * 160 + nz * 20)));
                const green = Math.max(0, Math.min(255, Math.round(48 + liftBlend * 170 + (1 - nx) * 18)));
                const blue = Math.max(0, Math.min(255, Math.round(90 + (1 - ribbonBlend) * 110 + (1 - ny) * 34)));
                const alpha = 0.74 + ribbonBlend * 0.16 + liftBlend * 0.06;
                const opacity = sigmoidInverse(alpha);
                const scaleBase = 0.0075 + nz * 0.008 + ribbonBlend * 0.0045;
                const scale0 = Math.log(scaleBase * (0.88 + liftBlend * 0.28));
                const scale1 = Math.log(scaleBase * (0.92 + ribbonBlend * 0.26));
                const scale2 = Math.log(scaleBase * (1.14 + (1 - liftBlend) * 0.32));
                const halfAngle = (nx * 0.6 - 0.3) * 0.5;
                const rot0 = 0;
                const rot1 = Math.sin(halfAngle) * 0.08;
                const rot2 = 0;
                const rot3 = Math.cos(halfAngle);

                buffer.writeFloatLE(x, offset + 0);
                buffer.writeFloatLE(y, offset + 4);
                buffer.writeFloatLE(z, offset + 8);
                buffer.writeUInt8(red, offset + 12);
                buffer.writeUInt8(green, offset + 13);
                buffer.writeUInt8(blue, offset + 14);
                buffer.writeFloatLE(opacity, offset + 15);
                buffer.writeFloatLE(scale0, offset + 19);
                buffer.writeFloatLE(scale1, offset + 23);
                buffer.writeFloatLE(scale2, offset + 27);
                buffer.writeFloatLE(rot0, offset + 31);
                buffer.writeFloatLE(rot1, offset + 35);
                buffer.writeFloatLE(rot2, offset + 39);
                buffer.writeFloatLE(rot3, offset + 43);
            }

            fs.writeSync(fd, buffer, 0, count * stride);
        }
    } finally {
        fs.closeSync(fd);
    }
}

function buildMetadata(sceneId, pointCount) {
    return {
        lane: "reconstruction",
        truth_label: "Benchmark Fixture",
        quality_tier: "benchmark_5m_fixture_rich",
        point_count: pointCount,
        benchmark_status: "fixture_only",
        rendering: {
            viewer_renderer: "sharp_gaussian_direct",
            source_format: "sharp_ply_benchmark_fixture_rich",
            color_encoding: "albedo_linear",
            has_explicit_vertex_colors: true,
        },
        delivery: {
            label: "5M Benchmark Fixture",
            summary: "Deterministic 5M-point sharp Gaussian benchmark asset with staged bootstrap/full delivery for local renderer certification.",
            render_targets: {
                preferred_point_budget: pointCount,
            },
        },
        benchmark: {
            suite_id: "real_space_world_class_v1",
            scene_id: sceneId,
            fixture: true,
            fixture_schema_version: FIXTURE_SCHEMA_VERSION,
        },
    };
}

export function ensureBenchmarkFixture({
    sceneId = DEFAULT_SCENE_ID,
    pointCount = DEFAULT_POINT_COUNT,
} = {}) {
    assertExactPointGrid(pointCount);

    const projectRoot = process.cwd();
    const environmentDir = path.resolve(projectRoot, "scenes", sceneId, "environment");
    const plyPath = path.join(environmentDir, "splats.ply");
    const metadataPath = path.join(environmentDir, "metadata.json");
    const camerasPath = path.join(environmentDir, "cameras.json");
    const benchmarkReportPath = path.join(environmentDir, "benchmark-report.json");
    const captureScorecardPath = path.join(environmentDir, "capture-scorecard.json");
    const holdoutReportPath = path.join(environmentDir, "holdout-report.json");

    fs.mkdirSync(environmentDir, { recursive: true });

    const existingLayout = decodeExistingLayout(plyPath);
    if (!existingLayout || existingLayout.pointCount !== pointCount || !existingLayout.richLayout) {
        writeRichBenchmarkFixturePly(plyPath, pointCount);
    }

    const metadata = buildMetadata(sceneId, pointCount);
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    fs.writeFileSync(camerasPath, "[]\n");
    fs.writeFileSync(
        benchmarkReportPath,
        `${JSON.stringify(
            {
                suite_id: "real_space_world_class_v1",
                scene_id: sceneId,
                status: "fixture_ready",
                point_count: pointCount,
                fixture_schema_version: FIXTURE_SCHEMA_VERSION,
            },
            null,
            2,
        )}\n`,
    );
    fs.writeFileSync(
        captureScorecardPath,
        `${JSON.stringify(
            {
                status: "fixture_ready",
                fixture: true,
                point_count: pointCount,
                fixture_schema_version: FIXTURE_SCHEMA_VERSION,
            },
            null,
            2,
        )}\n`,
    );
    fs.writeFileSync(
        holdoutReportPath,
        `${JSON.stringify(
            {
                status: "fixture_ready",
                fixture: true,
                point_count: pointCount,
                fixture_schema_version: FIXTURE_SCHEMA_VERSION,
            },
            null,
            2,
        )}\n`,
    );

    const deliveryBundle = ensureSceneDeliveryBundle({
        sceneId,
        environmentDir,
        sceneLabel: "5M Benchmark Fixture",
    });
    const mergedMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

    return {
        sceneId,
        pointCount,
        environmentDir,
        plyPath,
        metadataPath,
        urls: {
            splats: `/storage/scenes/${sceneId}/environment/splats.ply`,
            bootstrap: deliveryBundle.bootstrapUrl,
            manifest: deliveryBundle.manifestUrl,
            metadata: `/storage/scenes/${sceneId}/environment/metadata.json`,
            cameras: `/storage/scenes/${sceneId}/environment/cameras.json`,
            benchmark_report: `/storage/scenes/${sceneId}/environment/benchmark-report.json`,
            capture_scorecard: `/storage/scenes/${sceneId}/environment/capture-scorecard.json`,
            holdout_report: `/storage/scenes/${sceneId}/environment/holdout-report.json`,
        },
        metadata: mergedMetadata,
        delivery: deliveryBundle,
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const fixture = ensureBenchmarkFixture();
    console.log(JSON.stringify(fixture, null, 2));
}
