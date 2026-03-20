import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(".");
const forbiddenProductionHosts = ["gauset.com", "www.gauset.com", "gnosika.com", "www.gnosika.com"];
const forbiddenPublicHostsForLocal = [...forbiddenProductionHosts, "gauset-app.vercel.app", "www.gauset-app.vercel.app"];
const forbiddenLocalHostsForPublic = ["127.0.0.1", "localhost"];

const localEntrypoints = [
    "tests/mvp.local.spec.js",
    "scripts/hostile_local_reconstruction_audit.mjs",
    "scripts/mvp_benchmark_5m.mjs",
    "scripts/mvp_viewer_diag.mjs",
    "scripts/mvp_preview_repro.mjs",
];

const publicEntrypoints = [
    "tests/mvp.public.spec.js",
    "scripts/hostile_public_audit.mjs",
    "scripts/mvp_public_preflight.mjs",
    "scripts/mvp_public_certify.mjs",
    "scripts/build_public_cert_packet.mjs",
];

const failures = [];

async function readFile(relativePath) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    const contents = await fs.readFile(absolutePath, "utf8");
    return { absolutePath, contents };
}

function recordFailure(relativePath, message) {
    failures.push(`${relativePath}: ${message}`);
}

for (const relativePath of localEntrypoints) {
    const { contents } = await readFile(relativePath);
    if (!contents.includes("assertLocalMvp")) {
        recordFailure(relativePath, "missing assertLocalMvp* guard");
    }
    for (const forbiddenHost of forbiddenPublicHostsForLocal) {
        if (contents.includes(forbiddenHost)) {
            recordFailure(relativePath, `contains forbidden non-local host "${forbiddenHost}"`);
        }
    }
}

for (const relativePath of publicEntrypoints) {
    const { contents } = await readFile(relativePath);
    if (!contents.includes("assertPublicMvp")) {
        recordFailure(relativePath, "missing assertPublicMvp* guard");
    }
    if (!contents.includes("assertPublicCertificationContext")) {
        recordFailure(relativePath, "missing assertPublicCertificationContext guard");
    }
    for (const forbiddenHost of forbiddenProductionHosts) {
        if (contents.includes(forbiddenHost)) {
            recordFailure(relativePath, `contains forbidden production host "${forbiddenHost}"`);
        }
    }
    for (const forbiddenHost of forbiddenLocalHostsForPublic) {
        if (contents.includes(forbiddenHost)) {
            recordFailure(relativePath, `contains forbidden local host "${forbiddenHost}"`);
        }
    }
}

if (failures.length > 0) {
    console.error("MVP host guardrails failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log("MVP host guardrails are in place.");
