import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import hostGuard from "./mvp_host_guard.cjs";
import { buildEnvDoctorSummary, launchEnvProfiles, resolveLaunchEnv } from "./launch_env_sources.mjs";

const { sanitizeRunLabel, STRICT_LOCAL_HOSTS = [] } = hostGuard;

const command = (process.argv[2] || "").trim();
const launchArtifactRoot = path.resolve("artifacts/launch");

function defaultRunLabel(prefix = "launch") {
    const candidate = sanitizeRunLabel(
        process.env.GAUSET_LAUNCH_RUN_LABEL || `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-").toLowerCase()}`,
    );
    return candidate || `${prefix}-${Date.now().toString(36)}`;
}

function summaryFilePath(runLabel, name) {
    return path.join(launchArtifactRoot, runLabel, `${name}.json`);
}

async function writeJson(filePath, payload) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function runCommand(commandParts, extraEnv = {}) {
    return spawnSync(commandParts[0], commandParts.slice(1), {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
            ...process.env,
            ...extraEnv,
        },
    });
}

function createLaunchEnvNotes(profile, resolvedLaunchEnv) {
    const doctor = buildEnvDoctorSummary(profile, resolvedLaunchEnv);
    const notes = [];
    if (doctor.resolvedCount > 0) {
        notes.push(
            `Auto-resolved ${doctor.resolvedCount} ${profile} env key(s) from ${
                doctor.sourcePaths.length > 0 ? doctor.sourcePaths.join(", ") : "the current shell"
            }.`,
        );
    }
    if (doctor.missingCount > 0) {
        notes.push(`Still missing ${profile} env key(s): ${doctor.missingKeys.join(", ")}.`);
    }
    return notes;
}

async function runSequence(name, steps, { runLabel = defaultRunLabel(name), notes = [] } = {}) {
    const summaryPath = summaryFilePath(runLabel, name);
    const summary = {
        runLabel,
        name,
        cwd: process.cwd(),
        executedAt: new Date().toISOString(),
        completedAt: null,
        status: "running",
        notes,
        steps: [],
    };

    await writeJson(summaryPath, summary);

    for (const step of steps) {
        const startedAt = new Date().toISOString();
        const result = runCommand(step.command, step.env);
        summary.steps.push({
            name: step.name,
            command: step.command.join(" "),
            startedAt,
            completedAt: new Date().toISOString(),
            status: result.status === 0 ? "passed" : "failed",
            exitCode: result.status,
            signal: result.signal ?? null,
        });
        await writeJson(summaryPath, summary);

        if (result.status !== 0) {
            summary.status = "failed";
            summary.completedAt = new Date().toISOString();
            await writeJson(summaryPath, summary);
            process.exit(result.status ?? 1);
        }
    }

    summary.status = "passed";
    summary.completedAt = new Date().toISOString();
    await writeJson(summaryPath, summary);
    console.log(JSON.stringify(summary, null, 2));
}

function boundarySteps() {
    return [
        {
            name: "check_boundary",
            command: ["node", "scripts/check-deploy-boundary.mjs"],
        },
        {
            name: "guard_deploy_target",
            command: ["node", "scripts/guard-deploy-target.mjs"],
        },
    ];
}

function resolvePublicBaseUrl() {
    const rawValue = (process.env.GAUSET_MVP_BASE_URL || "").trim();
    if (!rawValue) {
        return null;
    }

    let url;
    try {
        url = new URL(rawValue);
    } catch {
        return null;
    }

    return STRICT_LOCAL_HOSTS.includes(url.hostname.toLowerCase()) ? null : rawValue;
}

async function readJsonIfExists(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
        return null;
    }
}

async function findLatestArtifactSummary(rootDirectory, filename = "certification-summary.json") {
    let entries;
    try {
        entries = await fs.readdir(rootDirectory, { withFileTypes: true });
    } catch {
        return null;
    }

    const candidates = [];
    for (const directory of entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
        const filePath = path.join(rootDirectory, directory, filename);
        const payload = await readJsonIfExists(filePath);
        if (!payload) {
            continue;
        }
        const completedAt = normalizeCompletedTimestamp(payload);
        const executedAt = normalizeTimestamp(payload);
        const sortKey = Date.parse(completedAt || executedAt || "") || 0;
        candidates.push({
            directory,
            filePath,
            payload,
            sortKey,
        });
    }

    candidates.sort((left, right) => right.sortKey - left.sortKey);
    for (const candidate of candidates) {
        return {
            directory: candidate.directory,
            filePath: candidate.filePath,
            payload: candidate.payload,
        };
    }

    return null;
}

function parseRequiredLanes() {
    const raw = (process.env.GAUSET_LAUNCH_PACKET_REQUIRE || "mvp-local,public,platform,billing").trim();
    return new Set(
        raw
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
    );
}

function normalizeTimestamp(payload) {
    return payload.executedAt ?? payload.executed_at ?? null;
}

function normalizeCompletedTimestamp(payload) {
    return payload.completedAt ?? payload.completed_at ?? null;
}

function summarizeMvpLocal(entry) {
    const payload = entry.payload;
    return {
        lane: "mvp-local",
        status: payload.status ?? "unknown",
        ready: payload.status === "passed",
        artifactPath: entry.filePath,
        runLabel: payload.runLabel ?? entry.directory,
        executedAt: normalizeTimestamp(payload),
        completedAt: normalizeCompletedTimestamp(payload),
        blockerCount: Array.isArray(payload.blockers) ? payload.blockers.length : 0,
        blockers: Array.isArray(payload.blockers) ? payload.blockers : [],
    };
}

function summarizePublic(entry) {
    const payload = entry.payload;
    const passed = payload.status === "passed" || payload.pass === true;
    return {
        lane: "public",
        status: payload.status ?? "unknown",
        ready: passed,
        artifactPath: entry.filePath,
        runLabel: payload.run_label ?? entry.directory,
        executedAt: normalizeTimestamp(payload),
        completedAt: normalizeCompletedTimestamp(payload),
        blockerCount: 0,
        blockers: passed ? [] : ["Public certification summary is not passed."],
    };
}

function summarizePlatform(entry) {
    const payload = entry.payload;
    return {
        lane: "platform",
        status: payload.status ?? "unknown",
        ready: payload.status === "passed" && payload.readyToTurnOnGate === true,
        artifactPath: entry.filePath,
        runLabel: payload.runLabel ?? entry.directory,
        executedAt: normalizeTimestamp(payload),
        completedAt: normalizeCompletedTimestamp(payload),
        blockerCount: Array.isArray(payload.blockers) ? payload.blockers.length : 0,
        blockers: Array.isArray(payload.blockers) ? payload.blockers : [],
        readyToTurnOnGate: payload.readyToTurnOnGate ?? false,
    };
}

function summarizeBilling(entry) {
    const payload = entry.payload;
    return {
        lane: "billing",
        status: payload.status ?? "unknown",
        ready: payload.status === "passed" && payload.readyToCallBillingComplete === true,
        artifactPath: entry.filePath,
        runLabel: payload.runLabel ?? entry.directory,
        executedAt: normalizeTimestamp(payload),
        completedAt: normalizeCompletedTimestamp(payload),
        blockerCount: Array.isArray(payload.blockers) ? payload.blockers.length : 0,
        blockers: Array.isArray(payload.blockers) ? payload.blockers : [],
        readyToCallBillingComplete: payload.readyToCallBillingComplete ?? false,
    };
}

async function buildLaunchPacket() {
    const runLabel = defaultRunLabel("launch-packet");
    const summaryPath = summaryFilePath(runLabel, "packet");
    const requiredLanes = parseRequiredLanes();
    const laneReaders = {
        "mvp-local": {
            root: path.resolve("artifacts/mvp-local-stack"),
            summarize: summarizeMvpLocal,
        },
        public: {
            root: path.resolve("artifacts/public-live"),
            summarize: summarizePublic,
        },
        platform: {
            root: path.resolve("artifacts/platform-rollout"),
            summarize: summarizePlatform,
        },
        billing: {
            root: path.resolve("artifacts/platform-billing-completion"),
            summarize: summarizeBilling,
        },
    };

    const packet = {
        runLabel,
        name: "packet",
        cwd: process.cwd(),
        executedAt: new Date().toISOString(),
        completedAt: null,
        status: "running",
        requiredLanes: Array.from(requiredLanes),
        lanes: {},
        blockers: [],
        goNoGo: false,
    };

    for (const [lane, config] of Object.entries(laneReaders)) {
        const latest = await findLatestArtifactSummary(config.root);
        if (!latest) {
            packet.lanes[lane] = {
                lane,
                status: "missing",
                ready: false,
                artifactPath: null,
                runLabel: null,
                executedAt: null,
                completedAt: null,
                blockerCount: 1,
                blockers: ["No certification summary found for this lane."],
            };
            if (requiredLanes.has(lane)) {
                packet.blockers.push(`${lane}: missing certification summary`);
            }
            continue;
        }

        const laneSummary = config.summarize(latest);
        packet.lanes[lane] = laneSummary;
        if (requiredLanes.has(lane) && !laneSummary.ready) {
            packet.blockers.push(`${lane}: ${laneSummary.status}`);
        }
    }

    packet.goNoGo = packet.blockers.length === 0;
    packet.status = packet.goNoGo
        ? "passed"
        : packet.blockers.some((entry) => /failed/.test(entry))
          ? "failed"
          : "blocked";
    packet.completedAt = new Date().toISOString();

    await writeJson(summaryPath, packet);
    console.log(JSON.stringify(packet, null, 2));

    if (!packet.goNoGo) {
        process.exit(1);
    }
}

async function writeEnvDoctorSummary() {
    const runLabel = defaultRunLabel("launch-env-doctor");
    const summaryPath = summaryFilePath(runLabel, "env-doctor");
    const platformEnv = await resolveLaunchEnv({ profile: "platform", keys: launchEnvProfiles.platform });
    const billingEnv = await resolveLaunchEnv({ profile: "billing", keys: launchEnvProfiles.billing });
    const summary = {
        runLabel,
        name: "env-doctor",
        cwd: process.cwd(),
        executedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status:
            buildEnvDoctorSummary("platform", platformEnv).missingCount === 0 &&
            buildEnvDoctorSummary("billing", billingEnv).missingCount === 0
                ? "passed"
                : "partial",
        candidateFiles: Array.from(new Set([...platformEnv.candidateFiles, ...billingEnv.candidateFiles])),
        profiles: {
            platform: buildEnvDoctorSummary("platform", platformEnv),
            billing: buildEnvDoctorSummary("billing", billingEnv),
        },
    };
    await writeJson(summaryPath, summary);
    console.log(JSON.stringify(summary, null, 2));
}

async function main() {
    switch (command) {
        case "boundary": {
            await runSequence("boundary", boundarySteps());
            return;
        }
        case "preflight:mvp": {
            const runLabel = defaultRunLabel("launch-mvp");
            const notes = [];
            const steps = [
                ...boundarySteps(),
                {
                    name: "typecheck",
                    command: ["npm", "run", "typecheck"],
                },
                {
                    name: "lint_mvp",
                    command: ["npm", "run", "lint:mvp"],
                },
                {
                    name: "scene_graph",
                    command: ["npm", "run", "test:scene-graph"],
                },
                {
                    name: "mvp_proxy_contracts",
                    command: ["npm", "run", "test:mvp-proxy-contracts"],
                },
            ];
            const publicBaseUrl = resolvePublicBaseUrl();
            if (publicBaseUrl) {
                steps.push({
                    name: "public_preflight",
                    command: ["node", "scripts/mvp_public_preflight.mjs"],
                    env: {
                        GAUSET_MVP_BASE_URL: publicBaseUrl,
                        GAUSET_PUBLIC_CERT_RUN_LABEL: runLabel,
                    },
                });
            } else {
                notes.push("Skipped public preflight because GAUSET_MVP_BASE_URL is unset or points at a local host.");
            }
            await runSequence("preflight-mvp", steps, { runLabel, notes });
            return;
        }
        case "certify:mvp-local": {
            const runLabel = defaultRunLabel("launch-mvp-local");
            await runSequence(
                "certify-mvp-local",
                [
                    ...boundarySteps(),
                    {
                        name: "mvp_local_stack",
                        command: ["node", "scripts/certify_mvp_local_stack.mjs"],
                        env: {
                            GAUSET_LOCAL_STACK_CERT_RUN_LABEL: runLabel,
                        },
                    },
                ],
                { runLabel },
            );
            return;
        }
        case "preflight:platform": {
            const resolvedLaunchEnv = await resolveLaunchEnv({ profile: "platform", keys: launchEnvProfiles.platform });
            await runSequence(
                "preflight-platform",
                [
                    ...boundarySteps(),
                    {
                        name: "platform_readiness",
                        command: ["npm", "run", "diagnose:platform-readiness"],
                        env: resolvedLaunchEnv.env,
                    },
                    {
                        name: "platform_contracts",
                        command: ["npm", "run", "test:platform-contracts"],
                    },
                    {
                        name: "platform_routes",
                        command: ["npm", "run", "test:platform-routes"],
                    },
                ],
                { notes: createLaunchEnvNotes("platform", resolvedLaunchEnv) },
            );
            return;
        }
        case "certify:public": {
            const runLabel = defaultRunLabel("launch-public");
            await runSequence(
                "certify-public",
                [
                    ...boundarySteps(),
                    {
                        name: "public_certification",
                        command: ["node", "scripts/mvp_public_certify.mjs"],
                        env: {
                            GAUSET_PUBLIC_CERT_RUN_LABEL: runLabel,
                        },
                    },
                ],
                { runLabel },
            );
            return;
        }
        case "certify:platform": {
            const runLabel = defaultRunLabel("launch-platform");
            const resolvedLaunchEnv = await resolveLaunchEnv({ profile: "platform", keys: launchEnvProfiles.platform });
            await runSequence(
                "certify-platform",
                [
                    ...boundarySteps(),
                    {
                        name: "platform_rollout",
                        command: ["node", "scripts/certify_platform_rollout.mjs"],
                        env: {
                            GAUSET_PLATFORM_CERT_RUN_LABEL: runLabel,
                            ...resolvedLaunchEnv.env,
                        },
                    },
                ],
                { runLabel, notes: createLaunchEnvNotes("platform", resolvedLaunchEnv) },
            );
            return;
        }
        case "certify:billing": {
            const runLabel = defaultRunLabel("launch-billing");
            const resolvedLaunchEnv = await resolveLaunchEnv({ profile: "billing", keys: launchEnvProfiles.billing });
            await runSequence(
                "certify-billing",
                [
                    ...boundarySteps(),
                    {
                        name: "platform_billing_completion",
                        command: ["node", "scripts/certify_platform_billing_completion.mjs"],
                        env: {
                            GAUSET_PLATFORM_BILLING_CERT_RUN_LABEL: runLabel,
                            ...resolvedLaunchEnv.env,
                        },
                    },
                ],
                { runLabel, notes: createLaunchEnvNotes("billing", resolvedLaunchEnv) },
            );
            return;
        }
        case "doctor:env": {
            await writeEnvDoctorSummary();
            return;
        }
        case "packet": {
            await buildLaunchPacket();
            return;
        }
        default: {
            console.error(
                [
                    "Usage: node scripts/launch_ops.mjs <command>",
                    "Commands:",
                    "  boundary",
                    "  preflight:mvp",
                    "  certify:mvp-local",
                    "  preflight:platform",
                    "  certify:public",
                    "  certify:platform",
                    "  certify:billing",
                    "  doctor:env",
                    "  packet",
                ].join("\n"),
            );
            process.exit(1);
        }
    }
}

await main();
