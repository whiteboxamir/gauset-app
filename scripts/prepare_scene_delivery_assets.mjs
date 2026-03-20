import fs from "node:fs";
import path from "node:path";

import { ensureSceneDeliveryBundle } from "./sharp_gaussian_delivery_utils.mjs";

function resolveTarget(rawTarget) {
    const candidate = String(rawTarget ?? "").trim();
    if (!candidate) {
        throw new Error("Provide a scene id or scene/environment path.");
    }

    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
        const stats = fs.statSync(resolved);
        if (stats.isDirectory()) {
            if (path.basename(resolved) === "environment") {
                return {
                    sceneId: path.basename(path.dirname(resolved)),
                    environmentDir: resolved,
                };
            }

            return {
                sceneId: path.basename(resolved),
                environmentDir: path.join(resolved, "environment"),
            };
        }
    }

    return {
        sceneId: candidate,
        environmentDir: path.resolve("scenes", candidate, "environment"),
    };
}

const target = resolveTarget(process.argv[2] ?? process.env.GAUSET_SCENE_ID);
const sceneLabel = process.env.GAUSET_SCENE_LABEL ?? target.sceneId;
const bootstrapPointCount = process.env.GAUSET_BOOTSTRAP_POINT_COUNT ? Number(process.env.GAUSET_BOOTSTRAP_POINT_COUNT) : null;

const result = ensureSceneDeliveryBundle({
    sceneId: target.sceneId,
    environmentDir: target.environmentDir,
    sceneLabel,
    bootstrapPointCount,
});

console.log(JSON.stringify(result, null, 2));
