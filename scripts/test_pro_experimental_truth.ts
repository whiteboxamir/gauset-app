import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { POST } from "../src/app/api/generate/route.ts";

const proPagePath = path.resolve("src/app/pro/page.tsx");
const timelineEditorPath = path.resolve("src/components/Viewfinder/TimelineEditor.tsx");
const imageIngestionPath = path.resolve("src/components/Viewfinder/ImageIngestionFlow.tsx");
const assetOrchestratorPath = path.resolve("src/components/Viewfinder/AssetOrchestrator.tsx");
const agenticChatPath = path.resolve("src/components/Viewfinder/AgenticChat.tsx");
const interrogatorOverlayPath = path.resolve("src/components/Viewfinder/InterrogatorOverlay.tsx");
const generateRoutePath = path.resolve("src/app/api/generate/route.ts");
const proPageSource = fs.readFileSync(proPagePath, "utf8");
const timelineEditorSource = fs.readFileSync(timelineEditorPath, "utf8");
const imageIngestionSource = fs.readFileSync(imageIngestionPath, "utf8");
const assetOrchestratorSource = fs.readFileSync(assetOrchestratorPath, "utf8");
const agenticChatSource = fs.readFileSync(agenticChatPath, "utf8");
const interrogatorOverlaySource = fs.readFileSync(interrogatorOverlayPath, "utf8");
const generateRouteSource = fs.readFileSync(generateRoutePath, "utf8");

assert.match(proPageSource, /data-testid="pro-experimental-truth-banner"/, "expected /pro truth banner test id");
assert.match(proPageSource, /Experimental \/pro sandbox/i, "expected explicit experimental \/pro truth copy");
assert.match(proPageSource, /mock/i, "expected /pro page to describe mocked behavior");
assert.match(proPageSource, /Gauset Pro Experimental/i, "expected /pro title to stay explicitly experimental");
assert.doesNotMatch(proPageSource, /\bVeo\b/i, "expected /pro page to stop implying a named live provider");
assert.match(timelineEditorSource, /Run experimental render/i, "expected timeline CTA to stay explicitly experimental");
assert.doesNotMatch(timelineEditorSource, /\bVeo\b/i, "expected timeline CTA to stop implying a named live provider");
assert.match(imageIngestionSource, /preview fixture/i, "expected image ingestion copy to name the preview fixture");
assert.doesNotMatch(imageIngestionSource, /fully functional/i, "expected image ingestion flow to avoid live-provider theater");
assert.match(assetOrchestratorSource, /preview fixtures?/i, "expected asset orchestrator copy to name preview fixtures");
assert.match(agenticChatSource, /do not call a live provider/i, "expected agentic chat banner to disclaim live-provider use");
assert.match(interrogatorOverlaySource, /does not call a live provider/i, "expected interrogator overlay banner to disclaim live-provider use");
assert.doesNotMatch(interrogatorOverlaySource, /AWS POC Live/i, "expected interrogator overlay to stop implying a live provider");

assert.match(generateRouteSource, /mode:\s*"experimental_mock"/, "expected explicit experimental mode in API contract");
assert.match(generateRouteSource, /experimental:\s*true/, "expected explicit experimental marker in API contract");
assert.match(generateRouteSource, /liveProvider:\s*false/, "expected liveProvider=false in API contract");
assert.match(generateRouteSource, /Experimental mock render preview/i, "expected truth label to mention mocked behavior");
assert.match(generateRouteSource, /x-gauset-experimental":\s*"1"/, "expected experimental response header");
assert.match(generateRouteSource, /x-gauset-live-provider":\s*"0"/, "expected live-provider response header");
assert.match(generateRouteSource, /pathData/, "expected route to read recorded path data");
assert.match(generateRouteSource, /frameCount/, "expected route to use recorded path data meaningfully");
assert.match(generateRouteSource, /must be a non-empty array of recorded camera frames/i, "expected route to reject malformed path data explicitly");
assert.doesNotMatch(generateRouteSource, /\bVEO_API_ENDPOINT\b|\bGoogle Veo\b|\bVertex AI\b/i, "expected route to stop implying a named live provider integration");

async function invokeGenerate(body: unknown) {
    const response = await POST(
        new Request("http://localhost/api/generate", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        }),
    );
    const payload = (await response.json()) as Record<string, unknown>;
    return { response, payload };
}

const missingPath = await invokeGenerate({ prompt: "Test prompt" });
assert.equal(missingPath.response.status, 400);
assert.equal(missingPath.response.headers.get("x-gauset-experimental"), "1");
assert.equal(missingPath.response.headers.get("x-gauset-live-provider"), "0");
assert.equal(missingPath.payload.error, "Recorded camera path data must be a non-empty array of recorded camera frames.");
assert.equal(missingPath.payload.success, false);
assert.equal(missingPath.payload.mode, "experimental_mock");
assert.equal(missingPath.payload.experimental, true);
assert.equal(missingPath.payload.liveProvider, false);
assert.match(String(missingPath.payload.truthLabel ?? ""), /rejected invalid camera path data/i);

const malformedPath = await invokeGenerate({
    prompt: "Test prompt",
    pathData: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0] }],
});
assert.equal(malformedPath.response.status, 400);
assert.equal(malformedPath.payload.error, "Recorded camera path data must be a non-empty array of recorded camera frames.");
assert.equal(malformedPath.payload.success, false);
assert.match(String(malformedPath.payload.truthLabel ?? ""), /rejected invalid camera path data/i);

const blankPrompt = await invokeGenerate({
    prompt: "   ",
    pathData: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }],
});
assert.equal(blankPrompt.response.status, 400);
assert.equal(blankPrompt.payload.error, "Prompt is required");

const success = await invokeGenerate({
    prompt: "Test prompt",
    pathData: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }],
    baseVideo: null,
});
assert.equal(success.response.status, 200);
assert.equal(success.response.headers.get("x-gauset-experimental"), "1");
assert.equal(success.response.headers.get("x-gauset-live-provider"), "0");
assert.equal(success.payload.success, true);
assert.equal(success.payload.mode, "experimental_mock");
assert.equal(success.payload.experimental, true);
assert.equal(success.payload.liveProvider, false);
assert.equal(success.payload.provider, "gauset_mock_render_preview");
assert.equal((success.payload.pathSummary as { frameCount?: number } | undefined)?.frameCount, 1);
assert.match(String(success.payload.truthLabel ?? ""), /did not call a live provider/i);

console.log(
    JSON.stringify(
        {
            status: "ok",
            page: proPagePath,
            timeline: timelineEditorPath,
            imageIngestion: imageIngestionPath,
            assetOrchestrator: assetOrchestratorPath,
            agenticChat: agenticChatPath,
            interrogatorOverlay: interrogatorOverlayPath,
            route: generateRoutePath,
        },
        null,
        2,
    ),
);
