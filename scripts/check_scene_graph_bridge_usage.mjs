import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const bridgePattern = /setSceneGraph\(\(prev/g;

const editorFiles = [
    "src/components/Editor/LeftPanel.tsx",
    "src/components/Editor/RightPanel.tsx",
    "src/components/Editor/ThreeOverlay.tsx",
    "src/components/Editor/ViewerPanel.tsx",
];

let failed = false;

for (const relativePath of editorFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    const matches = source.match(bridgePattern);
    const count = matches ? matches.length : 0;
    const allowedCount = 0;

    console.log(`${relativePath}: ${count} functional bridge mutation(s)`);

    if (count !== allowedCount) {
        failed = true;
        console.error(
            `bridge-usage mismatch for ${relativePath}: expected ${allowedCount}, found ${count}`,
        );
    }
}

if (failed) {
    process.exit(1);
}

console.log("pass: scene graph bridge usage matches allowlist");
