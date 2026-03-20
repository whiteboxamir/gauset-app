import assert from "node:assert/strict";

import {
    buildProxyResponseHeaders,
    buildUpstreamRequestHeaders,
    buildUpstreamUrl,
    resolveBackendBaseUrlForOrigin,
    resolveInternalBackendBaseUrlForOrigin,
    resolveBackendWorkerToken,
} from "../src/server/mvp/proxyBackend.ts";
import { issueBrowserDirectUploadGrant, resolveDirectUploadCapability } from "../src/server/mvp/upload.ts";
import {
    buildAccessDeniedResponse,
    buildUnavailableResponse,
    extractSceneIdFromRequestPayload,
    extractSourceLabelFromRequestPayload,
    isPublicProxyPath,
    parseJsonBody,
} from "../src/server/mvp/proxyShared.ts";

function testBackendResolution() {
    assert.equal(
        resolveInternalBackendBaseUrlForOrigin({
            origin: "https://preview-safe.vercel.app",
            env: {
                VERCEL: "1",
            },
        }),
        "https://preview-safe.vercel.app/api/_mvp_backend",
    );

    assert.equal(
        resolveBackendBaseUrlForOrigin({
            origin: "http://localhost:3015",
            env: {
                NODE_ENV: "development",
            },
        }),
        "http://localhost:8000",
    );

    assert.equal(
        resolveBackendBaseUrlForOrigin({
            origin: "https://preview-safe.vercel.app",
            env: {
                NODE_ENV: "production",
                VERCEL: "1",
                GAUSET_BACKEND_URL: "https://backend.example.com/",
            },
        }),
        "https://backend.example.com",
    );

    assert.equal(
        resolveBackendWorkerToken({
            GAUSET_BACKEND_WORKER_TOKEN: "worker-a",
            GAUSET_WORKER_TOKEN: "worker-b",
        }),
        "worker-a",
    );
}

function testProxyUrlAndHeaders() {
    const upstreamUrl = buildUpstreamUrl({
        backendBaseUrl: "http://localhost:8000",
        pathname: "scene/test",
        searchParams: new URLSearchParams([
            ["share", "signed-token"],
            ["ts", "123"],
        ]),
    });
    assert.equal(upstreamUrl.toString(), "http://localhost:8000/scene/test?ts=123");

    const upstreamHeaders = buildUpstreamRequestHeaders({
        requestHeaders: new Headers({
            connection: "keep-alive",
            "content-type": "application/json",
            "x-custom-header": "custom",
        }),
        workerToken: "worker-token",
        studioId: "studio-123",
        userId: "user-456",
    });
    assert.equal(upstreamHeaders.get("connection"), null);
    assert.equal(upstreamHeaders.get("content-type"), "application/json");
    assert.equal(upstreamHeaders.get("x-custom-header"), "custom");
    assert.equal(upstreamHeaders.get("authorization"), "Bearer worker-token");
    assert.equal(upstreamHeaders.get("x-gauset-worker-token"), "worker-token");
    assert.equal(upstreamHeaders.get("x-gauset-studio-id"), "studio-123");
    assert.equal(upstreamHeaders.get("x-gauset-user-id"), "user-456");

    const responseHeaders = buildProxyResponseHeaders(
        new Headers({
            connection: "keep-alive",
            "content-type": "application/json",
            etag: "etag-1",
        }),
    );
    assert.equal(responseHeaders.get("connection"), null);
    assert.equal(responseHeaders.get("etag"), "etag-1");
}

function testDirectUploadCapabilityAndGrant() {
    const backendCapability = resolveDirectUploadCapability({
        GAUSET_BACKEND_URL: "https://backend.example.com",
        GAUSET_BACKEND_WORKER_TOKEN: "worker-a",
    });
    assert.equal(backendCapability.available, true);
    assert.equal(backendCapability.transport, "backend");
    assert.equal(backendCapability.directUploadUrl, "https://backend.example.com/upload");

    const unsignedBackendCapability = resolveDirectUploadCapability({
        GAUSET_BACKEND_URL: "https://backend.example.com",
    });
    assert.equal(unsignedBackendCapability.available, false);
    assert.equal(unsignedBackendCapability.transport, null);

    const grant = issueBrowserDirectUploadGrant({
        filename: "source.jpeg",
        contentType: "image/jpeg",
        size: 1024,
        uploadUrl: "https://backend.example.com/upload",
        env: {
            GAUSET_BACKEND_WORKER_TOKEN: "worker-a",
        },
    });
    assert.equal(grant.uploadUrl, "https://backend.example.com/upload");
    assert.equal(grant.headers["x-gauset-upload-audience"], "https://backend.example.com/upload");
    assert.match(grant.headers["x-gauset-upload-nonce"], /^[a-z0-9]{32}$/i);
    assert.ok(grant.headers["x-gauset-upload-signature"]);
}

async function testSharedProxyHelpers() {
    assert.equal(isPublicProxyPath("health", "GET"), true);
    assert.equal(isPublicProxyPath("scene/test", "OPTIONS"), true);
    assert.equal(isPublicProxyPath("scene/test", "GET"), false);

    const jsonBuffer = new TextEncoder().encode(JSON.stringify({ scene_id: "scene_payload" })).buffer;
    assert.deepEqual(parseJsonBody("application/json", jsonBuffer), { scene_id: "scene_payload" });
    assert.equal(parseJsonBody("text/plain", jsonBuffer), null);
    assert.equal(extractSceneIdFromRequestPayload("scene/scene_path/versions/123", null), "scene_path");
    assert.equal(extractSceneIdFromRequestPayload("upload", { scene_id: "scene_payload" }), "scene_payload");

    assert.equal(
        extractSourceLabelFromRequestPayload({
            scene_graph: {
                environment: {
                    sourceLabel: "Scout Frame",
                },
            },
        }),
        "Scout Frame",
    );

    const unavailable = buildUnavailableResponse("scene/test");
    assert.equal(unavailable.status, 503);
    const unavailablePayload = (await unavailable.json()) as { code: string };
    assert.equal(unavailablePayload.code, "BACKEND_UNAVAILABLE");

    const denied = buildAccessDeniedResponse({
        pathname: "scene/test",
        status: 403,
        code: "AUTH_REQUIRED",
        message: "Denied.",
        redirectTo: "/auth/login",
    });
    assert.equal(denied.status, 403);
    const deniedPayload = (await denied.json()) as { redirectTo: string };
    assert.equal(deniedPayload.redirectTo, "/auth/login");
}

await testSharedProxyHelpers();
testBackendResolution();
testProxyUrlAndHeaders();
testDirectUploadCapabilityAndGrant();

console.log("MVP proxy contract checks passed.");
