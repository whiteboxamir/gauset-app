import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const GAUSET_COM_PROJECT = {
    id: "prj_jF72OcZYvOt9x2LwUaKEJp1mjPAY",
    name: "gauset-com",
};

const runningOnVercel = process.env.VERCEL === "1";
const gitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
const gitRepoSlug = process.env.VERCEL_GIT_REPO_SLUG?.trim() ?? "";

function normalizeHost(value) {
    if (!value) {
        return "";
    }

    return value
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .trim()
        .toLowerCase();
}

function fail(message, details = []) {
    console.error(`\n[guard-deploy-target] ${message}`);

    for (const detail of details) {
        console.error(`[guard-deploy-target] ${detail}`);
    }

    process.exit(1);
}

function readLinkedProject() {
    const projectPath = path.join(process.cwd(), ".vercel", "project.json");

    if (!fs.existsSync(projectPath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(projectPath, "utf8"));
    } catch (error) {
        fail("Failed to read .vercel/project.json.", [String(error)]);
    }
}

if (runningOnVercel && (!gitCommitSha || !gitRepoSlug)) {
    fail(
        "Direct Vercel CLI deployments are disabled for production.",
        [
            "This Vercel build is missing Git metadata, so it was not triggered from the GitHub integration.",
            "Push the branch to GitHub and let Vercel deploy from the connected repository.",
        ],
    );
}

const linkedProject = readLinkedProject();

if (linkedProject) {
    const linkedName = linkedProject.projectName ?? "";
    const linkedId = linkedProject.projectId ?? "";

    if (linkedName && linkedName !== GAUSET_COM_PROJECT.name) {
        fail("This checkout is linked to an unexpected Vercel project.", [
            `Expected project: ${GAUSET_COM_PROJECT.name}`,
            `Actual project: ${linkedName}`,
        ]);
    }

    if (linkedId && linkedId !== GAUSET_COM_PROJECT.id) {
        fail("This checkout is linked to an unexpected Vercel project id.", [
            `Expected project id: ${GAUSET_COM_PROJECT.id}`,
            `Actual project id: ${linkedId}`,
        ]);
    }
}
const detectedProjectId = process.env.VERCEL_PROJECT_ID?.trim() ?? "";

if (detectedProjectId === GAUSET_COM_PROJECT.id) {
    process.exit(0);
}
