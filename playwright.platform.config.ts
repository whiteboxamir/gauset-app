import { existsSync } from "node:fs";

import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const baseURL = process.env.GAUSET_PLATFORM_E2E_BASE_URL ?? process.env.GAUSET_PLATFORM_BASE_URL ?? "https://gauset-app.vercel.app";
const jsonReportPath = process.env.GAUSET_PLATFORM_E2E_JSON_REPORT ?? "playwright-report/platform-e2e/results.json";
const storageStateCandidate = (process.env.GAUSET_PLATFORM_E2E_STORAGE_STATE ?? "").trim();
const storageState = storageStateCandidate && existsSync(storageStateCandidate) ? storageStateCandidate : undefined;

export default defineConfig({
    testDir: "./tests/platform",
    timeout: 60_000,
    expect: {
        timeout: 15_000,
    },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report/platform-e2e" }],
        ["json", { outputFile: jsonReportPath }],
    ],
    outputDir: "test-results/platform-e2e",
    use: {
        baseURL,
        ignoreHTTPSErrors: true,
        ...(storageState ? { storageState } : {}),
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
            },
        },
    ],
});
