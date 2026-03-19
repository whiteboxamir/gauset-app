import fs from "node:fs";
import path from "node:path";

import { ensureSceneDeliveryBundle, readPlyLayoutSummary } from "./sharp_gaussian_delivery_utils.mjs";

const GOLD_FIXTURE_SCHEMA_VERSION = 1;

const GOLD_SCENE_PROFILES = [
    {
        sceneId: "scene_gold_cinematic_ribbons",
        label: "Cinematic Ribbons",
        truthLabel: "Synthetic Gold Scene Fixture",
        qualityTier: "synthetic_gold_scene_fixture",
        dimensions: [320, 192, 12],
        buildPoint({ xIndex, yIndex, zIndex, nx, ny, nz }) {
            const twoPi = Math.PI * 2;
            const arc = Math.sin(nx * twoPi * 3.4 + nz * 3.2) * 0.22;
            const counterArc = Math.cos(ny * twoPi * 2.4 - nx * 0.8) * 0.12;
            const x = (nx - 0.5) * 7.2 + Math.sin(ny * twoPi * 0.8) * 0.18;
            const y = (ny - 0.5) * 4.6 + arc * 0.5;
            const z = (nz - 0.5) * 2.2 + counterArc + Math.cos(nx * twoPi * 2.0) * 0.15;
            const ribbonBlend = 0.5 + 0.5 * Math.sin(nx * twoPi * 2.6 + ny * 1.1 + zIndex * 0.22);
            const liftBlend = 0.5 + 0.5 * Math.cos(ny * twoPi * 1.7 + xIndex * 0.012);
            return {
                x,
                y,
                z,
                red: 90 + ribbonBlend * 145,
                green: 54 + liftBlend * 162,
                blue: 120 + (1 - ribbonBlend) * 100,
                alpha: 0.76 + ribbonBlend * 0.14 + liftBlend * 0.05,
                scale0: 0.010 + nz * 0.006 + liftBlend * 0.002,
                scale1: 0.009 + ribbonBlend * 0.005,
                scale2: 0.014 + (1 - ribbonBlend) * 0.007,
                yaw: (nx - 0.5) * 0.38,
            };
        },
    },
    {
        sceneId: "scene_gold_luminous_atrium",
        label: "Luminous Atrium",
        truthLabel: "Synthetic Gold Scene Fixture",
        qualityTier: "synthetic_gold_scene_fixture",
        dimensions: [288, 192, 16],
        buildPoint({ xIndex, yIndex, zIndex, nx, ny, nz }) {
            const angle = nx * Math.PI * 2;
            const ring = 1.6 + ny * 2.4 + Math.sin(zIndex * 0.28) * 0.08;
            const spiral = nz * 3.6;
            const x = Math.cos(angle + spiral * 0.14) * ring;
            const y = (ny - 0.5) * 5.4 + Math.sin(angle * 2.0 + spiral * 0.4) * 0.18;
            const z = Math.sin(angle + spiral * 0.14) * ring + Math.cos(ny * Math.PI * 4) * 0.12;
            const skylight = 0.5 + 0.5 * Math.cos(angle * 2.0 - ny * 1.8);
            const floorGlow = 0.5 + 0.5 * Math.sin(spiral * 0.22 + xIndex * 0.02);
            return {
                x,
                y,
                z,
                red: 118 + skylight * 122,
                green: 92 + floorGlow * 118,
                blue: 138 + (1 - floorGlow) * 92,
                alpha: 0.78 + skylight * 0.12 + floorGlow * 0.04,
                scale0: 0.0105 + skylight * 0.004,
                scale1: 0.010 + floorGlow * 0.004,
                scale2: 0.0155 + nz * 0.005,
                yaw: angle * 0.12,
            };
        },
    },
];

function sigmoidInverse(alpha) {
    const clamped = Math.min(0.995, Math.max(0.005, alpha));
    return Math.log(clamped / (1 - clamped));
}

function isRichFixtureLayout(headerText) {
    return (
        headerText.includes("property uchar red") &&
        headerText.includes("property float opacity") &&
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
            richLayout: isRichFixtureLayout(layout.headerText),
        };
    } catch {
        return null;
    }
}

function writeProfiledFixturePly(plyPath, profile) {
    const [width, height, depth] = profile.dimensions;
    const pointCount = width * height * depth;
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
        const chunkSize = 96_000;
        const buffer = Buffer.allocUnsafe(chunkSize * stride);

        for (let start = 0; start < pointCount; start += chunkSize) {
            const count = Math.min(chunkSize, pointCount - start);

            for (let index = 0; index < count; index += 1) {
                const globalIndex = start + index;
                const xIndex = globalIndex % width;
                const yIndex = Math.floor(globalIndex / width) % height;
                const zIndex = Math.floor(globalIndex / (width * height)) % depth;
                const nx = width > 1 ? xIndex / (width - 1) : 0;
                const ny = height > 1 ? yIndex / (height - 1) : 0;
                const nz = depth > 1 ? zIndex / (depth - 1) : 0;
                const point = profile.buildPoint({
                    xIndex,
                    yIndex,
                    zIndex,
                    nx,
                    ny,
                    nz,
                });
                const offset = index * stride;
                const yawHalf = (point.yaw ?? 0) * 0.5;

                buffer.writeFloatLE(point.x, offset + 0);
                buffer.writeFloatLE(point.y, offset + 4);
                buffer.writeFloatLE(point.z, offset + 8);
                buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(point.red))), offset + 12);
                buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(point.green))), offset + 13);
                buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(point.blue))), offset + 14);
                buffer.writeFloatLE(sigmoidInverse(point.alpha), offset + 15);
                buffer.writeFloatLE(Math.log(point.scale0), offset + 19);
                buffer.writeFloatLE(Math.log(point.scale1), offset + 23);
                buffer.writeFloatLE(Math.log(point.scale2), offset + 27);
                buffer.writeFloatLE(0, offset + 31);
                buffer.writeFloatLE(Math.sin(yawHalf) * 0.18, offset + 35);
                buffer.writeFloatLE(0, offset + 39);
                buffer.writeFloatLE(Math.cos(yawHalf), offset + 43);
            }

            fs.writeSync(fd, buffer, 0, count * stride);
        }
    } finally {
        fs.closeSync(fd);
    }
}

function buildMetadata(profile, pointCount) {
    return {
        lane: "reconstruction",
        truth_label: profile.truthLabel,
        quality_tier: profile.qualityTier,
        point_count: pointCount,
        rendering: {
            viewer_renderer: "sharp_gaussian_direct",
            source_format: "sharp_ply_gold_fixture",
            color_encoding: "albedo_linear",
            has_explicit_vertex_colors: true,
        },
        delivery: {
            label: `${profile.label} staged delivery`,
            summary: `${profile.label} synthetic gold fixture for browser-safe renderer beauty certification.`,
            render_targets: {
                preferred_point_budget: pointCount,
            },
        },
        benchmark: {
            suite_id: "renderer_gold_scene_cert_v1",
            scene_id: profile.sceneId,
            fixture: true,
            fixture_schema_version: GOLD_FIXTURE_SCHEMA_VERSION,
        },
    };
}

function buildFixtureCameras(profile) {
    if (profile.sceneId === "scene_gold_cinematic_ribbons") {
        return [
            {
                id: "hero-ribbons",
                label: "Hero still",
                position: [0.4, 0.55, 7.6],
                target: [0.0, 0.2, 0.0],
                fov: 40,
                lens_mm: 43,
                note: "Balanced hero composition across the ribbon span.",
            },
            {
                id: "orbit-ribbons",
                label: "Slow orbit",
                position: [2.4, 0.7, 6.9],
                target: [0.0, 0.25, 0.0],
                fov: 42,
                lens_mm: 40,
                note: "Parallax-friendly orbit start for motion certification.",
            },
        ];
    }

    if (profile.sceneId === "scene_gold_luminous_atrium") {
        return [
            {
                id: "hero-atrium",
                label: "Hero still",
                position: [0.0, 0.9, 8.2],
                target: [0.0, 0.25, 0.0],
                fov: 38,
                lens_mm: 46,
                note: "Centered architectural hero shot.",
            },
            {
                id: "push-atrium",
                label: "Push in",
                position: [0.0, 1.1, 9.1],
                target: [0.0, 0.4, 0.0],
                fov: 36,
                lens_mm: 49,
                note: "Forward motion path for shimmer and pacing checks.",
            },
        ];
    }

    return [];
}

function buildFixtureDirectorPath(profile) {
    if (profile.sceneId === "scene_gold_cinematic_ribbons") {
        return [
            { time: 0, position: [2.4, 0.7, 6.9], target: [0.0, 0.25, 0.0], rotation: [0, 0, 0, 1], fov: 42 },
            { time: 3.5, position: [-2.2, 0.75, 6.5], target: [0.0, 0.22, 0.0], rotation: [0, 0, 0, 1], fov: 42 },
        ];
    }

    if (profile.sceneId === "scene_gold_luminous_atrium") {
        return [
            { time: 0, position: [0.0, 1.1, 9.1], target: [0.0, 0.4, 0.0], rotation: [0, 0, 0, 1], fov: 36 },
            { time: 3.0, position: [0.0, 0.95, 7.2], target: [0.0, 0.35, 0.0], rotation: [0, 0, 0, 1], fov: 35 },
        ];
    }

    return [];
}

function ensureGoldSceneFixture(profile) {
    const [width, height, depth] = profile.dimensions;
    const pointCount = width * height * depth;
    const environmentDir = path.resolve(process.cwd(), "scenes", profile.sceneId, "environment");
    const plyPath = path.join(environmentDir, "splats.ply");
    const metadataPath = path.join(environmentDir, "metadata.json");
    const camerasPath = path.join(environmentDir, "cameras.json");
    const benchmarkReportPath = path.join(environmentDir, "benchmark-report.json");
    const captureScorecardPath = path.join(environmentDir, "capture-scorecard.json");
    const holdoutReportPath = path.join(environmentDir, "holdout-report.json");

    fs.mkdirSync(environmentDir, { recursive: true });

    const existingLayout = decodeExistingLayout(plyPath);
    if (!existingLayout || existingLayout.pointCount !== pointCount || !existingLayout.richLayout) {
        writeProfiledFixturePly(plyPath, profile);
    }

    fs.writeFileSync(metadataPath, `${JSON.stringify(buildMetadata(profile, pointCount), null, 2)}\n`);
    fs.writeFileSync(camerasPath, `${JSON.stringify(buildFixtureCameras(profile), null, 2)}\n`);
    fs.writeFileSync(
        benchmarkReportPath,
        `${JSON.stringify(
            {
                suite_id: "renderer_gold_scene_cert_v1",
                scene_id: profile.sceneId,
                label: profile.label,
                status: "fixture_ready",
                point_count: pointCount,
                fixture_schema_version: GOLD_FIXTURE_SCHEMA_VERSION,
                cameras: buildFixtureCameras(profile),
                director_path: buildFixtureDirectorPath(profile),
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
                fixture_schema_version: GOLD_FIXTURE_SCHEMA_VERSION,
                cameras: buildFixtureCameras(profile),
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
                fixture_schema_version: GOLD_FIXTURE_SCHEMA_VERSION,
                director_path: buildFixtureDirectorPath(profile),
            },
            null,
            2,
        )}\n`,
    );

    const deliveryBundle = ensureSceneDeliveryBundle({
        sceneId: profile.sceneId,
        environmentDir,
        sceneLabel: profile.label,
    });
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

    return {
        sceneId: profile.sceneId,
        label: profile.label,
        pointCount,
        environmentDir,
        metadata,
        delivery: deliveryBundle,
        urls: {
            splats: `/storage/scenes/${profile.sceneId}/environment/splats.ply`,
            bootstrap: deliveryBundle.bootstrapUrl,
            manifest: deliveryBundle.manifestUrl,
            metadata: `/storage/scenes/${profile.sceneId}/environment/metadata.json`,
            cameras: `/storage/scenes/${profile.sceneId}/environment/cameras.json`,
            benchmark_report: `/storage/scenes/${profile.sceneId}/environment/benchmark-report.json`,
            capture_scorecard: `/storage/scenes/${profile.sceneId}/environment/capture-scorecard.json`,
            holdout_report: `/storage/scenes/${profile.sceneId}/environment/holdout-report.json`,
        },
    };
}

export function ensureGoldSceneFixtures() {
    return GOLD_SCENE_PROFILES.map(ensureGoldSceneFixture);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(JSON.stringify(ensureGoldSceneFixtures(), null, 2));
}
