import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import hostGuard from "./mvp_host_guard.cjs";
import { uploadStillFixtureToMvp } from "./mvp_upload_client.mjs";

const { assertPublicCertificationContext, assertPublicMvpBaseUrl } = hostGuard;

const BASE = assertPublicMvpBaseUrl(
  process.env.GAUSET_MVP_BASE_URL || "https://gauset.com",
  "scripts/hostile_public_audit.mjs base",
);
const STORAGE_BASE = assertPublicMvpBaseUrl(
  process.env.GAUSET_MVP_STORAGE_BASE_URL || BASE,
  "scripts/hostile_public_audit.mjs storage base",
);
const FIXTURE_DIR = path.resolve("tests/fixtures/public-scenes");
const { artifactDir, runLabel } = assertPublicCertificationContext("scripts/hostile_public_audit.mjs");
const REPORT_PATH = path.resolve(artifactDir, "hostile-audit-report.json");
const ACTOR_LABEL = `Codex ${runLabel}`;

const WAVES = [
  { name: "desert", file: "01-desert-dunes.png" },
  { name: "island", file: "02-island-lagoon.png" },
  { name: "streets", file: "03-neon-streets.png" },
  { name: "canyon", file: "04-canyon-overlook.png" },
  { name: "snow", file: "05-alpine-snow.png" },
  { name: "forest", file: "06-forest-trail.png" },
  { name: "harbor", file: "07-harbor-docks.png" },
  { name: "market", file: "08-market-plaza.png" },
  { name: "night", file: "09-night-city.png" },
  { name: "cliffs", file: "10-seaside-cliffs.png" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { response, payload };
}

function resolveStorageUrl(relativePath) {
  if (!relativePath) return null;
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
    return relativePath;
  }
  if (relativePath.startsWith("/api/mvp")) {
    return new URL(relativePath, BASE).toString();
  }
  if (relativePath.startsWith("/storage/")) {
    return new URL(`/api/mvp${relativePath}`, BASE).toString();
  }
  if (relativePath.startsWith("/")) {
    return new URL(relativePath, BASE).toString();
  }
  return new URL(`/api/mvp/${relativePath}`, BASE).toString();
}

async function uploadFixture(filePath) {
  return uploadStillFixtureToMvp(BASE, filePath);
}

async function generateEnvironment(imageId) {
  const { response, payload } = await jsonFetch(`${BASE}/api/mvp/generate/environment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_id: imageId }),
  });
  if (!response.ok) {
    throw new Error(`generate failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function saveScene(sceneId, urls) {
  const { response, payload } = await jsonFetch(`${BASE}/api/mvp/scene/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scene_id: sceneId,
      source: "hostile_public_audit",
      scene_graph: {
        environment: {
          id: sceneId,
          urls,
        },
        assets: [],
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`scene save failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function upsertReview(sceneId) {
  const { response, payload } = await jsonFetch(`${BASE}/api/mvp/scene/${sceneId}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      metadata: {
        project_name: `Hostile Public Audit ${runLabel}`,
        scene_title: `World-Class Gate Audit ${runLabel}`,
        location_name: `Public Proxy ${runLabel}`,
        owner: ACTOR_LABEL,
        notes: `Automated public hostile audit review payload ${runLabel}.`,
      },
      approval_state: "draft",
      updated_by: ACTOR_LABEL,
      note: `Automated hostile audit touched this review (${runLabel}).`,
      issues: [],
    }),
  });
  if (!response.ok) {
    throw new Error(`review update failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postComment(sceneId, versionId, waveName) {
  const { response, payload } = await jsonFetch(`${BASE}/api/mvp/scene/${sceneId}/versions/${versionId}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      author: ACTOR_LABEL,
      body: `Hostile public audit comment for ${waveName} (${runLabel}).`,
      anchor: "scene",
    }),
  });
  if (!response.ok) {
    throw new Error(`comment create failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function reviewShellPresent(sceneId, versionId) {
  const url = new URL("/mvp/review", BASE);
  url.searchParams.set("scene", sceneId);
  url.searchParams.set("version", versionId);
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`review shell failed: ${response.status} ${body}`);
  }
  return /Persistent World Review|Read-only Scene Review/i.test(body);
}

async function pollJob(jobId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const { response, payload } = await jsonFetch(`${BASE}/api/mvp/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`job poll failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    if (payload.status === "completed" || payload.status === "failed") {
      return payload;
    }
    await sleep(1000);
  }
  throw new Error(`job timeout: ${jobId}`);
}

async function fetchJson(url) {
  const { response, payload } = await jsonFetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`json fetch failed: ${response.status} ${url} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { "accept-encoding": "identity" },
    cache: "no-store",
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`bytes fetch failed: ${response.status} ${url} ${bytes.toString("utf8")}`);
  }
  return bytes;
}

function hashBytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parsePly(bytes) {
  const headerMarker = Buffer.from("end_header\n");
  const headerMarkerCrlf = Buffer.from("end_header\r\n");
  let headerEndIndex = bytes.indexOf(headerMarker);
  let headerLength = headerEndIndex >= 0 ? headerEndIndex + headerMarker.length : -1;
  if (headerEndIndex < 0) {
    headerEndIndex = bytes.indexOf(headerMarkerCrlf);
    headerLength = headerEndIndex >= 0 ? headerEndIndex + headerMarkerCrlf.length : -1;
  }

  const headerText = headerLength > 0 ? bytes.subarray(0, headerLength).toString("latin1") : "";
  const lines = headerText.split(/\r?\n/).filter(Boolean);
  const vertexLine = lines.find((line) => line.startsWith("element vertex "));
  const formatLine = lines.find((line) => line.startsWith("format "));
  const vertexCount = vertexLine ? Number(vertexLine.split(" ").pop()) : 0;
  return {
    format: formatLine ? formatLine.split(" ")[1] : "unknown",
    vertexCount,
    byteLength: bytes.length,
    headerLength,
    sha256: hashBytes(bytes),
  };
}

function classify(metadata, cameras, ply, savedScene, review, comment, reviewReady) {
  const failures = [];
  if (metadata?.mode === "placeholder") {
    failures.push("metadata.mode=placeholder");
  }
  if (metadata?.execution_mode && metadata.execution_mode !== "real") {
    failures.push(`execution_mode=${metadata.execution_mode}`);
  }
  if (String(metadata?.model || "").toLowerCase().includes("mock")) {
    failures.push(`model=${metadata?.model}`);
  }
  if ((ply?.vertexCount || 0) <= 100000) {
    failures.push(`ply_vertex_count=${ply?.vertexCount ?? 0}`);
  }
  if ((ply?.byteLength || 0) <= 5000000) {
    failures.push(`ply_bytes=${ply?.byteLength ?? 0}`);
  }
  if ((ply?.headerLength || 0) <= 0) {
    failures.push("missing_ply_header");
  }
  if (!metadata?.lane_truth) {
    failures.push("missing_lane_truth");
  }
  if (!metadata?.reconstruction_status) {
    failures.push("missing_reconstruction_status");
  }
  if (!metadata?.release_gates || typeof metadata.release_gates !== "object") {
    failures.push("missing_release_gates");
  }
  if (metadata?.release_gates?.world_class_ready === true) {
    failures.push("preview_marked_world_class_ready");
  }
  if (!savedScene?.version_id) {
    failures.push("scene_not_saved");
  }
  if (!review?.approval || typeof review.approval !== "object") {
    failures.push("review_not_updated");
  }
  if (!comment?.comment?.comment_id) {
    failures.push("comment_not_created");
  }
  if (!reviewReady) {
    failures.push("review_shell_missing");
  }
  return failures;
}

async function main() {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });

  const report = {
    base: BASE,
    run_label: runLabel,
    storage_base: STORAGE_BASE,
    executed_at: new Date().toISOString(),
    summary: {
      waves: WAVES.length,
      passed_hostile_checks: 0,
      failed_hostile_checks: 0,
      unique_splats_sha256: 0,
      duplicate_splats_sha256: [],
    },
    waves: [],
  };

  for (const wave of WAVES) {
    const fixturePath = path.join(FIXTURE_DIR, wave.file);
    const startedAt = Date.now();
    const upload = await uploadFixture(fixturePath);
    const generation = await generateEnvironment(upload.payload.image_id);
    const job = await pollJob(generation.job_id);

    const metadataUrl = resolveStorageUrl(job.result?.urls?.metadata || `/storage/scenes/${job.result.scene_id}/environment/metadata.json`);
    const camerasUrl = resolveStorageUrl(job.result?.urls?.cameras || `/storage/scenes/${job.result.scene_id}/environment/cameras.json`);
    const splatsUrl = resolveStorageUrl(job.result?.urls?.splats || `/storage/scenes/${job.result.scene_id}/environment/splats.ply`);

    const metadata = await fetchJson(metadataUrl);
    const cameras = await fetchJson(camerasUrl);
    const splatsBytes = await fetchBytes(splatsUrl);
    const ply = parsePly(splatsBytes);
    const savedScene = await saveScene(job.result.scene_id, job.result?.urls || {});
    const review = await upsertReview(job.result.scene_id);
    const comment = await postComment(job.result.scene_id, savedScene.version_id, wave.name);
    const reviewReady = await reviewShellPresent(job.result.scene_id, savedScene.version_id);
    const failures = classify(metadata, cameras, ply, savedScene, review, comment, reviewReady);

    report.waves.push({
      name: wave.name,
      fixture: wave.file,
      image_id: upload.payload.image_id,
      upload_transport: upload.transport,
      scene_id: job.result.scene_id,
      duration_ms: Date.now() - startedAt,
      metadata,
      camera_count: Array.isArray(cameras) ? cameras.length : 0,
      ply,
      saved_version_id: savedScene.version_id,
      review_shell_present: reviewReady,
      hostile_failures: failures,
    });
  }

  const wavesByHash = new Map();
  for (const wave of report.waves) {
    const key = wave.ply.sha256;
    if (!wavesByHash.has(key)) {
      wavesByHash.set(key, []);
    }
    wavesByHash.get(key).push(wave.name);
  }

  const duplicateHashes = [];
  for (const [sha256, names] of wavesByHash.entries()) {
    if (names.length > 1) {
      duplicateHashes.push({ sha256, waves: names });
      for (const wave of report.waves) {
        if (wave.ply.sha256 === sha256) {
          wave.hostile_failures.push(`duplicate_splats_hash=${sha256.slice(0, 12)}`);
        }
      }
    }
  }

  report.summary.unique_splats_sha256 = wavesByHash.size;
  report.summary.duplicate_splats_sha256 = duplicateHashes;
  report.summary.passed_hostile_checks = report.waves.filter((wave) => wave.hostile_failures.length === 0).length;
  report.summary.failed_hostile_checks = report.waves.filter((wave) => wave.hostile_failures.length > 0).length;

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
