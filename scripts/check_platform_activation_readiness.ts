import { getPlatformActivationReadiness } from "../src/server/platform/activation-readiness.ts";

const args = new Set(process.argv.slice(2));
const includeConnectivity = args.has("--connectivity");
const requireReady = args.has("--require-ready");

const snapshot = await getPlatformActivationReadiness({ includeConnectivity });

console.log(JSON.stringify(snapshot, null, 2));

if (requireReady ? snapshot.status !== "ready" : snapshot.status === "blocked") {
    process.exitCode = 1;
}
