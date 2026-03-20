import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const defaultPort = process.env.GAUSET_FRONTEND_PORT || process.env.GAUSET_WEB_PORT || process.env.PORT || "3001";
const nextBinary = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next",
);

const cliArgs = process.argv.slice(2);
const hasExplicitPort = cliArgs.some((argument, index) => {
    if (argument === "--port" || argument === "-p") {
        return true;
    }
    if (argument.startsWith("--port=")) {
        return true;
    }
    return (cliArgs[index - 1] === "--port" || cliArgs[index - 1] === "-p") && index > 0;
});

const nextArgs = ["dev", ...cliArgs];
if (!hasExplicitPort) {
    nextArgs.push("--port", defaultPort);
}

const child = spawn(nextBinary, nextArgs, {
    stdio: "inherit",
    env: process.env,
});

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});

child.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to launch Next dev server: ${message}\n`);
    process.exit(1);
});
