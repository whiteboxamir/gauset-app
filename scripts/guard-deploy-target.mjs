import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const GAUSET_APP_PROJECT = {
    id: "prj_ZIWyr5xwYv9NOaskMNjZ6TcM4cyF",
    name: "gauset-app",
};

const GAUSET_COM_PROJECT = {
    id: "prj_jF72OcZYvOt9x2LwUaKEJp1mjPAY",
    name: "gauset-com",
};

const BLOCKED_PRODUCTION_HOSTS = new Set([
    "gauset.com",
    "www.gauset.com",
    "gnosika.com",
    "www.gnosika.com",
]);
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
        "Direct Vercel CLI deployments are disabled for gauset-app.",
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

    if (linkedName === GAUSET_COM_PROJECT.name || linkedId === GAUSET_COM_PROJECT.id) {
        fail(
            "This gauset-app checkout is linked to the gauset-com Vercel project.",
            [
                "Production site deploys must come from /Users/amirboz/gauset, not /Users/amirboz/gauset-app.",
                "Relink this directory to gauset-app before attempting a deploy.",
            ],
        );
    }

    if (linkedName && linkedName !== GAUSET_APP_PROJECT.name) {
        fail("This gauset-app checkout is linked to an unexpected Vercel project.", [
            `Expected project: ${GAUSET_APP_PROJECT.name}`,
            `Actual project: ${linkedName}`,
        ]);
    }

    if (linkedId && linkedId !== GAUSET_APP_PROJECT.id) {
        fail("This gauset-app checkout is linked to an unexpected Vercel project id.", [
            `Expected project id: ${GAUSET_APP_PROJECT.id}`,
            `Actual project id: ${linkedId}`,
        ]);
    }
}

const projectProductionUrl = normalizeHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);
const deploymentUrl = normalizeHost(process.env.VERCEL_URL);
const detectedProjectId = process.env.VERCEL_PROJECT_ID?.trim() ?? "";
const blockedHost = [projectProductionUrl, deploymentUrl].find((host) => BLOCKED_PRODUCTION_HOSTS.has(host));

if (blockedHost) {
    fail(
        "Refusing to build gauset-app for the production gauset-com domain.",
        [
            `Blocked host: ${blockedHost}`,
            "gauset.com and gnosika.com must only be built from /Users/amirboz/gauset.",
        ],
    );
}

if (detectedProjectId === GAUSET_COM_PROJECT.id) {
    fail(
        "Refusing to build gauset-app inside the gauset-com Vercel project.",
        ["Use /Users/amirboz/gauset for gauset-com production deployments."],
    );
}
