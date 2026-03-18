import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(".");

const reviewExperiencePath = path.join(workspaceRoot, "src/components/Editor/ReviewExperience.tsx");
const reviewExperienceControllerPath = path.join(workspaceRoot, "src/components/Editor/useReviewExperienceController.ts");
const reviewExperienceInlinePath = path.join(workspaceRoot, "src/components/Editor/useReviewExperienceInlinePackageController.ts");
const reviewExperienceSavedScenePath = path.join(workspaceRoot, "src/components/Editor/useReviewExperienceSavedSceneController.ts");
const reviewExperienceSharedPath = path.join(workspaceRoot, "src/components/Editor/reviewExperienceShared.ts");

const [
    reviewExperienceSource,
    reviewExperienceControllerSource,
    reviewExperienceInlineSource,
    reviewExperienceSavedSceneSource,
    reviewExperienceSharedSource,
] = await Promise.all([
    fs.readFile(reviewExperiencePath, "utf8"),
    fs.readFile(reviewExperienceControllerPath, "utf8"),
    fs.readFile(reviewExperienceInlinePath, "utf8"),
    fs.readFile(reviewExperienceSavedScenePath, "utf8"),
    fs.readFile(reviewExperienceSharedPath, "utf8"),
]);

const checks = [
    {
        label: "ReviewExperience shell delegates search-param orchestration to dedicated controller hook",
        pass:
            reviewExperienceSource.includes('import { useReviewExperienceController } from "./useReviewExperienceController";') &&
            reviewExperienceSource.includes("} = useReviewExperienceController({"),
    },
    {
        label: "ReviewExperience shell renders extracted header and review sections",
        pass:
            reviewExperienceSource.includes("<ViewerPanel sceneDocument={sceneDocument} readOnly />") &&
            reviewExperienceSource.includes("<ReviewExperienceHeader") &&
            reviewExperienceSource.includes("<ReviewExperienceSummarySection") &&
            reviewExperienceSource.includes("<ReviewExperienceMetadataSection") &&
            reviewExperienceSource.includes("<ReviewExperienceCommentsSection"),
    },
    {
        label: "ReviewExperience shell no longer owns fetch, decode, or local state effects directly",
        pass:
            !reviewExperienceSource.includes("useEffect(") &&
            !reviewExperienceSource.includes("useState(") &&
            !reviewExperienceSource.includes("await fetch(") &&
            !reviewExperienceSource.includes("decodeReviewPackage(") &&
            !reviewExperienceSource.includes("applyReviewShareToken(") &&
            !reviewExperienceSource.includes("extractApiError("),
    },
    {
        label: "ReviewExperience controller composes inline-package and saved-scene subcontrollers",
        pass:
            reviewExperienceControllerSource.includes("export function useReviewExperienceController({ sceneId, versionId, payload, shareToken }: ReviewExperienceQuery) {") &&
            reviewExperienceControllerSource.includes("const inlinePackage = useReviewExperienceInlinePackageController({") &&
            reviewExperienceControllerSource.includes("const savedScene = useReviewExperienceSavedSceneController({") &&
            reviewExperienceControllerSource.includes("sceneDocument: savedScene.reviewPackage?.sceneDocument ?? EMPTY_REVIEW_SCENE_DOCUMENT,") &&
            !reviewExperienceControllerSource.includes("sceneGraph: savedScene.reviewPackage?.sceneGraph"),
    },
    {
        label: "Inline package controller owns review package decode",
        pass:
            reviewExperienceInlineSource.includes("export function useReviewExperienceInlinePackageController({") &&
            reviewExperienceInlineSource.includes("decodeInlineReviewPackagePayload(payload, shareToken)") &&
            !reviewExperienceInlineSource.includes("await fetch("),
    },
    {
        label: "Saved scene controller owns review version, metadata, and comments fetches",
        pass:
            reviewExperienceSavedSceneSource.includes("export function useReviewExperienceSavedSceneController({") &&
            reviewExperienceSavedSceneSource.includes("await fetch(withMvpShareToken(`${MVP_API_BASE_URL}/scene/${sceneId}/versions/${versionId}`, shareToken), {") &&
            reviewExperienceSavedSceneSource.includes("fetch(withMvpShareToken(`${MVP_API_BASE_URL}/scene/${sceneId}/review`, shareToken), {") &&
            reviewExperienceSavedSceneSource.includes("fetch(withMvpShareToken(`${MVP_API_BASE_URL}/scene/${sceneId}/versions/${versionId}/comments`, shareToken), {") &&
            reviewExperienceSavedSceneSource.includes("buildReviewPackageFromSavedVersion({"),
    },
    {
        label: "Review experience shared module owns formatting and package normalization helpers",
        pass:
            reviewExperienceSharedSource.includes("export const EMPTY_REVIEW_SCENE_DOCUMENT = createEmptySceneDocumentV2();") &&
            reviewExperienceSharedSource.includes("export function formatReviewTimestamp(value?: string | null) {") &&
            reviewExperienceSharedSource.includes("export function decodeInlineReviewPackagePayload(payload: string, shareToken?: string | null) {") &&
            reviewExperienceSharedSource.includes("export function buildReviewPackageFromSavedVersion({"),
    },
];

let failed = false;

for (const check of checks) {
    if (check.pass) {
        console.log(`pass: ${check.label}`);
        continue;
    }

    console.error(`review experience isolation check failed: ${check.label}`);
    failed = true;
}

if (failed) {
    process.exit(1);
}
