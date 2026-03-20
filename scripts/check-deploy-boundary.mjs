import process from "node:process";

import {
    BLOCKED_PRODUCTION_HOSTS,
    EXPECTED_GITHUB_REPO,
    GAUSET_APP_PROJECT,
    buildBoundarySnapshot,
    evaluateBoundary,
} from "./deploy-boundary-lib.mjs";

const snapshot = buildBoundarySnapshot();
const failures = evaluateBoundary(snapshot);
const linkedProjectName = snapshot.linkedProject?.projectName ?? "unlinked";
const linkedProjectId = snapshot.linkedProject?.projectId ?? "unlinked";

console.log(`[boundary] cwd: ${snapshot.cwd}`);
console.log(`[boundary] git remote: ${snapshot.originRemote || "missing"}`);
console.log(`[boundary] git repo slug: ${snapshot.originRepoSlug || "missing"}`);
console.log(`[boundary] expected git repo slug: ${EXPECTED_GITHUB_REPO.slug}`);
console.log(`[boundary] linked vercel project: ${linkedProjectName} (${linkedProjectId})`);
console.log(`[boundary] expected vercel project: ${GAUSET_APP_PROJECT.name} (${GAUSET_APP_PROJECT.id})`);
console.log(`[boundary] blocked production hosts: ${Array.from(BLOCKED_PRODUCTION_HOSTS).join(", ")}`);

if (snapshot.runningOnVercel) {
    console.log(`[boundary] vercel repo slug: ${snapshot.vercelRepoSlug || "missing"}`);
    console.log(`[boundary] vercel project id: ${snapshot.detectedProjectId || "missing"}`);
    console.log(`[boundary] vercel production url: ${snapshot.projectProductionUrl || "missing"}`);
    console.log(`[boundary] vercel deployment url: ${snapshot.deploymentUrl || "missing"}`);
}

if (failures.length > 0) {
    console.error("[boundary] status: FAILED");
    for (const failure of failures) {
        console.error(`[boundary] ${failure.message}`);
        for (const detail of failure.details) {
            console.error(`[boundary] ${detail}`);
        }
    }
    process.exit(1);
}

console.log("[boundary] status: OK");
