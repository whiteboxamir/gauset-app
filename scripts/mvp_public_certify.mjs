import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import hostGuard from "./mvp_host_guard.cjs";

const { assertPublicCertificationContext, assertPublicMvpBaseUrl } = hostGuard;

const BASE = assertPublicMvpBaseUrl(
    process.env.GAUSET_MVP_BASE_URL || "https://gauset-app.vercel.app",
    "scripts/mvp_public_certify.mjs",
);
const STORAGE_BASE = assertPublicMvpBaseUrl(
    process.env.GAUSET_MVP_STORAGE_BASE_URL || BASE,
    "scripts/mvp_public_certify.mjs storage base",
);
const { artifactDir, runLabel } = assertPublicCertificationContext("scripts/mvp_public_certify.mjs", {
    requireWriteAck: false,
});
const summaryPath = path.resolve(artifactDir, "certification-summary.json");

await fs.mkdir(path.dirname(summaryPath), { recursive: true });

const steps = [
    {
        name: "boundary",
        command: ["node", "scripts/check-deploy-boundary.mjs"],
    },
    {
        name: "host_guardrails",
        command: ["node", "scripts/check_mvp_host_guardrails.mjs"],
    },
    {
        name: "public_preflight",
        command: ["node", "scripts/mvp_public_preflight.mjs"],
    },
];

const summary = {
    run_label: runLabel,
    base: BASE,
    storage_base: STORAGE_BASE,
    executed_at: new Date().toISOString(),
    completed_at: null,
    status: "running",
    steps: [],
    pass: false,
};

for (const step of steps) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(step.command[0], step.command.slice(1), {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
            ...process.env,
            GAUSET_MVP_BASE_URL: BASE,
            GAUSET_MVP_STORAGE_BASE_URL: STORAGE_BASE,
            GAUSET_PUBLIC_CERT_RUN_LABEL: runLabel,
        },
    });

    const completedAt = new Date().toISOString();
    summary.steps.push({
        name: step.name,
        command: step.command.join(" "),
        started_at: startedAt,
        completed_at: completedAt,
        status: result.status === 0 ? "passed" : "failed",
        exit_code: result.status,
        signal: result.signal ?? null,
    });

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    if (result.status !== 0) {
        summary.status = "failed";
        summary.completed_at = new Date().toISOString();
        await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
        process.exit(result.status ?? 1);
    }
}

summary.pass = true;
summary.status = "passed";
summary.completed_at = new Date().toISOString();
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
