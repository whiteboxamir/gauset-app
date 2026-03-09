import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const BASE = process.env.GAUSET_MVP_BASE_URL || "http://127.0.0.1:3015";
const FIXTURE_DIR = path.resolve("tests/fixtures/public-scenes");
const REPORT_PATH = path.resolve("test-results/local-reconstruction/hostile-audit-report.json");
const CAPTURE_FRAMES = Number(process.env.GAUSET_CAPTURE_FRAMES || "8");
const API_BASE = `${BASE}/api/mvp`;

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

async function uploadFixture(filePath, index) {
  const bytes = await fs.readFile(filePath);
  const formData = new FormData();
  formData.set("file", new Blob([bytes], { type: "image/png" }), `${path.parse(filePath).name}-${index + 1}.png`);
  const { response, payload } = await jsonFetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`upload failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function createCaptureSession() {
  const { response, payload } = await jsonFetch(`${API_BASE}/capture/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_images: CAPTURE_FRAMES }),
  });
  if (!response.ok) {
    throw new Error(`capture session failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function addCaptureFrames(sessionId, imageIds) {
  const { response, payload } = await jsonFetch(`${API_BASE}/capture/session/${sessionId}/frames`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_ids: imageIds }),
  });
  if (!response.ok) {
    throw new Error(`capture frame add failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function startReconstruction(sessionId) {
  const { response, payload } = await jsonFetch(`${API_BASE}/reconstruct/session/${sessionId}`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`reconstruction start failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function pollJob(jobId) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { response, payload } = await jsonFetch(`${API_BASE}/jobs/${jobId}`);
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

function classify(metadata, cameras, ply) {
  const failures = [];
  const qualityScore = Number(metadata?.quality?.score || 0);
  const alignmentScore = Number(metadata?.quality?.alignment?.score || 0);
  const poseSuccessRatio = Number(metadata?.quality?.alignment?.pose_success_ratio || 0);
  const averageInliers = Number(metadata?.quality?.alignment?.average_inliers || 0);
  const readiness = String(metadata?.delivery?.readiness || "");
  if (metadata?.lane !== "reconstruction") {
    failures.push(`lane=${metadata?.lane ?? "missing"}`);
  }
  if (metadata?.mode !== "hybrid_multiview") {
    failures.push(`mode=${metadata?.mode ?? "missing"}`);
  }
  if (metadata?.execution_mode !== "real") {
    failures.push(`execution_mode=${metadata?.execution_mode ?? "missing"}`);
  }
  if ((metadata?.frame_count || 0) < CAPTURE_FRAMES) {
    failures.push(`frame_count=${metadata?.frame_count ?? 0}`);
  }
  if (!Array.isArray(cameras) || cameras.length < CAPTURE_FRAMES) {
    failures.push(`camera_count=${Array.isArray(cameras) ? cameras.length : 0}`);
  }
  if ((ply?.vertexCount || 0) <= 100000) {
    failures.push(`ply_vertex_count=${ply?.vertexCount ?? 0}`);
  }
  if ((ply?.byteLength || 0) <= 5000000) {
    failures.push(`ply_bytes=${ply?.byteLength ?? 0}`);
  }
  if (ply?.format !== "binary_little_endian") {
    failures.push(`ply_format=${ply?.format ?? "unknown"}`);
  }
  if (qualityScore < 70) {
    failures.push(`quality_score=${qualityScore.toFixed(1)}`);
  }
  if (alignmentScore < 70) {
    failures.push(`alignment_score=${alignmentScore.toFixed(1)}`);
  }
  if (poseSuccessRatio < 0.6) {
    failures.push(`pose_success_ratio=${poseSuccessRatio.toFixed(3)}`);
  }
  if (averageInliers < 24) {
    failures.push(`average_inliers=${averageInliers.toFixed(1)}`);
  }
  if (readiness === "prototype" || readiness === "preview_only" || !readiness) {
    failures.push(`delivery_readiness=${readiness || "missing"}`);
  }
  return failures;
}

async function main() {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });

  const report = {
    base: BASE,
    executed_at: new Date().toISOString(),
    capture_frames: CAPTURE_FRAMES,
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
    const uploads = [];
    for (let index = 0; index < CAPTURE_FRAMES; index += 1) {
      uploads.push(await uploadFixture(fixturePath, index));
    }
    const capture = await createCaptureSession();
    const captureReady = await addCaptureFrames(
      capture.session_id,
      uploads.map((upload) => upload.image_id),
    );
    const reconstruction = await startReconstruction(capture.session_id);
    const jobId = reconstruction.job_id || reconstruction.scene_id;
    const job = await pollJob(jobId);

    const metadataUrl = `${API_BASE}${job.result.urls.metadata}`;
    const camerasUrl = `${API_BASE}${job.result.urls.cameras}`;
    const splatsUrl = `${API_BASE}${job.result.urls.splats}`;
    const metadata = await fetchJson(metadataUrl);
    const cameras = await fetchJson(camerasUrl);
    const splatsBytes = await fetchBytes(splatsUrl);
    const ply = parsePly(splatsBytes);
    const failures = classify(metadata, cameras, ply);

    report.waves.push({
      name: wave.name,
      fixture: wave.file,
      session_id: capture.session_id,
      scene_id: job.result.scene_id,
      duration_ms: Date.now() - startedAt,
      capture_ready: Boolean(captureReady.ready_for_reconstruction),
      metadata,
      camera_count: Array.isArray(cameras) ? cameras.length : 0,
      ply,
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
