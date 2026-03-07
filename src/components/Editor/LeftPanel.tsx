"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Box, CheckCircle2, Clock3, Cpu, ImageIcon, Loader2, ShieldCheck, Upload } from "lucide-react";
import { extractApiError, MVP_API_BASE_URL, toProxyUrl } from "@/lib/mvp-api";

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 120_000;

type JobStatus = "processing" | "completed" | "failed";
type BackendMode = "checking" | "ready" | "degraded" | "offline";

interface UploadResponse {
    image_id: string;
    filename: string;
    filepath: string;
    url?: string;
}

interface GenerateResponse {
    job_id?: string;
    scene_id?: string;
    asset_id?: string;
    status: JobStatus;
    urls?: Record<string, string>;
}

interface JobStatusResponse {
    id: string;
    type: "environment" | "asset";
    status: JobStatus;
    error?: string | null;
    image_id?: string;
    created_at?: string;
    updated_at?: string;
    result?: {
        scene_id?: string;
        asset_id?: string;
        files?: Record<string, string>;
        urls?: Record<string, string>;
    } | null;
}

interface SetupStatusResponse {
    status: string;
    python_version?: string;
    models?: {
        ml_sharp?: boolean;
        triposr?: boolean;
    };
    directories?: {
        uploads?: boolean;
        assets?: boolean;
        scenes?: boolean;
    };
    torch?: {
        installed?: boolean;
        version?: string | null;
        mps_available?: boolean;
        error?: string;
    };
}

interface LeftPanelProps {
    setActiveScene: (sceneId: string | null) => void;
    setSceneGraph: React.Dispatch<React.SetStateAction<any>>;
    setAssetsList: React.Dispatch<React.SetStateAction<any[]>>;
}

interface JobRecord {
    id: string;
    type: "environment" | "asset";
    imageId: string;
    label: string;
    status: JobStatus;
    createdAt: string;
    updatedAt: string;
    error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const defaultEnvironmentUrls = (sceneId: string) => ({
    splats: `/storage/scenes/${sceneId}/environment/splats.ply`,
    cameras: `/storage/scenes/${sceneId}/environment/cameras.json`,
    metadata: `/storage/scenes/${sceneId}/environment/metadata.json`,
});

const defaultAssetUrls = (assetId: string) => ({
    mesh: `/storage/assets/${assetId}/mesh.glb`,
    texture: `/storage/assets/${assetId}/texture.png`,
    preview: `/storage/assets/${assetId}/preview.png`,
});

async function pollJob(jobId: string): Promise<JobStatusResponse> {
    const start = Date.now();

    while (Date.now() - start < POLL_TIMEOUT_MS) {
        const response = await fetch(`${MVP_API_BASE_URL}/jobs/${jobId}`);
        if (!response.ok) {
            throw new Error(await extractApiError(response, `Job polling failed (${response.status})`));
        }

        const payload = (await response.json()) as JobStatusResponse;
        if (payload.status === "completed" || payload.status === "failed") {
            return payload;
        }

        await sleep(POLL_INTERVAL_MS);
    }

    throw new Error("Timed out waiting for generation job to finish.");
}

export default function LeftPanel({ setActiveScene, setSceneGraph, setAssetsList }: LeftPanelProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isGeneratingEnv, setIsGeneratingEnv] = useState(false);
    const [isGeneratingAsset, setIsGeneratingAsset] = useState(false);
    const [uploadInfo, setUploadInfo] = useState<UploadResponse | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [statusText, setStatusText] = useState<string>("");
    const [errorText, setErrorText] = useState<string>("");
    const [backendMode, setBackendMode] = useState<BackendMode>("checking");
    const [backendMessage, setBackendMessage] = useState("Checking local backend...");
    const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);
    const [jobs, setJobs] = useState<JobRecord[]>([]);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    useEffect(() => {
        let cancelled = false;

        const loadSetupStatus = async () => {
            setBackendMode("checking");
            setBackendMessage("Checking local backend...");
            try {
                const response = await fetch(`${MVP_API_BASE_URL}/setup/status`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(await extractApiError(response, `Backend setup check failed (${response.status})`));
                }

                const payload = (await response.json()) as SetupStatusResponse;
                if (cancelled) return;

                setSetupStatus(payload);
                const modelsReady = Boolean(payload.models?.ml_sharp) && Boolean(payload.models?.triposr);
                const gpuReady = Boolean(payload.torch?.mps_available);
                const directoriesReady = Object.values(payload.directories ?? {}).every(Boolean);
                const mode: BackendMode = modelsReady && gpuReady && directoriesReady ? "ready" : "degraded";
                setBackendMode(mode);
                setBackendMessage(
                    mode === "ready"
                        ? "Local backend connected. Upload and generation are ready."
                        : "Backend is reachable, but setup is incomplete. Generation may be limited until the missing pieces are fixed.",
                );
            } catch (error) {
                if (cancelled) return;
                setSetupStatus(null);
                setBackendMode("offline");
                setBackendMessage(error instanceof Error ? error.message : "Local backend is unavailable.");
            }
        };

        void loadSetupStatus();
        return () => {
            cancelled = true;
        };
    }, []);

    const triggerFilePicker = () => {
        if (backendMode === "offline") return;
        fileInputRef.current?.click();
    };

    const upsertJob = (job: JobRecord) => {
        setJobs((prev) => {
            const next = [...prev];
            const index = next.findIndex((item) => item.id === job.id);
            if (index >= 0) {
                next[index] = { ...next[index], ...job };
            } else {
                next.unshift(job);
            }
            return next
                .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
                .slice(0, 8);
        });
    };

    const findActiveJob = (type: "environment" | "asset", imageId: string) =>
        jobs.find((job) => job.type === type && job.imageId === imageId && job.status === "processing");

    const formatJobTime = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "just now";
        return date.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setErrorText("");
        setStatusText("");
        setIsUploading(true);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(URL.createObjectURL(file));

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(`${MVP_API_BASE_URL}/upload`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(await extractApiError(response, `Upload failed (${response.status})`));
            }

            const payload = (await response.json()) as UploadResponse;
            setUploadInfo(payload);
            setStatusText(`Uploaded ${payload.filename}`);
        } catch (error) {
            setUploadInfo(null);
            setErrorText(error instanceof Error ? error.message : "Upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    const generateEnvironment = async () => {
        if (!uploadInfo) return;
        const existingJob = findActiveJob("environment", uploadInfo.image_id);
        if (existingJob) {
            setStatusText(`Environment already running: ${existingJob.id}`);
            return;
        }
        setIsGeneratingEnv(true);
        setErrorText("");
        setStatusText("Generating environment...");

        try {
            const response = await fetch(`${MVP_API_BASE_URL}/generate/environment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_id: uploadInfo.image_id }),
            });
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Environment generation failed (${response.status})`));
            }

            const payload = (await response.json()) as GenerateResponse;
            const jobId = payload.job_id ?? payload.scene_id;
            if (!jobId) {
                throw new Error("Missing job id from environment generation response.");
            }

            upsertJob({
                id: jobId,
                type: "environment",
                imageId: uploadInfo.image_id,
                label: uploadInfo.filename,
                status: "processing",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            const finalJob = await pollJob(jobId);
            upsertJob({
                id: jobId,
                type: "environment",
                imageId: uploadInfo.image_id,
                label: uploadInfo.filename,
                status: finalJob.status,
                createdAt: finalJob.created_at ?? new Date().toISOString(),
                updatedAt: finalJob.updated_at ?? new Date().toISOString(),
                error: finalJob.error ?? undefined,
            });
            if (finalJob.status === "failed") {
                throw new Error(finalJob.error || "Environment generation failed.");
            }

            const sceneId = finalJob.result?.scene_id ?? payload.scene_id ?? jobId;
            const fallbackUrls = defaultEnvironmentUrls(sceneId);
            const urls = {
                splats: toProxyUrl(finalJob.result?.urls?.splats ?? payload.urls?.splats ?? fallbackUrls.splats),
                cameras: toProxyUrl(finalJob.result?.urls?.cameras ?? payload.urls?.cameras ?? fallbackUrls.cameras),
                metadata: toProxyUrl(finalJob.result?.urls?.metadata ?? payload.urls?.metadata ?? fallbackUrls.metadata),
            };

            setSceneGraph((prev: any) => ({
                ...prev,
                environment: {
                    id: sceneId,
                    urls,
                    files: finalJob.result?.files ?? null,
                },
            }));
            setActiveScene(sceneId);
            setStatusText(`Environment ready: ${sceneId}`);
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Environment generation failed.");
        } finally {
            setIsGeneratingEnv(false);
        }
    };

    const generateAsset = async () => {
        if (!uploadInfo) return;
        const existingJob = findActiveJob("asset", uploadInfo.image_id);
        if (existingJob) {
            setStatusText(`Asset already running: ${existingJob.id}`);
            return;
        }
        setIsGeneratingAsset(true);
        setErrorText("");
        setStatusText("Generating asset...");

        try {
            const response = await fetch(`${MVP_API_BASE_URL}/generate/asset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_id: uploadInfo.image_id }),
            });
            if (!response.ok) {
                throw new Error(await extractApiError(response, `Asset generation failed (${response.status})`));
            }

            const payload = (await response.json()) as GenerateResponse;
            const jobId = payload.job_id ?? payload.asset_id;
            if (!jobId) {
                throw new Error("Missing job id from asset generation response.");
            }

            upsertJob({
                id: jobId,
                type: "asset",
                imageId: uploadInfo.image_id,
                label: uploadInfo.filename,
                status: "processing",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            const finalJob = await pollJob(jobId);
            upsertJob({
                id: jobId,
                type: "asset",
                imageId: uploadInfo.image_id,
                label: uploadInfo.filename,
                status: finalJob.status,
                createdAt: finalJob.created_at ?? new Date().toISOString(),
                updatedAt: finalJob.updated_at ?? new Date().toISOString(),
                error: finalJob.error ?? undefined,
            });
            if (finalJob.status === "failed") {
                throw new Error(finalJob.error || "Asset generation failed.");
            }

            const assetId = finalJob.result?.asset_id ?? payload.asset_id ?? jobId;
            const fallbackUrls = defaultAssetUrls(assetId);
            const urls = {
                mesh: toProxyUrl(finalJob.result?.urls?.mesh ?? payload.urls?.mesh ?? fallbackUrls.mesh),
                texture: toProxyUrl(finalJob.result?.urls?.texture ?? payload.urls?.texture ?? fallbackUrls.texture),
                preview: toProxyUrl(finalJob.result?.urls?.preview ?? payload.urls?.preview ?? fallbackUrls.preview),
            };

            const newAsset = {
                id: assetId,
                name: assetId,
                mesh: urls.mesh,
                texture: urls.texture,
                preview: urls.preview,
                instanceId: `inst_${Date.now()}`,
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
            };
            setAssetsList((prev: any[]) => [...prev, newAsset]);
            setStatusText(`Asset ready: ${assetId}`);
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Asset generation failed.");
        } finally {
            setIsGeneratingAsset(false);
        }
    };

    const backendCardClassName =
        backendMode === "ready"
            ? "border-emerald-900/40 bg-emerald-950/20"
            : backendMode === "degraded"
              ? "border-amber-900/40 bg-amber-950/20"
              : backendMode === "offline"
                ? "border-rose-900/40 bg-rose-950/20"
                : "border-neutral-800 bg-neutral-900/60";

    return (
        <div className="flex flex-col h-full p-6 text-neutral-300 overflow-y-auto">
            <h2 className="text-xl font-bold mb-6 text-white tracking-tight">Gauset Generator</h2>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleUpload}
            />

            <div className={`mb-5 rounded-2xl border px-4 py-4 ${backendCardClassName}`}>
                <div className="flex items-start gap-3">
                    {backendMode === "ready" ? (
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
                    ) : backendMode === "offline" ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
                    ) : backendMode === "degraded" ? (
                        <Cpu className="mt-0.5 h-5 w-5 text-amber-200" />
                    ) : (
                        <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-neutral-400" />
                    )}
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Local Backend</p>
                        <p className="mt-1 text-sm text-white">
                            {backendMode === "ready"
                                ? "Connected"
                                : backendMode === "degraded"
                                  ? "Needs Attention"
                                  : backendMode === "offline"
                                    ? "Unavailable"
                                    : "Checking"}
                        </p>
                        <p className="mt-2 text-xs text-neutral-400 whitespace-pre-wrap">{backendMessage}</p>
                    </div>
                </div>

                {setupStatus && (
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                        <div className="rounded-lg bg-black/20 px-3 py-2 border border-neutral-800">
                            Python {setupStatus.python_version ?? "unknown"}
                        </div>
                        <div className="rounded-lg bg-black/20 px-3 py-2 border border-neutral-800">
                            MPS {setupStatus.torch?.mps_available ? "Ready" : "Unavailable"}
                        </div>
                        <div className="rounded-lg bg-black/20 px-3 py-2 border border-neutral-800">
                            ML-Sharp {setupStatus.models?.ml_sharp ? "Installed" : "Missing"}
                        </div>
                        <div className="rounded-lg bg-black/20 px-3 py-2 border border-neutral-800">
                            TripoSR {setupStatus.models?.triposr ? "Installed" : "Missing"}
                        </div>
                    </div>
                )}
            </div>

            <div
                className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-all group ${
                    backendMode === "offline"
                        ? "border-neutral-800 bg-neutral-950/70 cursor-not-allowed opacity-70"
                        : "border-neutral-700/50 hover:border-blue-500/50 hover:bg-neutral-900 cursor-pointer"
                }`}
                onClick={triggerFilePicker}
            >
                {isUploading ? (
                    <Loader2 className="mx-auto h-8 w-8 mb-3 text-blue-500 animate-spin" />
                ) : (
                    <Upload className="mx-auto h-8 w-8 mb-3 text-neutral-500 group-hover:text-blue-400 transition-colors" />
                )}
                <p className="text-sm font-medium group-hover:text-blue-100">
                    {backendMode === "offline" ? "Backend Required" : isUploading ? "Uploading..." : "Upload Photo"}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                    {backendMode === "offline"
                        ? "Connect the local FastAPI backend first"
                        : "PNG, JPG up to 10MB"}
                </p>
            </div>

            {statusText && <p className="text-xs text-emerald-400 mb-4 whitespace-pre-wrap">{statusText}</p>}
            {errorText && <p className="text-xs text-rose-400 mb-4 whitespace-pre-wrap">{errorText}</p>}

            {uploadInfo ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-8">
                    <div className="bg-neutral-900 rounded-lg p-4 flex gap-4 items-center border border-neutral-800">
                        <div
                            className="w-12 h-12 bg-gradient-to-tr from-neutral-800 to-neutral-700 rounded object-cover bg-cover bg-center shadow-inner"
                            style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
                        />
                        <div className="flex-1 text-sm min-w-0">
                            <p className="font-semibold text-white">Ready for Generation</p>
                            <p className="text-xs text-neutral-400 truncate">{uploadInfo.filename}</p>
                        </div>
                    </div>

                    <button
                        onClick={generateEnvironment}
                        disabled={isGeneratingEnv || isGeneratingAsset || backendMode === "offline"}
                        className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:hover:bg-emerald-600 shadow-lg shadow-emerald-900/20"
                    >
                        {isGeneratingEnv ? <Loader2 className="animate-spin h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                        {isGeneratingEnv ? "Generating Environment..." : "Generate Environment"}
                    </button>

                    <button
                        onClick={generateAsset}
                        disabled={isGeneratingEnv || isGeneratingAsset || backendMode === "offline"}
                        className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:hover:bg-blue-600 shadow-lg shadow-blue-900/20"
                    >
                        {isGeneratingAsset ? <Loader2 className="animate-spin h-5 w-5" /> : <Box className="h-5 w-5" />}
                        {isGeneratingAsset ? "Generating Asset..." : "Generate Asset"}
                    </button>
                </div>
            ) : (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-500">
                    Start with a single reference photo. Gauset will route it into an environment build or an asset build once the local backend is healthy.
                </div>
            )}

            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-neutral-500 uppercase tracking-[0.18em]">
                    <Clock3 className="h-3 w-3" />
                    Job Center
                </div>
                {jobs.length > 0 ? (
                    <div className="space-y-2">
                        {jobs.map((job) => (
                            <div key={job.id} className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs text-white truncate">
                                            {job.type === "environment" ? "Environment" : "Asset"} · {job.label}
                                        </p>
                                        <p className="text-[11px] text-neutral-500 font-mono truncate">{job.id}</p>
                                    </div>
                                    <div className="shrink-0">
                                        {job.status === "processing" ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                                        ) : job.status === "completed" ? (
                                            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                                        ) : (
                                            <AlertTriangle className="h-4 w-4 text-rose-300" />
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
                                    <span>{job.status}</span>
                                    <span>{formatJobTime(job.updatedAt)}</span>
                                </div>
                                {job.error && <p className="mt-2 text-[11px] text-rose-300 whitespace-pre-wrap">{job.error}</p>}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-neutral-600">
                        Generation jobs will appear here with a canonical status trail instead of a single transient message.
                    </p>
                )}
            </div>
        </div>
    );
}
