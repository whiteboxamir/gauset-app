import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const frontendPort = process.env.GAUSET_FRONTEND_PORT || "3015";
const backendPython = process.env.GAUSET_BACKEND_PYTHON || "backend_venv/bin/python";
const backendScript = process.env.GAUSET_BACKEND_ENTRY || "backend/server.py";
const backendHost = process.env.GAUSET_BACKEND_HOST || "127.0.0.1";
const defaultBackendPort = Number(process.env.GAUSET_BACKEND_PORT || "8000");

const children = [];
let shuttingDown = false;

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
    process.stdout.write(`Starting Gauset frontend on port ${frontendPort} with backend ${backendUrl}.\n`);

    if (shouldLaunchWorker) {
        spawnLabeled("worker", backendPython, [backendScript], {
            env: {
                GAUSET_BACKEND_HOST: backendHost,
                GAUSET_BACKEND_PORT: String(backendPort),
            },
        });
    }

    spawnLabeled("web", "npm", ["run", "dev", "--", "-p", frontendPort], {
        env: {
            GAUSET_BACKEND_URL: backendUrl,
            GAUSET_ENABLE_IMAGE_TO_SPLAT_BRIDGE: "1",
            GAUSET_IMAGE_TO_SPLAT_BACKEND_URL: backendUrl,
        },
    });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to start dev stack: ${message}\n`);
    shutdown(1);
});
