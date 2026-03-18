import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(".");

const routePath = path.join(workspaceRoot, "src/app/api/mvp/[...path]/route.ts");
const proxyPath = path.join(workspaceRoot, "src/server/mvp/proxy.ts");
const proxyAccessPath = path.join(workspaceRoot, "src/server/mvp/proxyAccess.ts");
const proxyBackendPath = path.join(workspaceRoot, "src/server/mvp/proxyBackend.ts");
const proxySharedPath = path.join(workspaceRoot, "src/server/mvp/proxyShared.ts");

const [routeSource, proxySource, proxyAccessSource, proxyBackendSource, proxySharedSource] = await Promise.all([
    fs.readFile(routePath, "utf8"),
    fs.readFile(proxyPath, "utf8"),
    fs.readFile(proxyAccessPath, "utf8"),
    fs.readFile(proxyBackendPath, "utf8"),
    fs.readFile(proxySharedPath, "utf8"),
]);

const checks = [
    {
        label: "MVP proxy route delegates all HTTP verbs to the extracted proxy module",
        pass:
            routeSource.includes('import { proxyMvpRequest } from "@/server/mvp/proxy";') &&
            routeSource.includes("return proxyMvpRequest(request, context);") &&
            !routeSource.includes("const HOP_BY_HOP_HEADERS") &&
            !routeSource.includes("async function authorizeRequest(") &&
            !routeSource.includes("async function ensureResponseSceneAccess(") &&
            !routeSource.includes("function resolveBackendBaseUrl("),
    },
    {
        label: "Proxy module composes backend, access, and shared helpers",
        pass:
            proxySource.includes('from "@/server/mvp/proxyAccess";') &&
            proxySource.includes("authorizeProxyRequest") &&
            proxySource.includes("ensureProxyResponseSceneAccess") &&
            proxySource.includes('from "@/server/mvp/proxyShared";') &&
            proxySource.includes("buildBackendProxyErrorResponse") &&
            proxySource.includes("buildUnavailableResponse") &&
            proxySource.includes("extractJsonResponsePayload") &&
            proxySource.includes('from "@/server/mvp/proxyBackend";') &&
            proxySource.includes("buildProxyResponseHeaders") &&
            proxySource.includes("buildUpstreamRequestHeaders") &&
            proxySource.includes("buildUpstreamUrl") &&
            proxySource.includes("const accessResult = await authorizeProxyRequest({") &&
            proxySource.includes("const upstreamUrl = buildUpstreamUrl({") &&
            proxySource.includes("headers: buildProxyResponseHeaders(upstream.headers),"),
    },
    {
        label: "Proxy access module owns auth gating and scene ownership enforcement",
        pass:
            proxyAccessSource.includes("export async function authorizeProxyRequest({") &&
            proxyAccessSource.includes("const reviewShareAccess =") &&
            proxyAccessSource.includes("await authorizeReviewShareToken({") &&
            proxyAccessSource.includes("await canSessionAccessMvp(session)") &&
            proxyAccessSource.includes("await resolveSceneOwnershipForSession(session, requestSceneId);") &&
            proxyAccessSource.includes("export async function ensureProxyResponseSceneAccess({"),
    },
    {
        label: "Proxy backend module owns target URL and header construction",
        pass:
            proxyBackendSource.includes('import { HOP_BY_HOP_HEADERS } from "./proxyShared.ts";') &&
            proxyBackendSource.includes("export function resolveInternalBackendBaseUrlForOrigin({") &&
            proxyBackendSource.includes("export function resolveBackendBaseUrlForOrigin({") &&
            proxyBackendSource.includes("export function buildUpstreamUrl({") &&
            proxyBackendSource.includes("export function buildUpstreamRequestHeaders({") &&
            proxyBackendSource.includes('if (key === "share") {') &&
            proxyBackendSource.includes('headers.set("x-gauset-worker-token", workerToken);'),
    },
    {
        label: "Proxy shared module owns hop-by-hop filtering and request payload parsing",
        pass:
            proxySharedSource.includes('import { extractSceneIdFromProxyPath } from "./proxyScene.ts";') &&
            proxySharedSource.includes("export const HOP_BY_HOP_HEADERS = new Set([") &&
            proxySharedSource.includes("export function buildAccessDeniedResponse({") &&
            proxySharedSource.includes("export function parseJsonBody(contentType: string | null, bodyBuffer?: ArrayBuffer) {") &&
            proxySharedSource.includes("export function extractSceneIdFromRequestPayload(pathname: string, payload: Record<string, unknown> | null) {") &&
            proxySharedSource.includes("export async function extractJsonResponsePayload(upstream: Response) {"),
    },
];

let failed = false;

for (const check of checks) {
    if (check.pass) {
        console.log(`pass: ${check.label}`);
        continue;
    }

    console.error(`mvp proxy isolation check failed: ${check.label}`);
    failed = true;
}

if (failed) {
    process.exit(1);
}
