import fs from "node:fs";
import path from "node:path";

const viewerPanelPath = path.join(process.cwd(), "src/components/Editor/ViewerPanel.tsx");
const leftPanelPath = path.join(process.cwd(), "src/components/Editor/LeftPanel.tsx");
const rightPanelPath = path.join(process.cwd(), "src/components/Editor/RightPanel.tsx");
const threeOverlayPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlay.tsx");
const threeOverlayFallbackSurfacesPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlayFallbackSurfaces.tsx");
const threeOverlayLoadingLabelPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlayLoadingLabel.tsx");
const threeOverlayCameraRigPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlayCameraRig.tsx");
const threeOverlayPinLayerPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlayPinLayer.tsx");
const threeOverlayViewportPrimitivesPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlayViewportPrimitives.tsx");
const threeOverlaySceneAssetsPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlaySceneAssets.tsx");
const threeOverlayAssetNodeControllerPath = path.join(process.cwd(), "src/components/Editor/useThreeOverlayAssetNodeController.ts");
const threeOverlayCameraPoseControllerPath = path.join(process.cwd(), "src/components/Editor/useThreeOverlayCameraPoseController.ts");
const threeOverlayCameraRigControllerPath = path.join(process.cwd(), "src/components/Editor/useThreeOverlayCameraRigController.ts");
const threeOverlayPinLayerControllerPath = path.join(process.cwd(), "src/components/Editor/useThreeOverlayPinLayerController.ts");
const threeOverlaySurfaceControllerPath = path.join(process.cwd(), "src/components/Editor/useThreeOverlaySurfaceController.ts");
const threeOverlayViewerRuntimeControllerPath = path.join(process.cwd(), "src/components/Editor/useThreeOverlayViewerRuntimeController.ts");
const threeOverlayInteractionControllerPath = path.join(process.cwd(), "src/components/Editor/useThreeOverlayInteractionController.ts");
const viewerCameraPathRecorderPath = path.join(process.cwd(), "src/components/Editor/useViewerCameraPathRecorder.ts");
const viewerControllerPath = path.join(process.cwd(), "src/components/Editor/useViewerPanelController.ts");
const viewerPanelSessionControllerPath = path.join(process.cwd(), "src/components/Editor/useViewerPanelSessionController.ts");
const viewerPanelSceneActionControllerPath = path.join(process.cwd(), "src/components/Editor/useViewerPanelSceneActionController.ts");
const environmentSplatPath = path.join(process.cwd(), "src/components/Editor/EnvironmentSplat.tsx");
const lumaEnvironmentSplatPath = path.join(process.cwd(), "src/components/Editor/LumaEnvironmentSplat.tsx");
const sharpGaussianEnvironmentSplatPath = path.join(process.cwd(), "src/components/Editor/SharpGaussianEnvironmentSplat.tsx");
const sharpGaussianPayloadPath = path.join(process.cwd(), "src/components/Editor/sharpGaussianPayload.ts");
const sharpGaussianPayloadControllerPath = path.join(process.cwd(), "src/components/Editor/useSharpGaussianPayloadController.ts");
const sharpGaussianOrderingControllerPath = path.join(process.cwd(), "src/components/Editor/useSharpGaussianOrderingController.ts");
const sharpGaussianSharedPath = path.join(process.cwd(), "src/components/Editor/sharpGaussianShared.ts");
const sharpGaussianWorkerPath = path.join(process.cwd(), "src/components/Editor/sharpGaussianPlyWorker.ts");
const viewerWorkspaceControllerPath = path.join(process.cwd(), "src/app/mvp/_hooks/useMvpWorkspaceViewerController.ts");
const threeOverlayWorkspaceControllerPath = path.join(process.cwd(), "src/app/mvp/_hooks/useMvpWorkspaceThreeOverlayController.ts");
const leftPanelIntakeControllerPath = path.join(process.cwd(), "src/app/mvp/_hooks/useMvpWorkspaceIntakeController.ts");
const leftPanelIntakeSetupControllerPath = path.join(
    process.cwd(),
    "src/app/mvp/_hooks/useMvpWorkspaceIntakeSetupController.ts",
);
const leftPanelUploadTrayControllerPath = path.join(
    process.cwd(),
    "src/app/mvp/_hooks/useMvpWorkspaceUploadTrayController.ts",
);
const leftPanelGenerationControllerPath = path.join(
    process.cwd(),
    "src/app/mvp/_hooks/useMvpWorkspaceGenerationController.ts",
);
const leftPanelCaptureControllerPath = path.join(
    process.cwd(),
    "src/app/mvp/_hooks/useMvpWorkspaceCaptureController.ts",
);
const leftPanelSharedIntakePath = path.join(process.cwd(), "src/app/mvp/_hooks/mvpWorkspaceIntakeShared.ts");
const leftPanelWorkspaceSummaryPath = path.join(process.cwd(), "src/components/Editor/LeftPanelWorkspaceSummary.tsx");
const leftPanelImportSectionPath = path.join(process.cwd(), "src/components/Editor/LeftPanelImportSection.tsx");
const leftPanelGenerateSectionPath = path.join(process.cwd(), "src/components/Editor/LeftPanelGenerateSection.tsx");
const leftPanelCaptureWorkspacePath = path.join(process.cwd(), "src/components/Editor/LeftPanelCaptureWorkspace.tsx");
const leftPanelActivityLogPath = path.join(process.cwd(), "src/components/Editor/LeftPanelActivityLog.tsx");
const rightPanelHeaderPath = path.join(process.cwd(), "src/components/Editor/RightPanelHeader.tsx");
const rightPanelWorkspaceOverviewSectionPath = path.join(process.cwd(), "src/components/Editor/RightPanelWorkspaceOverviewSection.tsx");
const rightPanelReviewSectionPath = path.join(process.cwd(), "src/components/Editor/RightPanelReviewSection.tsx");
const rightPanelReviewIssuesSectionPath = path.join(process.cwd(), "src/components/Editor/RightPanelReviewIssuesSection.tsx");
const rightPanelVersionHistorySectionPath = path.join(process.cwd(), "src/components/Editor/RightPanelVersionHistorySection.tsx");
const rightPanelSceneGraphSectionPath = path.join(process.cwd(), "src/components/Editor/RightPanelSceneGraphSection.tsx");
const rightPanelLocalAssetsSectionPath = path.join(process.cwd(), "src/components/Editor/RightPanelLocalAssetsSection.tsx");
const rightPanelSharedPath = path.join(process.cwd(), "src/components/Editor/rightPanelShared.ts");
const rightPanelReviewControllerPath = path.join(process.cwd(), "src/app/mvp/_hooks/useMvpWorkspaceReviewController.ts");
const rightPanelReviewPersistenceControllerPath = path.join(
    process.cwd(),
    "src/app/mvp/_hooks/useMvpWorkspaceReviewPersistenceController.ts",
);
const rightPanelReviewFocusControllerPath = path.join(
    process.cwd(),
    "src/app/mvp/_hooks/useMvpWorkspaceReviewFocusController.ts",
);
const rightPanelReviewShareControllerPath = path.join(
    process.cwd(),
    "src/app/mvp/_hooks/useMvpWorkspaceReviewShareController.ts",
);
const rightPanelReviewSharedPath = path.join(process.cwd(), "src/app/mvp/_hooks/mvpWorkspaceReviewShared.ts");

const viewerSource = fs.readFileSync(viewerPanelPath, "utf8");
const leftSource = fs.readFileSync(leftPanelPath, "utf8");
const rightSource = fs.readFileSync(rightPanelPath, "utf8");
const threeOverlaySource = fs.readFileSync(threeOverlayPath, "utf8");
const threeOverlayFallbackSurfacesSource = fs.readFileSync(threeOverlayFallbackSurfacesPath, "utf8");
const threeOverlayLoadingLabelSource = fs.readFileSync(threeOverlayLoadingLabelPath, "utf8");
const threeOverlayCameraRigSource = fs.readFileSync(threeOverlayCameraRigPath, "utf8");
const threeOverlayPinLayerSource = fs.readFileSync(threeOverlayPinLayerPath, "utf8");
const threeOverlayViewportPrimitivesSource = fs.readFileSync(threeOverlayViewportPrimitivesPath, "utf8");
const threeOverlaySceneAssetsSource = fs.readFileSync(threeOverlaySceneAssetsPath, "utf8");
const threeOverlayAssetNodeControllerSource = fs.readFileSync(threeOverlayAssetNodeControllerPath, "utf8");
const threeOverlayCameraPoseControllerSource = fs.readFileSync(threeOverlayCameraPoseControllerPath, "utf8");
const threeOverlayCameraRigControllerSource = fs.readFileSync(threeOverlayCameraRigControllerPath, "utf8");
const threeOverlayPinLayerControllerSource = fs.readFileSync(threeOverlayPinLayerControllerPath, "utf8");
const threeOverlaySurfaceControllerSource = fs.readFileSync(threeOverlaySurfaceControllerPath, "utf8");
const threeOverlayViewerRuntimeControllerSource = fs.readFileSync(threeOverlayViewerRuntimeControllerPath, "utf8");
const threeOverlayInteractionControllerSource = fs.readFileSync(threeOverlayInteractionControllerPath, "utf8");
const viewerCameraPathRecorderSource = fs.readFileSync(viewerCameraPathRecorderPath, "utf8");
const viewerControllerSource = fs.readFileSync(viewerControllerPath, "utf8");
const viewerPanelSessionControllerSource = fs.readFileSync(viewerPanelSessionControllerPath, "utf8");
const viewerPanelSceneActionControllerSource = fs.readFileSync(viewerPanelSceneActionControllerPath, "utf8");
const environmentSplatSource = fs.readFileSync(environmentSplatPath, "utf8");
const lumaEnvironmentSplatSource = fs.readFileSync(lumaEnvironmentSplatPath, "utf8");
const sharpGaussianEnvironmentSplatSource = fs.readFileSync(sharpGaussianEnvironmentSplatPath, "utf8");
const sharpGaussianPayloadSource = fs.readFileSync(sharpGaussianPayloadPath, "utf8");
const sharpGaussianPayloadControllerSource = fs.readFileSync(sharpGaussianPayloadControllerPath, "utf8");
const sharpGaussianOrderingControllerSource = fs.readFileSync(sharpGaussianOrderingControllerPath, "utf8");
const sharpGaussianSharedSource = fs.readFileSync(sharpGaussianSharedPath, "utf8");
const sharpGaussianWorkerSource = fs.readFileSync(sharpGaussianWorkerPath, "utf8");
const viewerWorkspaceControllerSource = fs.readFileSync(viewerWorkspaceControllerPath, "utf8");
const threeOverlayWorkspaceControllerSource = fs.readFileSync(threeOverlayWorkspaceControllerPath, "utf8");
const leftPanelIntakeControllerSource = fs.readFileSync(leftPanelIntakeControllerPath, "utf8");
const leftPanelIntakeSetupControllerSource = fs.readFileSync(leftPanelIntakeSetupControllerPath, "utf8");
const leftPanelUploadTrayControllerSource = fs.readFileSync(leftPanelUploadTrayControllerPath, "utf8");
const leftPanelGenerationControllerSource = fs.readFileSync(leftPanelGenerationControllerPath, "utf8");
const leftPanelCaptureControllerSource = fs.readFileSync(leftPanelCaptureControllerPath, "utf8");
const leftPanelSharedIntakeSource = fs.readFileSync(leftPanelSharedIntakePath, "utf8");
const leftPanelWorkspaceSummarySource = fs.readFileSync(leftPanelWorkspaceSummaryPath, "utf8");
const leftPanelImportSectionSource = fs.readFileSync(leftPanelImportSectionPath, "utf8");
const leftPanelGenerateSectionSource = fs.readFileSync(leftPanelGenerateSectionPath, "utf8");
const leftPanelCaptureWorkspaceSource = fs.readFileSync(leftPanelCaptureWorkspacePath, "utf8");
const leftPanelActivityLogSource = fs.readFileSync(leftPanelActivityLogPath, "utf8");
const rightPanelHeaderSource = fs.readFileSync(rightPanelHeaderPath, "utf8");
const rightPanelWorkspaceOverviewSectionSource = fs.readFileSync(rightPanelWorkspaceOverviewSectionPath, "utf8");
const rightPanelReviewSectionSource = fs.readFileSync(rightPanelReviewSectionPath, "utf8");
const rightPanelReviewIssuesSectionSource = fs.readFileSync(rightPanelReviewIssuesSectionPath, "utf8");
const rightPanelVersionHistorySectionSource = fs.readFileSync(rightPanelVersionHistorySectionPath, "utf8");
const rightPanelSceneGraphSectionSource = fs.readFileSync(rightPanelSceneGraphSectionPath, "utf8");
const rightPanelLocalAssetsSectionSource = fs.readFileSync(rightPanelLocalAssetsSectionPath, "utf8");
const rightPanelSharedSource = fs.readFileSync(rightPanelSharedPath, "utf8");
const rightPanelReviewControllerSource = fs.readFileSync(rightPanelReviewControllerPath, "utf8");
const rightPanelReviewPersistenceControllerSource = fs.readFileSync(rightPanelReviewPersistenceControllerPath, "utf8");
const rightPanelReviewFocusControllerSource = fs.readFileSync(rightPanelReviewFocusControllerPath, "utf8");
const rightPanelReviewShareControllerSource = fs.readFileSync(rightPanelReviewShareControllerPath, "utf8");
const rightPanelReviewSharedSource = fs.readFileSync(rightPanelReviewSharedPath, "utf8");

const requirements = [
    {
        label: "ViewerPanel defines dedicated workspace mode",
        pass: viewerSource.includes("const ViewerPanelWorkspaceMode = React.memo(function ViewerPanelWorkspaceMode("),
    },
    {
        label: "ViewerPanel defines dedicated override mode",
        pass: viewerSource.includes("const ViewerPanelOverrideMode = React.memo(function ViewerPanelOverrideMode("),
    },
    {
        label: "ViewerPanel defines shared viewer frame shell",
        pass: viewerSource.includes("const ViewerPanelFrame = React.memo(function ViewerPanelFrame("),
    },
    {
        label: "ViewerPanel no longer passes sceneGraph into ThreeOverlay",
        pass: !viewerSource.includes("sceneGraph={overlaySceneGraph}") && !viewerSource.includes("sceneGraph={normalizedSceneGraph}"),
    },
    {
        label: "ViewerPanel no longer passes override sceneGraph into connected viewer sections",
        pass: !viewerSource.includes("sceneGraph={normalizedSceneGraphOverride}") && !viewerSource.includes("sceneGraph={overrideSceneSlices}"),
    },
    {
        label: "ViewerPanel passes explicit overlay slices into override ThreeOverlay",
        pass:
            viewerSource.includes("environment={overrideOverlaySceneSlices.environment}") &&
            viewerSource.includes("assets={overrideOverlaySceneSlices.assets}") &&
            viewerSource.includes("pins={overrideOverlaySceneSlices.pins}") &&
            viewerSource.includes("viewer={overrideOverlaySceneSlices.viewer}"),
    },
    {
        label: "ViewerPanel defines memoized ViewerSelectionTray",
        pass: viewerSource.includes("const ViewerSelectionTray = React.memo(function ViewerSelectionTray("),
    },
    {
        label: "ViewerPanel delegates workspace viewer orchestration to dedicated controller hook",
        pass:
            viewerSource.includes('import { useMvpWorkspaceViewerController } from "@/app/mvp/_hooks/useMvpWorkspaceViewerController";') &&
            viewerSource.includes("const workspaceViewer = useMvpWorkspaceViewerController({"),
    },
    {
        label: "ViewerPanel workspace mode no longer reads workspace session or editor-session selectors directly",
        pass:
            !viewerSource.includes("const workspaceSession = useMvpWorkspaceSession();") &&
            !viewerSource.includes("const editorSessionActions = useMvpEditorSessionStoreActions();") &&
            !viewerSource.includes("const editorSessionFocusRequest = useEditorSessionFocusRequest();") &&
            !viewerSource.includes("const editorSessionCaptureRequestKey = useEditorSessionCaptureRequestKey();") &&
            !viewerSource.includes("const editorSessionPinPlacementEnabled = useEditorSessionPinPlacementEnabled();") &&
            !viewerSource.includes("const editorSessionPinType = useEditorSessionPinType();") &&
            !viewerSource.includes("const editorSessionRecordingPath = useEditorSessionRecordingPath();") &&
            !viewerSource.includes("const editorSessionViewerReady = useEditorSessionViewerReady();"),
    },
    {
        label: "ViewerPanel workspace mode no longer reads scene selectors or store actions directly",
        pass:
            !viewerSource.includes("const sceneStoreActions = useMvpSceneStoreActions();") &&
            !viewerSource.includes("const selectedPinId = useSceneSelectedPinId();") &&
            !viewerSource.includes("const selectedViewId = useSceneSelectedViewId();") &&
            !viewerSource.includes("const viewerInteractionScene = useSceneViewerInteractionSlice();"),
    },
    {
        label: "Workspace viewer controller hook is defined",
        pass: viewerWorkspaceControllerSource.includes("export function useMvpWorkspaceViewerController({"),
    },
    {
        label: "Workspace viewer controller owns workspace session, narrow scene slice, and editor-session selector reads",
        pass:
            viewerWorkspaceControllerSource.includes("const workspaceSession = useMvpWorkspaceSession();") &&
            viewerWorkspaceControllerSource.includes("const environment = useSceneEnvironmentSlice();") &&
            viewerWorkspaceControllerSource.includes("const assets = useSceneAssetsSlice();") &&
            viewerWorkspaceControllerSource.includes("const camera_views = useSceneCameraViewsSlice();") &&
            viewerWorkspaceControllerSource.includes("const pins = useScenePinsSlice();") &&
            viewerWorkspaceControllerSource.includes("const director_path = useSceneDirectorPathSlice();") &&
            viewerWorkspaceControllerSource.includes("const director_brief = useSceneDirectorBriefSlice();") &&
            viewerWorkspaceControllerSource.includes("const viewer = useSceneViewerSlice();") &&
            viewerWorkspaceControllerSource.includes("const sceneSlices = useMemo(") &&
            viewerWorkspaceControllerSource.includes("const viewerInteractionScene = useSceneViewerInteractionSlice();") &&
            viewerWorkspaceControllerSource.includes("const selectedPinId = useSceneSelectedPinId();") &&
            viewerWorkspaceControllerSource.includes("const selectedViewId = useSceneSelectedViewId();") &&
            viewerWorkspaceControllerSource.includes("const activeTool = useSceneActiveTool();") &&
            viewerWorkspaceControllerSource.includes("const editorSessionActions = useMvpEditorSessionStoreActions();") &&
            viewerWorkspaceControllerSource.includes("const editorSessionFocusRequest = useEditorSessionFocusRequest();") &&
            viewerWorkspaceControllerSource.includes("const editorSessionCaptureRequestKey = useEditorSessionCaptureRequestKey();") &&
            !viewerWorkspaceControllerSource.includes("const sceneSlices = useSceneWorkspaceGraph();"),
    },
    {
        label: "Workspace viewer controller owns scene-store mutation wiring",
        pass:
            viewerWorkspaceControllerSource.includes("const sceneStoreActions = useMvpSceneStoreActions();") &&
            viewerWorkspaceControllerSource.includes("onAppendAsset: sceneStoreActions.appendAsset,") &&
            viewerWorkspaceControllerSource.includes("onUpdateViewerState: sceneStoreActions.patchViewer,") &&
            viewerWorkspaceControllerSource.includes("onAppendCameraView: sceneStoreActions.appendCameraView,") &&
            viewerWorkspaceControllerSource.includes("onSetDirectorPath: sceneStoreActions.setDirectorPath,"),
    },
    {
        label: "Workspace viewer controller composes generic viewer interaction hook",
        pass: viewerWorkspaceControllerSource.includes("const interactionController = useViewerPanelInteractionController({"),
    },
    {
        label: "ViewerPanel workspace mode no longer rebuilds scene graph from renderable snapshot",
        pass:
            !viewerSource.includes("useRenderableSceneDocumentSnapshotGetter();") &&
            !viewerSource.includes("sceneDocumentToWorkspaceSceneGraph("),
    },
    {
        label: "ViewerPanel uses dedicated interaction controller hook",
        pass: viewerSource.includes("useViewerPanelInteractionController({"),
    },
    {
        label: "ViewerPanel renders connected ThreeOverlay wrapper",
        pass: viewerSource.includes("<ThreeOverlayConnected"),
    },
    {
        label: "ViewerPanel renders explicit override ThreeOverlay at the parent boundary",
        pass:
            viewerSource.includes("<ThreeOverlay") &&
            viewerSource.includes("environment={overrideOverlaySceneSlices.environment}") &&
            viewerSource.includes("onViewerReadyChange={setViewerReady}"),
    },
    {
        label: "Viewer interaction controller hook is defined",
        pass: viewerControllerSource.includes("export function useViewerPanelInteractionController({"),
    },
    {
        label: "Viewer interaction controller composes dedicated session and scene action hooks",
        pass:
            viewerControllerSource.includes('import { useViewerPanelSceneActionController } from "./useViewerPanelSceneActionController";') &&
            viewerControllerSource.includes("useViewerPanelSessionController,") &&
            viewerControllerSource.includes("const sessionController = useViewerPanelSessionController({") &&
            viewerControllerSource.includes("const sceneActionController = useViewerPanelSceneActionController({"),
    },
    {
        label: "Viewer interaction controller is decoupled from scene source resolution",
        pass:
            !viewerControllerSource.includes("const overrideSceneSlices =") &&
            !viewerControllerSource.includes("useRenderableSceneDocumentSnapshotGetter("),
    },
    {
        label: "Viewer interaction controller no longer owns local session or capture state directly",
        pass:
            !viewerControllerSource.includes("const [localCaptureRequestKey") &&
            !viewerControllerSource.includes("const [localIsPinPlacementEnabled") &&
            !viewerControllerSource.includes("const [localIsRecordingPath") &&
            !viewerControllerSource.includes("const [localFocusRequest") &&
            !viewerControllerSource.includes("const captureFallbackTimerRef") &&
            !viewerControllerSource.includes("const pendingCaptureRequestRef"),
    },
    {
        label: "Viewer panel session controller hook is defined",
        pass: viewerPanelSessionControllerSource.includes("export function useViewerPanelSessionController({"),
    },
    {
        label: "Viewer panel session controller owns local-session state bridging and viewer shell toggles",
        pass:
            viewerPanelSessionControllerSource.includes("const [localCaptureRequestKey, setLocalCaptureRequestKey] = useState(0);") &&
            viewerPanelSessionControllerSource.includes("const combinedFocusRequest = sessionState?.focusRequest") &&
            viewerPanelSessionControllerSource.includes("const issueCaptureRequest = useCallback(() => {") &&
            viewerPanelSessionControllerSource.includes("const toggleFullscreen = useCallback(async () => {") &&
            viewerPanelSessionControllerSource.includes("const toggleRecordingPath = useCallback(() => {"),
    },
    {
        label: "Viewer panel session controller owns escape handling and viewer-ready gating",
        pass:
            viewerPanelSessionControllerSource.includes("if (viewerReady) {") &&
            viewerPanelSessionControllerSource.includes("setPinPlacementEnabled(false);") &&
            viewerPanelSessionControllerSource.includes("setRecordingPathEnabled(false);") &&
            viewerPanelSessionControllerSource.includes('if (event.key !== "Escape") {'),
    },
    {
        label: "Viewer panel scene action controller hook is defined",
        pass: viewerPanelSceneActionControllerSource.includes("export function useViewerPanelSceneActionController({"),
    },
    {
        label: "Viewer panel scene action controller owns drop, focus, capture, and director-path callbacks",
        pass:
            viewerPanelSceneActionControllerSource.includes("const handleDrop = useCallback(") &&
            viewerPanelSceneActionControllerSource.includes("const requestViewCapture = useCallback(() => {") &&
            viewerPanelSceneActionControllerSource.includes("const handlePathRecorded = useCallback(") &&
            viewerPanelSceneActionControllerSource.includes("const focusView = useCallback(") &&
            viewerPanelSceneActionControllerSource.includes("const focusPin = useCallback(() => {"),
    },
    {
        label: "ViewerPanel routes scene-document overrides through dedicated override mode",
        pass:
            viewerSource.includes("if (props.sceneDocument) {") &&
            viewerSource.includes("<ViewerPanelOverrideMode") &&
            viewerSource.includes(
                "const overrideSceneSlices = useMemo(() => selectViewerPanelSceneSlicesFromDocument(sceneDocument), [sceneDocument]);",
            ),
    },
    {
        label: "ViewerPanel no longer owns controller state directly",
        pass:
            !viewerSource.includes("const [captureRequestKey") &&
            !viewerSource.includes("const [isPinPlacementEnabled") &&
            !viewerSource.includes("const [isRecordingPath") &&
            !viewerSource.includes("const [localFocusRequest") &&
            !viewerSource.includes("const [isFullscreen") &&
            !viewerSource.includes("const [viewerReady"),
    },
    {
        label: "ViewerPanel defines pure scene-slice overlay surface",
        pass: viewerSource.includes("const ViewerOverlaySurfaceForSceneSlices = React.memo(function ViewerOverlaySurfaceForSceneSlices("),
    },
    {
        label: "ViewerPanel defines pure scene-slice director HUD",
        pass: viewerSource.includes("const ViewerDirectorHud = React.memo(function ViewerDirectorHud("),
    },
    {
        label: "ViewerPanel defines pure scene-slice selection tray",
        pass: viewerSource.includes("const ViewerSelectionTrayForSceneSlices = React.memo(function ViewerSelectionTrayForSceneSlices("),
    },
    {
        label: "ViewerPanel workspace mode renders pure HUD, overlay surface, and selection tray from controller state",
        pass:
            viewerSource.includes("<ViewerDirectorHud") &&
            viewerSource.includes("<ViewerOverlaySurfaceForSceneSlices") &&
            viewerSource.includes("<ViewerSelectionTrayForSceneSlices"),
    },
    {
        label: "ViewerPanel no longer defines workspace-connected HUD wrapper components",
        pass:
            !viewerSource.includes("const ViewerOverlaySurfaceConnected = React.memo(function ViewerOverlaySurfaceConnected(") &&
            !viewerSource.includes("const ViewerDirectorHudConnected = React.memo(function ViewerDirectorHudConnected(") &&
            !viewerSource.includes("const ViewerSelectionTrayConnected = React.memo(function ViewerSelectionTrayConnected("),
    },
    {
        label: "ViewerPanel renders override director HUD at the parent boundary",
        pass: viewerSource.includes("<ViewerDirectorHud"),
    },
    {
        label: "ViewerPanel renders override overlay surface at the parent boundary",
        pass: viewerSource.includes("<ViewerOverlaySurfaceForSceneSlices"),
    },
    {
        label: "ViewerPanel renders override selection tray at the parent boundary",
        pass: viewerSource.includes("<ViewerSelectionTrayForSceneSlices"),
    },
    {
        label: "ViewerPanel no longer routes workspace scene data through connected wrapper props",
        pass:
            !viewerSource.includes("<ViewerOverlaySurfaceConnected") &&
            !viewerSource.includes("<ViewerDirectorHudConnected") &&
            !viewerSource.includes("<ViewerSelectionTrayConnected"),
    },
    {
        label: "ThreeOverlay no longer accepts a sceneGraph prop",
        pass: !threeOverlaySource.includes("sceneGraph:"),
    },
    {
        label: "ThreeOverlay no longer normalizes a whole workspace scene graph",
        pass: !threeOverlaySource.includes("normalizeWorkspaceSceneGraph("),
    },
    {
        label: "ThreeOverlay accepts explicit environment/assets/pins/viewer props",
        pass:
            threeOverlaySource.includes("environment,") &&
            threeOverlaySource.includes("assets,") &&
            threeOverlaySource.includes("pins,") &&
            threeOverlaySource.includes("viewer,") &&
            threeOverlaySource.includes("focusRequest,") &&
            !threeOverlaySource.includes("interaction:"),
    },
    {
        label: "ThreeOverlay delegates pure surface orchestration to dedicated controller hook",
        pass:
            threeOverlaySource.includes('import { useThreeOverlaySurfaceController } from "./useThreeOverlaySurfaceController";') &&
            threeOverlaySource.includes("const overlaySurface = useThreeOverlaySurfaceController({"),
    },
    {
        label: "ThreeOverlay no longer owns render fallback, preview autofocus, or canvas lifecycle state directly",
        pass:
            !threeOverlaySource.includes("const canvasElementRef = useRef<HTMLCanvasElement | null>(null);") &&
            !threeOverlaySource.includes("const canvasEventCleanupRef = useRef<(() => void) | null>(null);") &&
            !threeOverlaySource.includes("const previewAutofocusKeyRef = useRef(\"\");") &&
            !threeOverlaySource.includes("const [renderMode") &&
            !threeOverlaySource.includes("const [renderError") &&
            !threeOverlaySource.includes("const [renderFallbackReason") &&
            !threeOverlaySource.includes("const [isViewerReady") &&
            !threeOverlaySource.includes("const [previewAutofocusRequest"),
    },
    {
        label: "ThreeOverlay no longer owns scene interaction helper callbacks directly",
        pass:
            !threeOverlaySource.includes("const selectPin = React.useCallback(") &&
            !threeOverlaySource.includes("const clearSceneSelection = React.useCallback(") &&
            !threeOverlaySource.includes("const updateAssetTransform = React.useCallback(") &&
            !threeOverlaySource.includes("const commitSceneTransforms = React.useCallback(") &&
            !threeOverlaySource.includes("const addPin = React.useCallback(") &&
            !threeOverlaySource.includes("const selectSceneAsset = React.useCallback("),
    },
    {
        label: "ThreeOverlay delegates fallback surfaces to a dedicated module",
        pass:
            threeOverlaySource.includes('from "./ThreeOverlayFallbackSurfaces";') &&
            !threeOverlaySource.includes("function ThreeOverlayFallback(") &&
            !threeOverlaySource.includes("function SingleImagePreviewSurface(") &&
            !threeOverlaySource.includes("function InteractiveSingleImageFallbackSurface("),
    },
    {
        label: "ThreeOverlay delegates asset pipeline to a dedicated module",
        pass:
            threeOverlaySource.includes('from "./ThreeOverlaySceneAssets";') &&
            !threeOverlaySource.includes("function SceneAssetNode("),
    },
    {
        label: "ThreeOverlay delegates loading label to a dedicated module",
        pass:
            threeOverlaySource.includes('import { LoadingLabel } from "./ThreeOverlayLoadingLabel";') &&
            !threeOverlaySource.includes("function LoadingLabel("),
    },
    {
        label: "ThreeOverlay delegates camera rig to a dedicated module",
        pass:
            threeOverlaySource.includes('import { CameraRig } from "./ThreeOverlayCameraRig";') &&
            !threeOverlaySource.includes("function CameraRig("),
    },
    {
        label: "ThreeOverlay delegates pin layer to a dedicated module",
        pass:
            threeOverlaySource.includes('import { PinLayer } from "./ThreeOverlayPinLayer";') &&
            !threeOverlaySource.includes("function PinLayer(") &&
            !threeOverlaySource.includes("useThreeOverlayPinLayerController"),
    },
    {
        label: "ThreeOverlay delegates viewport primitives to a dedicated module",
        pass:
            threeOverlaySource.includes('from "./ThreeOverlayViewportPrimitives";') &&
            !threeOverlaySource.includes("function TemporalAntialiasingComposer(") &&
            !threeOverlaySource.includes("function SceneBackgroundLock(") &&
            !threeOverlaySource.includes("function ViewerGrid(") &&
            !threeOverlaySource.includes("function ViewerContactShadows("),
    },
    {
        label: "ThreeOverlay surface controller hook is defined",
        pass: threeOverlaySurfaceControllerSource.includes("export function useThreeOverlaySurfaceController({"),
    },
    {
        label: "ThreeOverlay surface controller composes dedicated runtime and interaction hooks",
        pass:
            threeOverlaySurfaceControllerSource.includes('import { useThreeOverlayViewerRuntimeController } from "./useThreeOverlayViewerRuntimeController";') &&
            threeOverlaySurfaceControllerSource.includes('import { useThreeOverlayInteractionController } from "./useThreeOverlayInteractionController";') &&
            threeOverlaySurfaceControllerSource.includes("const viewerRuntime = useThreeOverlayViewerRuntimeController({") &&
            threeOverlaySurfaceControllerSource.includes("const interactionController = useThreeOverlayInteractionController({"),
    },
    {
        label: "ThreeOverlay surface controller no longer owns render fallback or canvas lifecycle state directly",
        pass:
            !threeOverlaySurfaceControllerSource.includes("const canvasElementRef = useRef<HTMLCanvasElement | null>(null);") &&
            !threeOverlaySurfaceControllerSource.includes("const canvasEventCleanupRef = useRef<(() => void) | null>(null);") &&
            !threeOverlaySurfaceControllerSource.includes("const previewAutofocusKeyRef = useRef(\"\");") &&
            !threeOverlaySurfaceControllerSource.includes("const [renderMode") &&
            !threeOverlaySurfaceControllerSource.includes("const [renderError") &&
            !threeOverlaySurfaceControllerSource.includes("const [renderFallbackReason") &&
            !threeOverlaySurfaceControllerSource.includes("const [isViewerReady") &&
            !threeOverlaySurfaceControllerSource.includes("const [previewAutofocusRequest"),
    },
    {
        label: "ThreeOverlay surface controller no longer owns interaction helper callbacks directly",
        pass:
            !threeOverlaySurfaceControllerSource.includes("const clearSceneSelection = useCallback(") &&
            !threeOverlaySurfaceControllerSource.includes("const updateAssetTransform = useCallback(") &&
            !threeOverlaySurfaceControllerSource.includes("const commitSceneTransforms = useCallback(") &&
            !threeOverlaySurfaceControllerSource.includes("const addPin = useCallback(") &&
            !threeOverlaySurfaceControllerSource.includes("const selectSceneAsset = useCallback("),
    },
    {
        label: "ThreeOverlay surface controller still owns selected asset set composition",
        pass: threeOverlaySurfaceControllerSource.includes("const selectedAssetInstanceIdSet = useMemo(() => new Set(selectedAssetInstanceIds), [selectedAssetInstanceIds]);"),
    },
    {
        label: "ThreeOverlay viewer runtime controller hook is defined",
        pass: threeOverlayViewerRuntimeControllerSource.includes("export function useThreeOverlayViewerRuntimeController({"),
    },
    {
        label: "ThreeOverlay viewer runtime controller owns render fallback and preview autofocus orchestration",
        pass:
            threeOverlayViewerRuntimeControllerSource.includes("const environmentRenderState = useMemo(() => resolveEnvironmentRenderState(environment), [environment]);") &&
            threeOverlayViewerRuntimeControllerSource.includes("const viewerDecision = useMemo(") &&
            threeOverlayViewerRuntimeControllerSource.includes("const singleImagePreviewCamera = useMemo(() => resolveSingleImagePreviewCamera(environmentMetadata), [environmentMetadata]);") &&
            threeOverlayViewerRuntimeControllerSource.includes("const activateViewerFallback = useCallback(") &&
            threeOverlayViewerRuntimeControllerSource.includes("const handlePreviewBounds = useCallback("),
    },
    {
        label: "ThreeOverlay viewer runtime controller owns canvas lifecycle and WebGL context fallback handling",
        pass:
            threeOverlayViewerRuntimeControllerSource.includes("const canvasEventCleanupRef = useRef<(() => void) | null>(null);") &&
            threeOverlayViewerRuntimeControllerSource.includes("const handleCanvasCreated = useCallback(") &&
            threeOverlayViewerRuntimeControllerSource.includes('activateViewerFallback("WebGL context was lost while rendering the viewer.");') &&
            threeOverlayViewerRuntimeControllerSource.includes("onViewerReadyChange((isViewerReady && renderMode === \"webgl\") || usesInteractiveFallback);"),
    },
    {
        label: "EnvironmentSplat is reduced to a thin source-selection shell",
        pass:
            environmentSplatSource.includes('import { LumaEnvironmentSplat } from "./LumaEnvironmentSplat";') &&
            environmentSplatSource.includes('import { SharpGaussianEnvironmentSplat } from "./SharpGaussianEnvironmentSplat";') &&
            environmentSplatSource.includes("const resolved = resolveEnvironmentRenderSource(props);") &&
            !environmentSplatSource.includes("function LumaEnvironmentSplat(") &&
            !environmentSplatSource.includes("function SharpGaussianEnvironmentSplat(") &&
            !environmentSplatSource.includes("new Worker(") &&
            !environmentSplatSource.includes("useFrame("),
    },
    {
        label: "Luma environment renderer lives in a dedicated module",
        pass:
            lumaEnvironmentSplatSource.includes("export function LumaEnvironmentSplat({ source }: { source: string })") &&
            lumaEnvironmentSplatSource.includes("new LumaSplatsLoader(source, false)") &&
            lumaEnvironmentSplatSource.includes("configureLumaForUltra("),
    },
    {
        label: "Sharp Gaussian renderer composes dedicated payload and ordering controllers",
        pass:
            sharpGaussianEnvironmentSplatSource.includes('import { useSharpGaussianPayloadController } from "./useSharpGaussianPayloadController";') &&
            sharpGaussianEnvironmentSplatSource.includes('import { useSharpGaussianOrderingController } from "./useSharpGaussianOrderingController";') &&
            sharpGaussianEnvironmentSplatSource.includes("const sharpGaussian = useSharpGaussianPayloadController({") &&
            sharpGaussianEnvironmentSplatSource.includes("const meshRef = useSharpGaussianOrderingController({"),
    },
    {
        label: "Sharp Gaussian payload lifecycle is extracted into dedicated payload modules",
        pass:
            sharpGaussianPayloadSource.includes("export async function loadSharpGaussianPayload({") &&
            sharpGaussianPayloadSource.includes("buildSharpGaussianPayloadInWorker({") &&
            sharpGaussianPayloadSource.includes("export function buildSharpGaussianPayloadFromSerialized(") &&
            sharpGaussianPayloadControllerSource.includes("const nextPayload = await loadSharpGaussianPayload({") &&
            sharpGaussianPayloadControllerSource.includes("const bounds = resolveSharpGaussianPreviewBounds(payload);"),
    },
    {
        label: "Sharp Gaussian ordering runtime is isolated from the payload lifecycle",
        pass:
            sharpGaussianOrderingControllerSource.includes("export function useSharpGaussianOrderingController({") &&
            sharpGaussianOrderingControllerSource.includes("new SharpGaussianGpuSorter({") &&
            sharpGaussianOrderingControllerSource.includes("syncSharpGaussianOrderTexturePayload(") &&
            !sharpGaussianOrderingControllerSource.includes("loadSharpGaussianPayload({"),
    },
    {
        label: "Sharp Gaussian worker and renderer share common payload constants and types",
        pass:
            sharpGaussianWorkerSource.includes('from "./sharpGaussianShared";') &&
            sharpGaussianSharedSource.includes("export type SerializedSharpGaussianPayload = {") &&
            sharpGaussianSharedSource.includes("export const TARGET_POINTS_PER_CHUNK = 16384;"),
    },
    {
        label: "ThreeOverlay interaction controller hook is defined",
        pass: threeOverlayInteractionControllerSource.includes("export function useThreeOverlayInteractionController({"),
    },
    {
        label: "ThreeOverlay interaction controller owns scene interaction helpers and canvas pin placement",
        pass:
            threeOverlayInteractionControllerSource.includes("const clearSceneSelection = useCallback(") &&
            threeOverlayInteractionControllerSource.includes("const updateAssetTransform = useCallback(") &&
            threeOverlayInteractionControllerSource.includes("const commitSceneTransforms = useCallback(") &&
            threeOverlayInteractionControllerSource.includes("const addPin = useCallback(") &&
            threeOverlayInteractionControllerSource.includes("const selectSceneAsset = useCallback(") &&
            threeOverlayInteractionControllerSource.includes("const addPinAtControlsTarget = useCallback(") &&
            threeOverlayInteractionControllerSource.includes('canvas.addEventListener("click", handleCanvasClick);'),
    },
    {
        label: "ThreeOverlay fallback surface module defines the extracted fallback surfaces",
        pass:
            threeOverlayFallbackSurfacesSource.includes("export const ThreeOverlayFallback = React.memo(function ThreeOverlayFallback(") &&
            threeOverlayFallbackSurfacesSource.includes("export const SingleImagePreviewSurface = React.memo(function SingleImagePreviewSurface(") &&
            threeOverlayFallbackSurfacesSource.includes(
                "export const InteractiveSingleImageFallbackSurface = React.memo(function InteractiveSingleImageFallbackSurface(",
            ),
    },
    {
        label: "ThreeOverlay loading label module defines the extracted loading label",
        pass: threeOverlayLoadingLabelSource.includes("export const LoadingLabel = React.memo(function LoadingLabel("),
    },
    {
        label: "ThreeOverlay scene assets module consumes the dedicated loading label",
        pass: threeOverlaySceneAssetsSource.includes('import { LoadingLabel } from "./ThreeOverlayLoadingLabel";'),
    },
    {
        label: "ThreeOverlay camera rig module defines the extracted camera rig",
        pass:
            threeOverlayCameraRigSource.includes("export const CameraRig = React.memo(function CameraRig(") &&
            threeOverlayCameraRigSource.includes("useThreeOverlayCameraRigController({"),
    },
    {
        label: "ThreeOverlay camera rig controller hook is defined",
        pass: threeOverlayCameraRigControllerSource.includes("export function useThreeOverlayCameraRigController({"),
    },
    {
        label: "Shared viewer camera path recorder hook is defined",
        pass: viewerCameraPathRecorderSource.includes("export function useViewerCameraPathRecorder({"),
    },
    {
        label: "Shared viewer camera path recorder owns requestAnimationFrame sampling and flushes recorded paths",
        pass:
            viewerCameraPathRecorderSource.includes("recordFrame(performance.now());") &&
            viewerCameraPathRecorderSource.includes("frameRequestRef.current = window.requestAnimationFrame(tick);") &&
            viewerCameraPathRecorderSource.includes("onPathRecordedRef.current?.([...nextPath]);"),
    },
    {
        label: "ThreeOverlay camera pose controller hook is defined",
        pass: threeOverlayCameraPoseControllerSource.includes("export function useThreeOverlayCameraPoseController({"),
    },
    {
        label: "ThreeOverlay camera pose controller owns focus, capture, and projection updates",
        pass:
            threeOverlayCameraPoseControllerSource.includes("const { camera } = useThree();") &&
            threeOverlayCameraPoseControllerSource.includes("applyEditorCameraClipping(perspectiveCamera);") &&
            threeOverlayCameraPoseControllerSource.includes("if (!focusRequest || focusRequest.token === lastFocusTokenRef.current)") &&
            threeOverlayCameraPoseControllerSource.includes(
                "if (!onCapturePose || captureRequestKey === 0 || captureRequestKey === lastCaptureRequestRef.current)",
            ),
    },
    {
        label: "ThreeOverlay camera rig controller composes dedicated pose and path recorder hooks",
        pass:
            threeOverlayCameraRigControllerSource.includes(
                'import { useThreeOverlayCameraPoseController } from "./useThreeOverlayCameraPoseController";',
            ) &&
            threeOverlayCameraRigControllerSource.includes('import { useViewerCameraPathRecorder } from "./useViewerCameraPathRecorder";') &&
            threeOverlayCameraRigControllerSource.includes("const perspectiveCamera = useThreeOverlayCameraPoseController({") &&
            threeOverlayCameraRigControllerSource.includes("useViewerCameraPathRecorder({"),
    },
    {
        label: "ThreeOverlay pin layer module defines the extracted pin layer",
        pass:
            threeOverlayPinLayerSource.includes("export const PinLayer = React.memo(function PinLayer(") &&
            threeOverlayPinLayerSource.includes("const pinLayer = useThreeOverlayPinLayerController({"),
    },
    {
        label: "ThreeOverlay pin layer controller hook is defined",
        pass: threeOverlayPinLayerControllerSource.includes("export function useThreeOverlayPinLayerController({"),
    },
    {
        label: "ThreeOverlay pin layer controller owns hover projection and pointer placement orchestration",
        pass:
            threeOverlayPinLayerControllerSource.includes("const { camera, pointer, raycaster, scene } = useThree();") &&
            threeOverlayPinLayerControllerSource.includes("const [hoverPosition, setHoverPosition] = useState<THREE.Vector3 | null>(null);") &&
            threeOverlayPinLayerControllerSource.includes("useFrame(() => {") &&
            threeOverlayPinLayerControllerSource.includes("const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {"),
    },
    {
        label: "ThreeOverlay scene assets module defines the extracted asset node surface",
        pass:
            threeOverlaySceneAssetsSource.includes("export const SceneAssetNode = React.memo(function SceneAssetNode(") &&
            threeOverlaySceneAssetsSource.includes("const assetNode = useThreeOverlayAssetNodeController({") &&
            threeOverlaySceneAssetsSource.includes("<PivotControls") &&
            threeOverlaySceneAssetsSource.includes("AssetFallbackRenderable"),
    },
    {
        label: "ThreeOverlay asset node controller hook is defined",
        pass: threeOverlayAssetNodeControllerSource.includes("export function useThreeOverlayAssetNodeController({"),
    },
    {
        label: "ThreeOverlay asset node controller owns mesh loading/parsing and pivot transform wiring",
        pass:
            threeOverlayAssetNodeControllerSource.includes("async function loadMeshAsset(meshUrl: string, signal: AbortSignal)") &&
            threeOverlayAssetNodeControllerSource.includes("const { scene, loadError } = useThreeOverlayMeshAsset(asset.mesh);") &&
            threeOverlayAssetNodeControllerSource.includes("const handleDrag = useCallback(") &&
            threeOverlayAssetNodeControllerSource.includes("asset.parentWorldMatrix") &&
            threeOverlayAssetNodeControllerSource.includes("const isVisible = asset.visible !== false;") &&
            threeOverlayAssetNodeControllerSource.includes(
                "const controlsVisible = !readOnly && selected && pivotTool.visible && asset.locked !== true && isVisible;",
            ) &&
            threeOverlayAssetNodeControllerSource.includes("const renderMode: SceneAssetNodeRenderMode =") &&
            threeOverlayAssetNodeControllerSource.includes("!asset.mesh || loadError ? \"fallback\" : scene ? \"mesh\" : \"loading\""),
    },
    {
        label: "ThreeOverlay viewport primitives module defines the extracted viewport primitives",
        pass:
            threeOverlayViewportPrimitivesSource.includes("export const TemporalAntialiasingComposer = React.memo(function TemporalAntialiasingComposer(") &&
            threeOverlayViewportPrimitivesSource.includes("export const SceneBackgroundLock = React.memo(function SceneBackgroundLock(") &&
            threeOverlayViewportPrimitivesSource.includes("export const ViewerGrid = React.memo(function ViewerGrid(") &&
            threeOverlayViewportPrimitivesSource.includes("export const ViewerContactShadows = React.memo(function ViewerContactShadows("),
    },
    {
        label: "ThreeOverlay viewport primitives module no longer owns mesh, pin, or camera rig behavior",
        pass:
            !threeOverlayViewportPrimitivesSource.includes("GLTFLoader") &&
            !threeOverlayViewportPrimitivesSource.includes("OBJLoader") &&
            !threeOverlayViewportPrimitivesSource.includes("PivotControls") &&
            !threeOverlayViewportPrimitivesSource.includes("export const SceneAssetNode = React.memo(function SceneAssetNode(") &&
            !threeOverlayViewportPrimitivesSource.includes("export const PinLayer = React.memo(function PinLayer(") &&
            !threeOverlayViewportPrimitivesSource.includes("export const CameraRig = React.memo(function CameraRig("),
    },
    {
        label: "ThreeOverlay fallback surfaces reuse the shared camera path recorder",
        pass:
            threeOverlayFallbackSurfacesSource.includes('import { useViewerCameraPathRecorder } from "./useViewerCameraPathRecorder";') &&
            threeOverlayFallbackSurfacesSource.includes("useViewerCameraPathRecorder({") &&
            !threeOverlayFallbackSurfacesSource.includes("const pathRef = useRef<CameraPathFrame[]>([]);") &&
            !threeOverlayFallbackSurfacesSource.includes("const appendPathFrame = useCallback("),
    },
    {
        label: "ThreeOverlay defines connected workspace wrapper",
        pass: threeOverlaySource.includes("export const ThreeOverlayConnected = React.memo(function ThreeOverlayConnected("),
    },
    {
        label: "ThreeOverlayConnected delegates workspace overlay bridging to dedicated controller hook",
        pass:
            threeOverlaySource.includes('import { useMvpWorkspaceThreeOverlayController } from "@/app/mvp/_hooks/useMvpWorkspaceThreeOverlayController";') &&
            threeOverlaySource.includes("const workspaceThreeOverlay = useMvpWorkspaceThreeOverlayController();"),
    },
    {
        label: "ThreeOverlayConnected no longer reads workspace scene or editor-session selectors directly",
        pass:
            !threeOverlaySource.includes("const sceneStoreActions = useMvpSceneStoreActions();") &&
            !threeOverlaySource.includes("const editorSessionActions = useMvpEditorSessionStoreActions();") &&
            !threeOverlaySource.includes("const environment = useSceneEnvironmentSlice();") &&
            !threeOverlaySource.includes("const assets = useSceneAssetsSlice();") &&
            !threeOverlaySource.includes("const pins = useScenePinsSlice();") &&
            !threeOverlaySource.includes("const viewer = useSceneViewerSlice();") &&
            !threeOverlaySource.includes("const focusRequest = useEditorSessionFocusRequest();"),
    },
    {
        label: "Workspace three overlay controller hook is defined",
        pass: threeOverlayWorkspaceControllerSource.includes("export function useMvpWorkspaceThreeOverlayController() {"),
    },
    {
        label: "Workspace three overlay controller owns scene, editor-session, and document selector reads",
        pass:
            threeOverlayWorkspaceControllerSource.includes("const sceneStoreActions = useMvpSceneStoreActions();") &&
            threeOverlayWorkspaceControllerSource.includes("const editorSessionActions = useMvpEditorSessionStoreActions();") &&
            threeOverlayWorkspaceControllerSource.includes("const environment = useSceneEnvironmentSlice();") &&
            threeOverlayWorkspaceControllerSource.includes("const assets = useSceneAssetsSlice();") &&
            threeOverlayWorkspaceControllerSource.includes("const pins = useScenePinsSlice();") &&
            threeOverlayWorkspaceControllerSource.includes("const viewer = useSceneViewerSlice();") &&
            threeOverlayWorkspaceControllerSource.includes("const selectedNodeIds = useSceneSelectedNodeIds();") &&
            threeOverlayWorkspaceControllerSource.includes("const selectedPinId = useSceneSelectedPinId();") &&
            threeOverlayWorkspaceControllerSource.includes("const activeTool = useSceneActiveTool();") &&
            threeOverlayWorkspaceControllerSource.includes("const focusRequest = useEditorSessionFocusRequest();") &&
            threeOverlayWorkspaceControllerSource.includes("const captureRequestKey = useEditorSessionCaptureRequestKey();") &&
            threeOverlayWorkspaceControllerSource.includes("const assetNodeIdByInstanceId = useRenderableSceneDocumentSelector("),
    },
    {
        label: "Workspace three overlay controller owns asset-selection promotion and transform draft wiring",
        pass:
            threeOverlayWorkspaceControllerSource.includes("const handleSelectAsset = useCallback(") &&
            threeOverlayWorkspaceControllerSource.includes("sceneStoreActions.selectNodes([nodeId], options);") &&
            threeOverlayWorkspaceControllerSource.includes('sceneStoreActions.setActiveTool("translate");') &&
            threeOverlayWorkspaceControllerSource.includes("onBeginTransformSession: sceneStoreActions.beginTransformSession,") &&
            threeOverlayWorkspaceControllerSource.includes("onCommitTransformSession: sceneStoreActions.commitTransformSession,") &&
            threeOverlayWorkspaceControllerSource.includes("onUpdateAssetTransformDraft: sceneStoreActions.updateDraftTransformByAssetInstanceId,") &&
            threeOverlayWorkspaceControllerSource.includes("onCommitSceneTransforms: sceneStoreActions.commitDraftTransforms,"),
    },
    {
        label: "LeftPanel reads workspace shell context for scene mutations",
        pass:
            leftSource.includes('import { useMvpWorkspaceShell } from "@/app/mvp/_state/mvpWorkspaceShellContext";') &&
            leftSource.includes("replaceSceneEnvironment,") &&
            leftSource.includes("} = useMvpWorkspaceShell();"),
    },
    {
        label: "LeftPanel reads workspace session context for intake telemetry",
        pass:
            leftSource.includes('import { useMvpWorkspaceSession } from "@/app/mvp/_state/mvpWorkspaceSessionContext";') &&
            leftSource.includes("setActiveScene,") &&
            leftSource.includes("markProgrammaticSceneChange,") &&
            leftSource.includes("} = useMvpWorkspaceSession();"),
    },
    {
        label: "LeftPanel delegates intake, provider, and capture orchestration to dedicated controller hook",
        pass:
            leftSource.includes('import { useMvpWorkspaceIntakeController } from "@/app/mvp/_hooks/useMvpWorkspaceIntakeController";') &&
            leftSource.includes("const intake = useMvpWorkspaceIntakeController({"),
    },
    {
        label: "LeftPanel shell renders extracted intake section components",
        pass:
            leftSource.includes('import { LeftPanelWorkspaceSummary } from "./LeftPanelWorkspaceSummary";') &&
            leftSource.includes('import { LeftPanelImportSection } from "./LeftPanelImportSection";') &&
            leftSource.includes('import { LeftPanelGenerateSection } from "./LeftPanelGenerateSection";') &&
            leftSource.includes('import { LeftPanelCaptureWorkspace } from "./LeftPanelCaptureWorkspace";') &&
            leftSource.includes('import { LeftPanelActivityLog } from "./LeftPanelActivityLog";') &&
            leftSource.includes("<LeftPanelWorkspaceSummary") &&
            leftSource.includes("<LeftPanelImportSection") &&
            leftSource.includes("<LeftPanelGenerateSection") &&
            leftSource.includes("<LeftPanelCaptureWorkspace") &&
            leftSource.includes("<LeftPanelActivityLog"),
    },
    {
        label: "LeftPanel no longer owns fetch-driven orchestration state directly",
        pass:
            !leftSource.includes("const [isUploading") &&
            !leftSource.includes("const [providerCatalog") &&
            !leftSource.includes("const [captureSession") &&
            !leftSource.includes("async function pollJob(") &&
            !leftSource.includes("fetch(`${MVP_API_BASE_URL}/setup/status`") &&
            !leftSource.includes("handleGenerationStart({"),
    },
    {
        label: "Workspace intake controller composes dedicated intake subcontrollers",
        pass:
            leftPanelIntakeControllerSource.includes("export function useMvpWorkspaceIntakeController({") &&
            leftPanelIntakeControllerSource.includes("const setup = useMvpWorkspaceIntakeSetupController({") &&
            leftPanelIntakeControllerSource.includes("const uploadTray = useMvpWorkspaceUploadTrayController({") &&
            leftPanelIntakeControllerSource.includes("const generation = useMvpWorkspaceGenerationController({") &&
            leftPanelIntakeControllerSource.includes("const capture = useMvpWorkspaceCaptureController({"),
    },
    {
        label: "Workspace intake controller owns shared prompt, status, job, and scene loader state",
        pass:
            leftPanelIntakeControllerSource.includes('const [generatePrompt, setGeneratePrompt] = useState("");') &&
            leftPanelIntakeControllerSource.includes('const [statusText, setStatusText] = useState("");') &&
            leftPanelIntakeControllerSource.includes("const [jobs, setJobs] = useState<JobRecord[]>([]);") &&
            leftPanelIntakeControllerSource.includes("const loadEnvironmentIntoScene = useCallback("),
    },
    {
        label: "Workspace intake controller no longer owns direct fetch or polling side effects",
        pass:
            !leftPanelIntakeControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/setup/status`") &&
            !leftPanelIntakeControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/providers`") &&
            !leftPanelIntakeControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/upload`") &&
            !leftPanelIntakeControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/generate/environment`") &&
            !leftPanelIntakeControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/generate/asset`") &&
            !leftPanelIntakeControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/capture/session`") &&
            !leftPanelIntakeControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/reconstruct/session/") &&
            !leftPanelIntakeControllerSource.includes("async function pollJob("),
    },
    {
        label: "Workspace intake setup controller owns backend and provider fetch orchestration",
        pass:
            leftPanelIntakeSetupControllerSource.includes("export function useMvpWorkspaceIntakeSetupController({") &&
            leftPanelIntakeSetupControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/providers`") &&
            leftPanelIntakeSetupControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/setup/status`") &&
            leftPanelIntakeSetupControllerSource.includes("normalizeSetupStatus(await response.json())"),
    },
    {
        label: "Workspace upload tray controller owns local uploads and reference tray state",
        pass:
            leftPanelUploadTrayControllerSource.includes("export function useMvpWorkspaceUploadTrayController({") &&
            leftPanelUploadTrayControllerSource.includes("const fileInputRef = useRef<HTMLInputElement | null>(null);") &&
            leftPanelUploadTrayControllerSource.includes("const [uploads, setUploads] = useState<UploadItem[]>([]);") &&
            leftPanelUploadTrayControllerSource.includes("const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);") &&
            leftPanelUploadTrayControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/upload`, {"),
    },
    {
        label: "Workspace generation controller owns provider image, preview, and asset runtime",
        pass:
            leftPanelGenerationControllerSource.includes("export function useMvpWorkspaceGenerationController({") &&
            leftPanelGenerationControllerSource.includes("const previewGenerationLockRef = useRef<string | null>(null);") &&
            leftPanelGenerationControllerSource.includes("const assetGenerationLockRef = useRef<string | null>(null);") &&
            leftPanelGenerationControllerSource.includes("const generatedImageLockRef = useRef<string | null>(null);") &&
            leftPanelGenerationControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/generate/environment`, {") &&
            leftPanelGenerationControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/generate/image`, {") &&
            leftPanelGenerationControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/generate/asset`, {"),
    },
    {
        label: "Workspace capture controller owns capture-set and reconstruction lifecycle",
        pass:
            leftPanelCaptureControllerSource.includes("export function useMvpWorkspaceCaptureController({") &&
            leftPanelCaptureControllerSource.includes("const [captureSession, setCaptureSession] = useState<CaptureSessionResponse | null>(null);") &&
            leftPanelCaptureControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/capture/session`, {") &&
            leftPanelCaptureControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/capture/session/${session.session_id}/frames`, {") &&
            leftPanelCaptureControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/reconstruct/session/${captureSession.session_id}`, {"),
    },
    {
        label: "Workspace intake shared module owns polling and payload helpers",
        pass:
            leftPanelSharedIntakeSource.includes("export const POLL_INTERVAL_MS = 1200;") &&
            leftPanelSharedIntakeSource.includes("export async function pollJob(jobId: string): Promise<JobStatusResponse> {") &&
            leftPanelSharedIntakeSource.includes("export async function fetchEnvironmentMetadata(metadataUrl: string) {") &&
            leftPanelSharedIntakeSource.includes("export function deriveCaptureSessionNextCounts("),
    },
    {
        label: "LeftPanel section modules define dedicated UI boundaries",
        pass:
            leftPanelWorkspaceSummarySource.includes("export function LeftPanelWorkspaceSummary({") &&
            leftPanelImportSectionSource.includes("export function LeftPanelImportSection({") &&
            leftPanelGenerateSectionSource.includes("export function LeftPanelGenerateSection({") &&
            leftPanelCaptureWorkspaceSource.includes("export function LeftPanelCaptureWorkspace({") &&
            leftPanelActivityLogSource.includes("export function LeftPanelActivityLog({"),
    },
    {
        label: "RightPanel shell imports extracted right-rail section modules",
        pass:
            rightSource.includes('import { RightPanelHeader } from "./RightPanelHeader";') &&
            rightSource.includes('import { RightPanelWorkspaceOverviewSection } from "./RightPanelWorkspaceOverviewSection";') &&
            rightSource.includes('import { RightPanelReviewSection } from "./RightPanelReviewSection";') &&
            rightSource.includes('import { RightPanelReviewIssuesSection } from "./RightPanelReviewIssuesSection";') &&
            rightSource.includes('import { RightPanelVersionHistorySection } from "./RightPanelVersionHistorySection";') &&
            rightSource.includes('import { RightPanelSceneGraphSection } from "./RightPanelSceneGraphSection";') &&
            rightSource.includes('import { RightPanelLocalAssetsSection } from "./RightPanelLocalAssetsSection";'),
    },
    {
        label: "RightPanel no longer defines inline section components or connected wrappers",
        pass:
            !rightSource.includes("const RightPanelSceneGraphSection = React.memo(function RightPanelSceneGraphSection(") &&
            !rightSource.includes("const RightPanelWorkspaceOverviewSection = React.memo(function RightPanelWorkspaceOverviewSection(") &&
            !rightSource.includes("const RightPanelLocalAssetsSection = React.memo(function RightPanelLocalAssetsSection(") &&
            !rightSource.includes("const RightPanelSceneGraphSectionConnected = React.memo(function RightPanelSceneGraphSectionConnected(") &&
            !rightSource.includes("const RightPanelLocalAssetsSectionConnected = React.memo(function RightPanelLocalAssetsSectionConnected("),
    },
    {
        label: "RightPanel uses extracted right-panel shared helpers for asset tray counts",
        pass:
            rightSource.includes('import { buildLibraryAssetCounts, resolveNextLocalAsset } from "./rightPanelShared";') &&
            rightSource.includes("const libraryAssetCounts = useMemo(() => buildLibraryAssetCounts(assets), [assets]);") &&
            rightSource.includes("const nextLocalAsset = useMemo(() => resolveNextLocalAsset(assetsList, libraryAssetCounts), [assetsList, libraryAssetCounts]);"),
    },
    {
        label: "RightPanel reads narrow workspace scene slices from store-native selectors",
        pass:
            rightSource.includes("useSceneEnvironmentSlice,") &&
            rightSource.includes("useSceneAssetsSlice,") &&
            rightSource.includes("useSceneDirectorBriefSlice,") &&
            rightSource.includes("const environment = useSceneEnvironmentSlice();") &&
            rightSource.includes("const assets = useSceneAssetsSlice();") &&
            rightSource.includes("const directorBrief = useSceneDirectorBriefSlice();") &&
            !rightSource.includes("const sceneGraph = useSceneWorkspaceGraph();"),
    },
    {
        label: "RightPanel reads selected pin from store",
        pass: rightSource.includes("const selectedPinId = useSceneSelectedPinId();"),
    },
    {
        label: "RightPanel reads workspace shell context for scene mutations",
        pass:
            rightSource.includes('import { useMvpWorkspaceShell } from "@/app/mvp/_state/mvpWorkspaceShellContext";') &&
            rightSource.includes("appendSceneAsset: onAddAsset,") &&
            rightSource.includes("removeScenePin: onDeletePin,") &&
            rightSource.includes("} = useMvpWorkspaceShell();"),
    },
    {
        label: "RightPanel reads workspace session context for persistence state",
        pass:
            rightSource.includes('import { useMvpWorkspaceSession } from "@/app/mvp/_state/mvpWorkspaceSessionContext";') &&
            rightSource.includes("activityLog,") &&
            rightSource.includes("manualSave: onManualSave,") &&
            rightSource.includes("} = useMvpWorkspaceSession();"),
    },
    {
        label: "RightPanel no longer rebuilds workspace scene graph from renderable snapshot",
        pass:
            !rightSource.includes("useRenderableSceneDocumentSnapshotGetter();") &&
            !rightSource.includes("useRenderableSceneDocumentSelector(") &&
            !rightSource.includes("sceneDocumentToWorkspaceSceneGraph("),
    },
    {
        label: "RightPanel reads selected view from store",
        pass: rightSource.includes("const selectedViewId = useSceneSelectedViewId();"),
    },
    {
        label: "RightPanel reads editor session actions from store for review orchestration",
        pass:
            rightSource.includes("const editorSessionActions = useMvpEditorSessionStoreActions();") &&
            !rightSource.includes("onFocusRequest?:") &&
            rightSource.includes("editorSessionActions,") &&
            !rightSource.includes("editorSessionActions.requestFocus("),
    },
    {
        label: "RightPanel delegates review and focus orchestration to dedicated controller hook",
        pass:
            rightSource.includes('import { useMvpWorkspaceReviewController } from "@/app/mvp/_hooks/useMvpWorkspaceReviewController";') &&
            rightSource.includes("} = useMvpWorkspaceReviewController({"),
    },
    {
        label: "RightPanel reads narrow direction slices for review orchestration",
        pass:
            rightSource.includes("const cameraViews = useSceneCameraViewsSlice();") &&
            rightSource.includes("const pins = useScenePinsSlice();") &&
            rightSource.includes("const viewer = useSceneViewerSlice();") &&
            rightSource.includes("sceneDocument,") &&
            rightSource.includes("cameraViews,") &&
            rightSource.includes("pins,") &&
            rightSource.includes("viewer,"),
    },
    {
        label: "Workspace review controller composes dedicated persistence, focus, and share subcontrollers",
        pass:
            rightPanelReviewControllerSource.includes("export function useMvpWorkspaceReviewController({") &&
            rightPanelReviewControllerSource.includes("const persistence = useMvpWorkspaceReviewPersistenceController({") &&
            rightPanelReviewControllerSource.includes("const focus = useMvpWorkspaceReviewFocusController({") &&
            rightPanelReviewControllerSource.includes("const share = useMvpWorkspaceReviewShareController({"),
    },
    {
        label: "Workspace review controller consumes document-first review slices instead of whole sceneGraph",
        pass:
            rightPanelReviewControllerSource.includes("sceneDocument: SceneDocumentV2;") &&
            rightPanelReviewControllerSource.includes("cameraViews: CameraView[];") &&
            rightPanelReviewControllerSource.includes("pins: SpatialPin[];") &&
            rightPanelReviewControllerSource.includes("viewer: ViewerState;") &&
            !rightPanelReviewControllerSource.includes("sceneGraph: WorkspaceSceneGraph;"),
    },
    {
        label: "Workspace review controller no longer owns direct fetch, share, export, or focus side effects",
        pass:
            !rightPanelReviewControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/review`") &&
            !rightPanelReviewControllerSource.includes("await fetch(\"/api/review-shares\"") &&
            !rightPanelReviewControllerSource.includes("navigator.clipboard.writeText(link);") &&
            !rightPanelReviewControllerSource.includes("document.createElement(\"a\")") &&
            !rightPanelReviewControllerSource.includes("editorSessionActions.requestFocus("),
    },
    {
        label: "Workspace review persistence controller owns review metadata, comments, and issue persistence",
        pass:
            rightPanelReviewPersistenceControllerSource.includes("export function useMvpWorkspaceReviewPersistenceController({") &&
            rightPanelReviewPersistenceControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/review`, { cache: \"no-store\" });") &&
            rightPanelReviewPersistenceControllerSource.includes("await fetch(`${MVP_API_BASE_URL}/scene/${activeScene}/review`, {") &&
            rightPanelReviewPersistenceControllerSource.includes("versions/${selectedVersion.version_id}/comments") &&
            rightPanelReviewPersistenceControllerSource.includes("setIssueDraft((previous) => ({ ...DEFAULT_ISSUE_DRAFT, author: previous.author || \"Reviewer\" }));"),
    },
    {
        label: "Workspace review focus controller owns editor-session focus requests",
        pass:
            rightPanelReviewFocusControllerSource.includes("export function useMvpWorkspaceReviewFocusController({") &&
            rightPanelReviewFocusControllerSource.includes("sceneStoreActions.selectView(") &&
            rightPanelReviewFocusControllerSource.includes("sceneStoreActions.selectPin(") &&
            rightPanelReviewFocusControllerSource.includes("editorSessionActions.requestFocus("),
    },
    {
        label: "Workspace review share controller owns review-link and export flows",
        pass:
            rightPanelReviewShareControllerSource.includes("export function useMvpWorkspaceReviewShareController({") &&
            rightPanelReviewShareControllerSource.includes("await fetch(\"/api/review-shares\", {") &&
            rightPanelReviewShareControllerSource.includes("await copyTextToClipboard(share.shareUrl);") &&
            rightPanelReviewShareControllerSource.includes("const anchor = document.createElement(\"a\");"),
    },
    {
        label: "Workspace review shared module owns default issue draft and selection helpers",
        pass:
            rightPanelReviewSharedSource.includes("export const DEFAULT_ISSUE_DRAFT: IssueDraft = {") &&
            rightPanelReviewSharedSource.includes("export function resolveSelectedAnchorLabel({") &&
            rightPanelReviewSharedSource.includes("export function resolveSelectedVersion(versions: SceneVersion[], selectedVersionId: string | null) {"),
    },
    {
        label: "RightPanel section modules define the extracted review and scene boundaries",
        pass:
            rightPanelHeaderSource.includes("export const RightPanelHeader = React.memo(function RightPanelHeader(") &&
            rightPanelWorkspaceOverviewSectionSource.includes(
                "export const RightPanelWorkspaceOverviewSection = React.memo(function RightPanelWorkspaceOverviewSection(",
            ) &&
            rightPanelReviewSectionSource.includes("export const RightPanelReviewSection = React.memo(function RightPanelReviewSection(") &&
            rightPanelReviewIssuesSectionSource.includes(
                "export const RightPanelReviewIssuesSection = React.memo(function RightPanelReviewIssuesSection(",
            ) &&
            rightPanelVersionHistorySectionSource.includes(
                "export const RightPanelVersionHistorySection = React.memo(function RightPanelVersionHistorySection(",
            ) &&
            rightPanelSceneGraphSectionSource.includes("export const RightPanelSceneGraphSection = React.memo(function RightPanelSceneGraphSection(") &&
            rightPanelLocalAssetsSectionSource.includes("export const RightPanelLocalAssetsSection = React.memo(function RightPanelLocalAssetsSection("),
    },
    {
        label: "Extracted right-panel sections no longer read scene selectors directly",
        pass:
            !rightPanelWorkspaceOverviewSectionSource.includes("useSceneWorkspaceGraph(") &&
            !rightPanelSceneGraphSectionSource.includes("useSceneWorkspaceGraph(") &&
            !rightPanelLocalAssetsSectionSource.includes("useSceneWorkspaceGraph("),
    },
    {
        label: "RightPanel renders extracted header, review, history, and scene sections",
        pass:
            rightSource.includes("<RightPanelHeader") &&
            rightSource.includes("<RightPanelWorkspaceOverviewSection") &&
            rightSource.includes("<RightPanelReviewSection") &&
            rightSource.includes("<RightPanelReviewIssuesSection") &&
            rightSource.includes("<RightPanelVersionHistorySection") &&
            rightSource.includes("<RightPanelSceneGraphSection") &&
            rightSource.includes("<RightPanelLocalAssetsSection"),
    },
    {
        label: "Right-panel shared module owns formatting and asset-library helpers",
        pass:
            rightPanelSharedSource.includes("export const statusClassName = (state: SaveState) => {") &&
            rightPanelSharedSource.includes("export const issueSeverityClass = (severity: ReviewIssueSeverity) => {") &&
            rightPanelSharedSource.includes("export function buildLibraryAssetCounts(sceneAssets: AssetLike[]) {") &&
            rightPanelSharedSource.includes("export function resolveNextLocalAsset<T extends AssetLike>(assetsList: T[], libraryAssetCounts: Map<string, number>) {"),
    },
];

let failed = false;

for (const requirement of requirements) {
    if (!requirement.pass) {
        failed = true;
        console.error(`panel isolation check failed: ${requirement.label}`);
    } else {
        console.log(`pass: ${requirement.label}`);
    }
}

if (failed) {
    process.exit(1);
}
