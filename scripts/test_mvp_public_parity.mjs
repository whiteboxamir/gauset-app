import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(".");
const publicRepoRoot = path.resolve(process.env.GAUSET_PUBLIC_REPO_ROOT ?? path.join(workspaceRoot, "..", "gauset"));

const localBackendPath = path.join(workspaceRoot, "backend/api/routes.py");
const publicBackendPath = path.join(publicRepoRoot, "api/_mvp_backend/vercel_backend/app.py");
const intakeSetupPath = path.join(workspaceRoot, "src/app/mvp/_hooks/useMvpWorkspaceIntakeSetupController.ts");
const generationControllerPath = path.join(workspaceRoot, "src/app/mvp/_hooks/useMvpWorkspaceGenerationController.ts");
const captureControllerPath = path.join(workspaceRoot, "src/app/mvp/_hooks/useMvpWorkspaceCaptureController.ts");

async function readSource(filePath) {
    return fs.readFile(filePath, "utf8");
}

function collectRoutePaths(source) {
    const routes = new Set();
    const routePattern = /@(router|app)\.(get|post|put|delete|patch)\("([^"]+)"\)/g;
    for (const match of source.matchAll(routePattern)) {
        routes.add(match[3]);
    }
    return routes;
}

const [localBackendSource, publicBackendSource, intakeSetupSource, generationControllerSource, captureControllerSource] =
    await Promise.all([
        readSource(localBackendPath),
        readSource(publicBackendPath),
        readSource(intakeSetupPath),
        readSource(generationControllerPath),
        readSource(captureControllerPath),
    ]);

const localRoutes = collectRoutePaths(localBackendSource);
const publicRoutes = collectRoutePaths(publicBackendSource);

const expectedRoutes = [
    "/providers",
    "/generate/image",
    "/reconstruct/session/{session_id}",
];

const reconstructionUnavailableDetail =
    "This backend can collect capture sets, but a dedicated multi-view Gaussian reconstruction worker is not connected yet.";

const checks = [
    {
        label: "Frontend MVP controllers call the provider catalog, generated-image, and reconstruction routes",
        pass:
            intakeSetupSource.includes("await fetch(`${MVP_API_BASE_URL}/providers`, { cache: \"no-store\" })") &&
            generationControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/generate/image`, {") &&
            captureControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/reconstruct/session/${captureSession.session_id}`, {"),
    },
    {
        label: "Local backend exposes the provider catalog, generated-image, and reconstruction kickoff routes",
        pass: expectedRoutes.every((route) => localRoutes.has(route)),
    },
    {
        label: "Public backend exposes the provider catalog, generated-image, and reconstruction kickoff routes",
        pass: expectedRoutes.every((route) => publicRoutes.has(route)),
    },
    {
        label: "Local and public backends share the same truthful reconstruction unavailable detail",
        pass:
            localBackendSource.includes(reconstructionUnavailableDetail) &&
            publicBackendSource.includes(reconstructionUnavailableDetail),
    },
    {
        label: "Local and public provider catalog routes both return registry summary and catalog entries",
        pass:
            localBackendSource.includes('return {\n        "enabled": registry.feature_enabled,') &&
            localBackendSource.includes('"summary": registry.image_provider_summary()') &&
            localBackendSource.includes('"providers": [entry.to_payload() for entry in registry.list_catalog()]') &&
            publicBackendSource.includes('return {\n        "enabled": registry.feature_enabled,') &&
            publicBackendSource.includes('"summary": registry.image_provider_summary()') &&
            publicBackendSource.includes('"providers": [entry.to_payload() for entry in registry.list_catalog()]'),
    },
    {
        label: "Local and public generated-image routes both resolve provider adapters and create generated_image jobs",
        pass:
            localBackendSource.includes("adapter = registry.get_image_adapter(") &&
            localBackendSource.includes('"type": "generated_image"') &&
            localBackendSource.includes('"reference_image_ids": payload.reference_image_ids') &&
            publicBackendSource.includes("adapter = registry.get_image_adapter(") &&
            publicBackendSource.includes('"type": "generated_image"') &&
            publicBackendSource.includes('"reference_image_ids": request.reference_image_ids'),
    },
];

let failed = false;

for (const check of checks) {
    if (check.pass) {
        console.log(`pass: ${check.label}`);
        continue;
    }

    console.error(`mvp public parity check failed: ${check.label}`);
    failed = true;
}

if (failed) {
    process.exit(1);
}
