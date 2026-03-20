import process from "node:process";

import { buildBoundarySnapshot, evaluateBoundary } from "./deploy-boundary-lib.mjs";

function fail(message, details = []) {
    console.error(`\n[guard-deploy-target] ${message}`);

    for (const detail of details) {
        console.error(`[guard-deploy-target] ${detail}`);
    }

    process.exit(1);
}

const failures = evaluateBoundary(buildBoundarySnapshot());
if (failures.length > 0) {
    const [firstFailure, ...rest] = failures;
    const extraDetails = rest.flatMap((entry) => [entry.message, ...entry.details]);
    fail(firstFailure.message, [...firstFailure.details, ...extraDetails]);
}
