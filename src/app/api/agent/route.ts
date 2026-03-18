import { NextResponse } from "next/server";

function buildExperimentalMockHeaders() {
    return {
        "x-gauset-experimental": "1",
        "x-gauset-live-provider": "0",
    };
}

function buildExperimentalMockEnvelope(message: string) {
    return {
        mode: "experimental_mock",
        experimental: true,
        liveProvider: false,
        message,
    };
}

function formatTargetPosition(target: unknown) {
    if (!Array.isArray(target) || target.length < 3) {
        return "[0.00, 0.00, 0.00]";
    }

    const values = target.slice(0, 3).map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : 0));
    return `[${values[0].toFixed(2)}, ${values[1].toFixed(2)}, ${values[2].toFixed(2)}]`;
}

export async function POST(req: Request) {
    try {
        const { query, annotations } = await req.json();
        const annotationList = Array.isArray(annotations) ? annotations : [];

        if (!query) {
            return NextResponse.json({ error: "Query is required" }, { status: 400, headers: buildExperimentalMockHeaders() });
        }

        // Simulate Agentic NLP processing
        console.log(`[AGENT LAYER] Instructed: "${query}"`);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const q = query.toLowerCase();

        // 1. Directing / Camera Movement Actions
        if (q.includes("fly") || q.includes("move") || q.includes("pan") || q.includes("door") || q.includes("rig")) {
            // Very basic mock logic: if they mention an annotation type, fly to it.
            let targetId = annotationList[0]?.id || null;
            let targetPos = annotationList[0]?.position || [0, 0, 0];

            if (q.includes("door") || q.includes("exit") || q.includes("egress")) {
                const egress = annotationList.find((a: any) => a.type === "egress");
                if (egress) { targetId = egress.id; targetPos = egress.position; }
            } else if (q.includes("rig") || q.includes("light")) {
                const light = annotationList.find((a: any) => a.type === "lighting");
                if (light) { targetId = light.id; targetPos = light.position; }
            }

            return NextResponse.json({
                success: true,
                action: "moveCamera",
                target: targetPos,
                ...buildExperimentalMockEnvelope(
                    `Experimental /pro agent mock is executing a simulated camera trajectory towards target ${targetId ? `[PIN-${targetId}]` : "origin"}.`,
                ),
            }, { headers: buildExperimentalMockHeaders() });
        }

        // 2. Lighting / Environment Changes
        if (q.includes("lighting") || q.includes("mood") || q.includes("sunset") || q.includes("studio") || q.includes("natural") || q.includes("cinematic")) {
            let preset = "cinematic";
            if (q.includes("studio")) preset = "studio";
            if (q.includes("natural") || q.includes("sunset")) preset = "natural";

            return NextResponse.json({
                success: true,
                action: "changeLighting",
                preset: preset,
                ...buildExperimentalMockEnvelope(
                    `Experimental /pro agent mock updated the lighting preset to ${preset.toUpperCase()} without calling a production orchestration service.`,
                ),
            }, { headers: buildExperimentalMockHeaders() });
        }

        // 3. Generative Prop Insertion (Mock Gen-API)
        if (q.includes("generate") || q.includes("create") || q.includes("spawn") || q.includes("make") || q.includes("add")) {
            let targetId = annotationList[0]?.id || null;
            let targetPos = annotationList[0]?.position || [0, 0, 0];
            // Provide a mock Gen-AI obj (we'll just use a generic GLB from a public bucket for the demo)
            const mockGlbUrl = "https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/macbook/model.gltf";

            return NextResponse.json({
                success: true,
                action: "generateProp",
                target: targetPos,
                assetUrl: mockGlbUrl,
                ...buildExperimentalMockEnvelope(
                    `Experimental /pro agent mock synthesized a placeholder prop for target ${targetId ? `[PIN-${targetId}]` : "origin"} at ${formatTargetPosition(targetPos)}.`,
                ),
            }, { headers: buildExperimentalMockHeaders() });
        }

        // 4. Dynamic Shaders (Post-Processing)
        if (q.includes("vhs") || q.includes("80s") || q.includes("retro") || q.includes("tape")) {
            return NextResponse.json({
                success: true,
                action: "setPostProcessing",
                preset: "vhs",
                ...buildExperimentalMockEnvelope("Experimental /pro agent mock applied the VHS look preset locally."),
            }, { headers: buildExperimentalMockHeaders() });
        }

        if (q.includes("dream") || q.includes("soft") || q.includes("bloom")) {
            return NextResponse.json({
                success: true,
                action: "setPostProcessing",
                preset: "dreamy",
                ...buildExperimentalMockEnvelope("Experimental /pro agent mock applied the dreamy look preset locally."),
            }, { headers: buildExperimentalMockHeaders() });
        }

        if (q.includes("cyberpunk") || q.includes("neon") || q.includes("hacker")) {
            return NextResponse.json({
                success: true,
                action: "setPostProcessing",
                preset: "cyberpunk",
                ...buildExperimentalMockEnvelope("Experimental /pro agent mock applied the cyberpunk look preset locally."),
            }, { headers: buildExperimentalMockHeaders() });
        }

        // 5. Spatial Interrogation (Fallback Semantic reasoning)
        let responseText = "I've analyzed the semantic spatial volume. No actionable directives found.";

        if (q.includes("change") || q.includes("delta")) {
            responseText = "Comparing the semantic representation from last week's commit against the current view: I detect a 14% delta. The main lighting rig has been repositioned.";
        } else if (q.includes("scale") || q.includes("size")) {
            responseText = "The bounding box of the active splat implies an interior volume roughly 40m x 25m x 12m.";
        } else if (annotationList.length > 0) {
            responseText =
                `I see ${annotationList.length} semantic pins in the scene. ` +
                annotationList
                    .map((a: any) => `A [${a.type}] pin exists at ${formatTargetPosition(a.position)}.`)
                    .join(" ");
        }

        return NextResponse.json({
            success: true,
            action: "answerQuery",
            ...buildExperimentalMockEnvelope(
                `${responseText} This /pro agent route is experimental and does not represent the production world-ingest workflow.`,
            ),
        }, { headers: buildExperimentalMockHeaders() });

    } catch (error: any) {
        console.error("Error in AI Agent API:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500, headers: buildExperimentalMockHeaders() });
    }
}
