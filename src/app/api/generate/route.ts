import { NextResponse } from "next/server.js";

type GenerateRequestBody = {
    prompt?: string;
    pathData?: unknown;
    baseVideo?: string | null;
};

type RecordedPathFrame = {
    time: number;
    position: [number, number, number];
    rotation: [number, number, number, number];
};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isRecordedPathFrame(value: unknown): value is RecordedPathFrame {
    if (!value || typeof value !== "object") {
        return false;
    }

    const frame = value as Partial<Record<string, unknown>>;
    return (
        isFiniteNumber(frame.time) &&
        Array.isArray(frame.position) &&
        frame.position.length === 3 &&
        frame.position.every(isFiniteNumber) &&
        Array.isArray(frame.rotation) &&
        frame.rotation.length === 4 &&
        frame.rotation.every(isFiniteNumber)
    );
}

function isRecordedPath(value: unknown): value is RecordedPathFrame[] {
    return Array.isArray(value) && value.length > 0 && value.every(isRecordedPathFrame);
}

function buildExperimentalMockHeaders() {
    return {
        "x-gauset-experimental": "1",
        "x-gauset-live-provider": "0",
    };
}

function buildExperimentalMockEnvelope(frameCount: number, truthLabel?: string) {
    return {
        mode: "experimental_mock",
        experimental: true,
        liveProvider: false,
        provider: "gauset_mock_render_preview",
        truthLabel:
            truthLabel ??
            `Experimental mock render preview. Consumed ${frameCount} recorded camera frames and did not call a live provider. Use /app/worlds for the production brief-to-world workflow.`,
    };
}

export async function POST(req: Request) {
    try {
        const { prompt, pathData, baseVideo } = (await req.json()) as GenerateRequestBody;
        const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : "";

        if (!normalizedPrompt) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        if (!isRecordedPath(pathData)) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Recorded camera path data must be a non-empty array of recorded camera frames.",
                    message: "The experimental mock render route only accepts captured frames with time, position, and rotation data.",
                    ...buildExperimentalMockEnvelope(0, "Experimental mock render route rejected invalid camera path data and did not call a live provider."),
                },
                { status: 400, headers: buildExperimentalMockHeaders() },
            );
        }

        const frameCount = pathData.length;
        const mockInputSummary = {
            promptLength: normalizedPrompt.length,
            frameCount,
            hasBaseVideo: Boolean(baseVideo),
        };

        console.log(
            "Experimental /api/generate mock render request:",
            JSON.stringify(mockInputSummary),
        );

        const mockGeneratedVideoUrl = "https://storage.googleapis.com/mux-demo-cdn/mux-video-demo.mp4";

        return NextResponse.json(
            {
                success: true,
                videoUrl: mockGeneratedVideoUrl,
                ...buildExperimentalMockEnvelope(frameCount),
                pathSummary: {
                    frameCount,
                },
                message: "Experimental mock render response returned. The route validated the captured path locally and returned a static preview clip instead of invoking a production video backend.",
            },
            {
                headers: buildExperimentalMockHeaders(),
            },
        );

    } catch (error: unknown) {
        console.error("Error in generate API:", error);
        const message = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
