import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const frontendPort = Number(process.env.GAUSET_FRONTEND_PORT || "3015");
const backendPython = process.env.GAUSET_BACKEND_PYTHON || "backend_venv/bin/python";
const backendScript = process.env.GAUSET_BACKEND_ENTRY || "backend/server.py";
const backendHost = process.env.GAUSET_BACKEND_HOST || "127.0.0.1";
const defaultBackendPort = Number(process.env.GAUSET_BACKEND_PORT || "8000");
const frontendHost = process.env.GAUSET_FRONTEND_HOST || "127.0.0.1";
const devHealthIntervalMs = Math.max(1_000, Number(process.env.GAUSET_DEV_HEALTH_INTERVAL_MS || "2500"));
const devHealthTimeoutMs = Math.max(2_500, Number(process.env.GAUSET_DEV_HEALTH_TIMEOUT_MS || "4000"));
const devHealthStatusFile = process.env.GAUSET_DEV_HEALTH_FILE || path.join(process.cwd(), "tmp", "dev-stack-health.json");

const children = [];
let shuttingDown = false;
let stopHealthWatchdog = null;

function prefixAndWrite(stream, prefix, chunk) {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/);
    const trailingNewline = text.endsWith("\n");
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line && index === lines.length - 1 && trailingNewline) {
            continue;
        }
        stream.write(`${prefix} ${line}\n`);
    }
}

function spawnLabeled(name, command, args, options = {}) {
    const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...options.env },
        cwd: options.cwd || process.cwd(),
        detached: process.platform !== "win32",
    });

    child.stdout.on("data", (chunk) => prefixAndWrite(process.stdout, `[${name}]`, chunk));
    child.stderr.on("data", (chunk) => prefixAndWrite(process.stderr, `[${name}]`, chunk));
    child.on("exit", (code, signal) => {
        const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
        process.stderr.write(`[${name}] exited with ${detail}\n`);
        if (!shuttingDown) {
            shutdown(code ?? 1);
        }
    });

    children.push(child);
    return child;
}

function shutdown(exitCode = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    stopHealthWatchdog?.();
    stopHealthWatchdog = null;

    for (const child of children) {
        if (!child.pid) {
            continue;
        }
        try {
            if (process.platform === "win32") {
                child.kill("SIGTERM");
            } else {
                process.kill(-child.pid, "SIGTERM");
            }
        } catch {
            // Child already exited.
        }
    }

    setTimeout(() => {
        for (const child of children) {
            if (!child.pid) {
                continue;
            }
            try {
                if (process.platform === "win32") {
                    child.kill("SIGKILL");
                } else {
                    process.kill(-child.pid, "SIGKILL");
                }
            } catch {
                // Child already exited.
            }
        }
        process.exit(exitCode);
    }, 500).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => shutdown(0));
}

function isPortListening(host, port) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port });
        const done = (result) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(result);
        };
        socket.once("connect", () => done(true));
        socket.once("error", () => done(false));
        socket.setTimeout(400, () => done(false));
    });
}

async function isHealthyBackend(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
        return response.ok;
    } catch {
        return false;
    }
}

async function probeUrl(label, url, { expectJsonStatus = null, requireBuildLabel = false, timeoutMs = devHealthTimeoutMs } = {}) {
    try {
        const response = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        let detail = `${response.status}`;

        if (expectJsonStatus) {
            try {
                const payload = JSON.parse(text);
                const reportedStatus = typeof payload?.status === "string" ? payload.status : "unknown";
                const buildLabel = typeof payload?.fingerprint?.build_label === "string" ? payload.fingerprint.build_label : "";
                detail = `${response.status}:${reportedStatus}${requireBuildLabel ? `:${buildLabel || "missing-build-label"}` : ""}`;
                return {
                    label,
                    url,
                    ok: response.ok && reportedStatus === expectJsonStatus && (!requireBuildLabel || Boolean(buildLabel)),
                    detail,
                };
            } catch {
                detail = `${response.status}:invalid-json`;
                return {
                    label,
                    url,
                    ok: false,
                    detail,
                };
            }
        }

        return {
            label,
            url,
            ok: response.ok,
            detail,
        };
    } catch (error) {
        return {
            label,
            url,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
        };
    }
}

async function writeHealthSnapshot(snapshot) {
    await fs.mkdir(path.dirname(devHealthStatusFile), { recursive: true });
    await fs.writeFile(devHealthStatusFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function formatProbeSummary(probes) {
    return probes.map((probe) => `${probe.label}=${probe.detail}`).join(", ");
}

async function probeFrontend(frontendUrl) {
    const probes = await Promise.all([
        probeUrl("proxy", `${frontendUrl}/api/mvp/health`, { expectJsonStatus: "ok" }),
        probeUrl("deployment", `${frontendUrl}/api/mvp/deployment`, {
            expectJsonStatus: "ok",
            requireBuildLabel: true,
            timeoutMs: Math.max(devHealthTimeoutMs, 15_000),
        }),
        probeUrl("workspace", `${frontendUrl}/mvp`),
    ]);
    return {
        ok: probes.every((probe) => probe.ok),
        probes,
    };
}

function startHealthWatchdog({ backendUrl, frontendUrl }) {
    const previous = new Map();
    let stopped = false;
    let pollInFlight = false;

    const poll = async () => {
        if (stopped || pollInFlight) {
            return;
        }
        pollInFlight = true;
        try {
            const probes = await Promise.all([
                probeUrl("backend", `${backendUrl}/health`, { expectJsonStatus: "ok" }),
                probeUrl("proxy", `${frontendUrl}/api/mvp/health`, { expectJsonStatus: "ok" }),
                probeUrl("deployment", `${frontendUrl}/api/mvp/deployment`, {
                    expectJsonStatus: "ok",
                    requireBuildLabel: true,
                    timeoutMs: Math.max(devHealthTimeoutMs, 15_000),
                }),
                probeUrl("workspace", `${frontendUrl}/mvp`),
            ]);

            const snapshot = {
                checkedAt: new Date().toISOString(),
                intervalMs: devHealthIntervalMs,
                timeoutMs: devHealthTimeoutMs,
                probes,
            };

            for (const probe of probes) {
                const prior = previous.get(probe.label);
                if (!prior || prior.ok !== probe.ok || prior.detail !== probe.detail) {
                    const status = probe.ok ? "healthy" : "degraded";
                    process.stdout.write(`[watchdog] ${probe.label} ${status} (${probe.detail}) ${probe.url}\n`);
                    previous.set(probe.label, probe);
                }
            }

            await writeHealthSnapshot(snapshot);
        } finally {
            pollInFlight = false;
        }
    };

    const interval = setInterval(() => {
        void poll();
    }, devHealthIntervalMs);
    void poll();

    return () => {
        stopped = true;
        clearInterval(interval);
    };
}

async function findAvailablePort(host, startPort, attempts = 10) {
    for (let offset = 0; offset < attempts; offset += 1) {
        const candidate = startPort + offset;
        if (!(await isPortListening(host, candidate))) {
            return candidate;
        }
    }
    throw new Error(`Could not find an available backend port starting at ${startPort}.`);
}

async function main() {
    let backendPort = defaultBackendPort;
    let shouldLaunchWorker = true;
    let shouldLaunchFrontend = true;
    const preferredBackendUrl = `http://${backendHost}:${backendPort}`;

    if (await isPortListening(backendHost, backendPort)) {
        if (await isHealthyBackend(preferredBackendUrl)) {
            shouldLaunchWorker = false;
            process.stdout.write(`Reusing existing Gauset worker at ${preferredBackendUrl}.\n`);
        } else {
            backendPort = await findAvailablePort(backendHost, backendPort + 1);
            process.stdout.write(`Port ${defaultBackendPort} is busy with a non-Gauset process. Starting worker on ${backendPort} instead.\n`);
        }
    }

    const backendUrl = `http://${backendHost}:${backendPort}`;
    const frontendUrl = `http://${frontendHost}:${frontendPort}`;

    if (await isPortListening(frontendHost, frontendPort)) {
        const existingFrontend = await probeFrontend(frontendUrl);
        if (existingFrontend.ok) {
            shouldLaunchFrontend = false;
            process.stdout.write(`Reusing existing Gauset frontend at ${frontendUrl}.\n`);
        } else {
            throw new Error(
                `Frontend port ${frontendPort} is occupied by an unhealthy or non-Gauset process (${formatProbeSummary(existingFrontend.probes)}). Stop it or set GAUSET_FRONTEND_PORT to a different port.`,
            );
        }
    }

    process.stdout.write(`Using Gauset frontend ${frontendUrl} with backend ${backendUrl}.\n`);
    process.stdout.write(`Open ${frontendUrl}/mvp for the MVP workspace.\n`);

    if (shouldLaunchWorker) {
        spawnLabeled("worker", backendPython, [backendScript], {
            env: {
                GAUSET_BACKEND_HOST: backendHost,
                GAUSET_BACKEND_PORT: String(backendPort),
            },
        });
    }

    if (shouldLaunchFrontend) {
        spawnLabeled("web", process.execPath, [
            path.join(process.cwd(), "scripts", "dev-web.mjs"),
            "--hostname",
            frontendHost,
            "--port",
            String(frontendPort),
        ], {
            env: {
                GAUSET_BACKEND_URL: backendUrl,
                GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE: "1",
                GAUSET_IMAGE_TO_SPLAT_BACKEND_URL: backendUrl,
            },
        });
    }

    stopHealthWatchdog = startHealthWatchdog({ backendUrl, frontendUrl });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to start dev stack: ${message}\n`);
    shutdown(1);
});
