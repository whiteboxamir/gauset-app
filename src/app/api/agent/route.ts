import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { query, annotations } = await req.json();

        if (!query) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }

        // Simulate Agentic NLP processing
        console.log(`[AGENT LAYER] Instructed: "${query}"`);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const q = query.toLowerCase();

        // 1. Directing / Camera Movement Actions
        if (q.includes("fly") || q.includes("move") || q.includes("pan") || q.includes("door") || q.includes("rig")) {
            // Very basic mock logic: if they mention an annotation type, fly to it.
            let targetId = annotations?.[0]?.id || null;
            let targetPos = annotations?.[0]?.position || [0, 0, 0];

            if (q.includes("door") || q.includes("exit") || q.includes("egress")) {
                const egress = annotations.find((a: any) => a.type === "egress");
                if (egress) { targetId = egress.id; targetPos = egress.position; }
            } else if (q.includes("rig") || q.includes("light")) {
                const light = annotations.find((a: any) => a.type === "lighting");
                if (light) { targetId = light.id; targetPos = light.position; }
            }

            return NextResponse.json({
                success: true,
                action: "moveCamera",
                target: targetPos,
                message: `Agent executing camera trajectory towards target ${targetId ? `[PIN-${targetId}]` : 'origin'}.`
            });
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
                message: `Agent updating global illumination envelope to preset: ${preset.toUpperCase()}.`
            });
        }

        // 3. Generative Prop Insertion (Mock Gen-API)
        if (q.includes("generate") || q.includes("create") || q.includes("spawn") || q.includes("make") || q.includes("add")) {
            let targetId = annotations?.[0]?.id || null;
            let targetPos = annotations?.[0]?.position || [0, 0, 0];
            // Provide a mock Gen-AI obj (we'll just use a generic GLB from a public bucket for the demo)
            const mockGlbUrl = "https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/macbook/model.gltf";

            return NextResponse.json({
                success: true,
                action: "generateProp",
                target: targetPos,
                assetUrl: mockGlbUrl,
                message: `Initiating Gen-3D API Protocol. Synthesizing asset and instantiating prop into Scene Graph at [${targetPos.x?.toFixed(2) || 0}, ${targetPos.y?.toFixed(2) || 0}, ${targetPos.z?.toFixed(2) || 0}].`
            });
        }

        // 4. Dynamic Shaders (Post-Processing)
        if (q.includes("vhs") || q.includes("80s") || q.includes("retro") || q.includes("tape")) {
            return NextResponse.json({
                success: true,
                action: "setPostProcessing",
                preset: "vhs",
                message: "Applying 80s VHS Node Graph (Chromatic Aberration, Noise, Scanlines)."
            });
        }

        if (q.includes("dream") || q.includes("soft") || q.includes("bloom")) {
            return NextResponse.json({
                success: true,
                action: "setPostProcessing",
                preset: "dreamy",
                message: "Applying Dreamy Look-Dev Node Graph (Heavy Bloom, Depth of Field)."
            });
        }

        if (q.includes("cyberpunk") || q.includes("neon") || q.includes("hacker")) {
            return NextResponse.json({
                success: true,
                action: "setPostProcessing",
                preset: "cyberpunk",
                message: "Applying Cyberpunk Node Graph (Glitch, High Contrast, Neon Bloom)."
            });
        }

        // 5. Spatial Interrogation (Fallback Semantic reasoning)
        let responseText = "I've analyzed the semantic spatial volume. No actionable directives found.";

        if (q.includes("change") || q.includes("delta")) {
            responseText = "Comparing the semantic representation from last week's commit against the current view: I detect a 14% delta. The main lighting rig has been repositioned.";
        } else if (q.includes("scale") || q.includes("size")) {
            responseText = "The bounding box of the active splat implies an interior volume roughly 40m x 25m x 12m.";
        } else if (annotations && annotations.length > 0) {
            responseText = `I see ${annotations.length} semantic pins in the scene. ` + annotations.map((a: any) => `A [${a.type}] pin exists at coordinates (${a.position.x.toFixed(1)}, ${a.position.y.toFixed(1)}, ${a.position.z.toFixed(1)}).`).join(" ");
        }

        return NextResponse.json({
            success: true,
            action: "answerQuery",
            message: responseText,
        });

    } catch (error: any) {
        console.error("Error in AI Agent API:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
