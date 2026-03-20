"use client";

import { useEffect, useRef } from "react";

import type { CameraPathFrame } from "@/lib/mvp-workspace";

interface UseViewerCameraPathRecorderOptions {
    isRecordingPath: boolean;
    getCurrentFrame: () => Omit<CameraPathFrame, "time"> | null;
    onPathRecorded?: (path: CameraPathFrame[]) => void;
    sampleIntervalMs?: number;
}

export function useViewerCameraPathRecorder({
    isRecordingPath,
    getCurrentFrame,
    onPathRecorded,
    sampleIntervalMs = 80,
}: UseViewerCameraPathRecorderOptions) {
    const getCurrentFrameRef = useRef(getCurrentFrame);
    const onPathRecordedRef = useRef(onPathRecorded);
    const pathRef = useRef<CameraPathFrame[]>([]);
    const recordingStartRef = useRef<number | null>(null);
    const lastSampleTimeRef = useRef<number | null>(null);
    const frameRequestRef = useRef<number | null>(null);

    useEffect(() => {
        getCurrentFrameRef.current = getCurrentFrame;
    }, [getCurrentFrame]);

    useEffect(() => {
        onPathRecordedRef.current = onPathRecorded;
    }, [onPathRecorded]);

    useEffect(() => {
        return () => {
            if (frameRequestRef.current !== null) {
                window.cancelAnimationFrame(frameRequestRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const cancelLoop = () => {
            if (frameRequestRef.current === null) {
                return;
            }

            window.cancelAnimationFrame(frameRequestRef.current);
            frameRequestRef.current = null;
        };

        const resetPath = () => {
            pathRef.current = [];
            recordingStartRef.current = null;
            lastSampleTimeRef.current = null;
        };

        const flushPath = () => {
            const nextPath = pathRef.current;
            resetPath();
            if (nextPath.length > 0) {
                onPathRecordedRef.current?.([...nextPath]);
            }
        };

        const recordFrame = (timestampMs: number) => {
            const frame = getCurrentFrameRef.current();
            if (!frame) {
                return;
            }

            if (recordingStartRef.current === null) {
                recordingStartRef.current = timestampMs;
            }

            if (
                lastSampleTimeRef.current !== null &&
                timestampMs - lastSampleTimeRef.current < sampleIntervalMs
            ) {
                return;
            }

            lastSampleTimeRef.current = timestampMs;
            pathRef.current.push({
                ...frame,
                time: Number(((timestampMs - recordingStartRef.current) / 1000).toFixed(3)),
            });
        };

        if (!isRecordingPath) {
            cancelLoop();
            flushPath();
            return;
        }

        resetPath();
        recordFrame(performance.now());

        const tick = (timestampMs: number) => {
            recordFrame(timestampMs);
            frameRequestRef.current = window.requestAnimationFrame(tick);
        };

        frameRequestRef.current = window.requestAnimationFrame(tick);

        return () => {
            cancelLoop();
            flushPath();
        };
    }, [isRecordingPath, sampleIntervalMs]);
}

export type ViewerCameraPathRecorder = ReturnType<typeof useViewerCameraPathRecorder>;
