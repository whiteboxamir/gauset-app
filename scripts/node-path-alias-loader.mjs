import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const aliasPrefix = "@/"; // Resolve Next-style alias imports in plain Node test runners.
const candidateExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function resolveAliasTarget(specifier) {
    const relativePath = specifier.slice(aliasPrefix.length);
    const directPath = path.resolve(workspaceRoot, "src", relativePath);

    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        return directPath;
    }

    for (const extension of candidateExtensions) {
        const candidatePath = `${directPath}${extension}`;
        if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
            return candidatePath;
        }
    }

    if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
        for (const extension of candidateExtensions) {
            const candidatePath = path.join(directPath, `index${extension}`);
            if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
                return candidatePath;
            }
        }
    }

    return null;
}

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(aliasPrefix)) {
        const targetPath = resolveAliasTarget(specifier);
        if (targetPath) {
            return {
                url: pathToFileURL(targetPath).href,
                shortCircuit: true,
            };
        }
    }

    return nextResolve(specifier, context);
}
