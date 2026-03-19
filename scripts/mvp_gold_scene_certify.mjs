import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import hostGuard from "./mvp_host_guard.cjs";
import { ensureBenchmarkFixture } from "./generate_benchmark_splat_fixture.mjs";
import { ensureGoldSceneFixtures } from "./generate_gold_splat_scene_fixtures.mjs";

const { assertLocalMvpBaseUrl, sanitizeRunLabel } = hostGuard;

const baseUrl = assertLocalMvpBaseUrl(
    process.argv[2] ?? process.env.GAUSET_MVP_BASE_URL ?? "http://localhost:3015",
    "scripts/mvp_gold_scene_certify.mjs",
);
const registryPath = path.resolve(process.env.GAUSET_GOLD_SCENE_REGISTRY ?? "tests/fixtures/gold-scenes.json");
const runLabel =
    sanitizeRunLabel(
        process.env.GAUSET_GOLD_SCENE_RUN_LABEL ??
            `gold-scenes-${new Date().toISOString().replace(/[:.]/g, "-").toLowerCase()}`,
    ) || `gold-scenes-${Date.now().toString(36)}`;
const artifactDir = path.resolve(process.env.GAUSET_GOLD_SCENE_ARTIFACT_DIR ?? `artifacts/gold-scenes/${runLabel}`);
const reportPath = path.join(artifactDir, "report.json");

function parseChildJson(stdout, stderr) {
    const combined = `${stdout ?? ""}`.trim() || `${stderr ?? ""}`.trim();
    if (!combined) {
        throw new Error("Local cert did not emit JSON.");
    }

    const jsonStart = combined.indexOf("{");
    const jsonEnd = combined.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        throw new Error(`Unable to parse local cert JSON.\n${combined}`);
    }

    return JSON.parse(combined.slice(jsonStart, jsonEnd + 1));
}

function hashSceneId(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function evaluateExpectation(entry, sceneReport) {
    const beautyOutcome = sceneReport.beauty_outcome ?? null;
    const certified = Boolean(sceneReport.existing_scene_certified);
    const beautyCertified = ["beautiful", "polished"].includes(beautyOutcome ?? "");

    if (entry.expectation === "beauty") {
        if (certified && beautyCertified) {
            return {
                status: "passed",
                reason: `beauty:${beautyOutcome}`,
            };
        }

        return {
            status: certified ? "beauty_gap" : "failed",
            reason: certified ? `beauty:${beautyOutcome ?? "unproven"}` : "existing_scene_not_certified",
        };
    }

    return {
        status: certified ? "passed" : "failed",
        reason: certified ? "stability_certified" : "existing_scene_not_certified",
    };
}

fs.mkdirSync(artifactDir, { recursive: true });

ensureBenchmarkFixture();
ensureGoldSceneFixtures();

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const scenes = Array.isArray(registry) ? registry : [];
const sceneReports = [];

for (const entry of scenes) {
    const sceneId = String(entry?.scene_id ?? "").trim();
    if (!sceneId) {
        continue;
    }

    const sceneRunLabel =
        sanitizeRunLabel(`${runLabel}-${sceneId.slice(0, 18)}-${hashSceneId(sceneId)}`) || `${runLabel}-${hashSceneId(sceneId)}`;
    const child = spawnSync(
        process.execPath,
        [path.resolve("scripts/mvp_local_viewer_certify.mjs"), baseUrl, sceneId],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
                ...process.env,
                GAUSET_LOCAL_VIEWER_RUN_LABEL: sceneRunLabel,
            },
            maxBuffer: 20 * 1024 * 1024,
        },
    );

    let certReport = null;
    let parseError = null;
    try {
        certReport = parseChildJson(child.stdout, child.stderr);
    } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
    }

    const evaluation =
        certReport && !parseError
            ? evaluateExpectation(entry, certReport)
            : {
                  status: "failed",
                  reason: parseError ?? `local_cert_exit:${child.status ?? "unknown"}`,
              };

    sceneReports.push({
        scene_id: sceneId,
        label: entry.label ?? sceneId,
        expectation: entry.expectation ?? "stability",
        fixture_kind: entry.fixture_kind ?? null,
        status: evaluation.status,
        reason: evaluation.reason,
        local_cert_status: certReport?.status ?? null,
        existing_scene_certified: certReport?.existing_scene_certified ?? false,
        beauty_outcome: certReport?.beauty_outcome ?? null,
        beauty_certified: certReport?.beauty_certified ?? false,
        presentation_judgement: certReport?.presentation_judgement ?? null,
        artifact_dir: certReport?.artifact_dir ?? null,
        warnings: certReport?.warnings ?? [],
        failures: certReport?.failures ?? [],
        child_exit_status: child.status,
        child_signal: child.signal,
        parse_error: parseError,
    });
}

const report = {
    suite_id: "gold_scene_cert_v1",
    run_label: runLabel,
    base: baseUrl,
    registry_path: registryPath,
    artifact_dir: artifactDir,
    executed_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: sceneReports.every((entry) => entry.status === "passed") ? "passed" : "failed",
    scenes: sceneReports,
    summary: {
        total: sceneReports.length,
        passed: sceneReports.filter((entry) => entry.status === "passed").length,
        beauty_gap: sceneReports.filter((entry) => entry.status === "beauty_gap").length,
        failed: sceneReports.filter((entry) => entry.status === "failed").length,
    },
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
    process.exit(1);
}
