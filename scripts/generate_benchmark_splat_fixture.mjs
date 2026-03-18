import fs from "node:fs";
import path from "node:path";

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

function decodeExistingPointCount(plyPath) {
    if (!fs.existsSync(plyPath)) {
        return null;
    }

    const fd = fs.openSync(plyPath, "r");
    try {
        const probe = Buffer.alloc(512);
        const bytesRead = fs.readSync(fd, probe, 0, probe.length, 0);
        const header = probe.subarray(0, bytesRead).toString("utf8");
        const match = header.match(/element vertex (\d+)/);
        return match ? Number(match[1]) : null;
    } finally {
        fs.closeSync(fd);
    }
}

function buildMetadata(sceneId, pointCount) {
    return {
        lane: "reconstruction",
        truth_label: "Benchmark Fixture",
        quality_tier: "benchmark_5m_fixture",
        point_count: pointCount,
        benchmark_status: "fixture_only",
        rendering: {
            viewer_renderer: "sharp_gaussian_direct",
            source_format: "sharp_ply_benchmark_fixture",
            color_encoding: "albedo_linear",
        },
        delivery: {
            label: "5M Benchmark Fixture",
            summary: "Deterministic 5M-point sharp Gaussian benchmark asset for local renderer certification.",
            render_targets: {
                preferred_point_budget: pointCount,
            },
        },
        benchmark: {
            suite_id: "real_space_world_class_v1",
            scene_id: sceneId,
            fixture: true,
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

    const existingPointCount = decodeExistingPointCount(plyPath);
    if (existingPointCount !== pointCount) {
        const header = Buffer.from(
            `ply\nformat binary_little_endian 1.0\nelement vertex ${pointCount}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`,
            "utf8",
        );

        const fd = fs.openSync(plyPath, "w");
        try {
            fs.writeSync(fd, header);

            const chunkSize = 250_000;
            const buffer = Buffer.allocUnsafe(chunkSize * 12);

            for (let start = 0; start < pointCount; start += chunkSize) {
                const count = Math.min(chunkSize, pointCount - start);
                for (let index = 0; index < count; index += 1) {
                    const globalIndex = start + index;
                    const xIndex = globalIndex % GRID_WIDTH;
                    const yIndex = Math.floor(globalIndex / GRID_WIDTH) % GRID_HEIGHT;
                    const zIndex = Math.floor(globalIndex / (GRID_WIDTH * GRID_HEIGHT)) % GRID_DEPTH;
                    const offset = index * 12;

                    const x = (xIndex - GRID_WIDTH / 2) * 0.02;
                    const y = (yIndex - GRID_HEIGHT / 2) * 0.02;
                    const z = zIndex * 0.04 + ((globalIndex % 7) - 3) * 0.0008;

                    buffer.writeFloatLE(x, offset);
                    buffer.writeFloatLE(y, offset + 4);
                    buffer.writeFloatLE(z, offset + 8);
                }

                fs.writeSync(fd, buffer, 0, count * 12);
            }
        } finally {
            fs.closeSync(fd);
        }
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
            },
            null,
            2,
        )}\n`,
    );

    return {
        sceneId,
        pointCount,
        environmentDir,
        plyPath,
        metadataPath,
        urls: {
            splats: `/storage/scenes/${sceneId}/environment/splats.ply`,
            metadata: `/storage/scenes/${sceneId}/environment/metadata.json`,
            cameras: `/storage/scenes/${sceneId}/environment/cameras.json`,
            benchmark_report: `/storage/scenes/${sceneId}/environment/benchmark-report.json`,
            capture_scorecard: `/storage/scenes/${sceneId}/environment/capture-scorecard.json`,
            holdout_report: `/storage/scenes/${sceneId}/environment/holdout-report.json`,
        },
        metadata,
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const fixture = ensureBenchmarkFixture();
    console.log(JSON.stringify(fixture, null, 2));
}
