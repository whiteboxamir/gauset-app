import fs from "node:fs";
import path from "node:path";

const viewerPanelPath = path.join(process.cwd(), "src/components/Editor/ViewerPanel.tsx");
const rightPanelPath = path.join(process.cwd(), "src/components/Editor/RightPanel.tsx");
const threeOverlayPath = path.join(process.cwd(), "src/components/Editor/ThreeOverlay.tsx");
const viewerControllerPath = path.join(process.cwd(), "src/components/Editor/useViewerPanelController.ts");

const viewerSource = fs.readFileSync(viewerPanelPath, "utf8");
const rightSource = fs.readFileSync(rightPanelPath, "utf8");
const threeOverlaySource = fs.readFileSync(threeOverlayPath, "utf8");
const viewerControllerSource = fs.readFileSync(viewerControllerPath, "utf8");

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
        label: "ViewerPanel uses scene snapshot getter in workspace mode",
        pass: viewerSource.includes("const getRenderableSceneDocumentSnapshot = useRenderableSceneDocumentSnapshotGetter();"),
    },
    {
        label: "ViewerPanel workspace mode reads selected pin from store",
        pass: viewerSource.includes("const selectedPinId = useSceneSelectedPinId();"),
    },
    {
        label: "ViewerPanel workspace mode reads selected view from store",
        pass: viewerSource.includes("const selectedViewId = useSceneSelectedViewId();"),
    },
    {
        label: "ViewerPanel workspace mode reads focus request from editor session store",
        pass: viewerSource.includes("const editorSessionFocusRequest = useEditorSessionFocusRequest();"),
    },
    {
        label: "ViewerPanel workspace mode reads capture state from editor session store",
        pass:
            viewerSource.includes("const editorSessionCaptureRequestKey = useEditorSessionCaptureRequestKey();") &&
            viewerSource.includes("const editorSessionPinPlacementEnabled = useEditorSessionPinPlacementEnabled();") &&
            viewerSource.includes("const editorSessionPinType = useEditorSessionPinType();") &&
            viewerSource.includes("const editorSessionRecordingPath = useEditorSessionRecordingPath();") &&
            viewerSource.includes("const editorSessionViewerReady = useEditorSessionViewerReady();"),
    },
    {
        label: "ViewerPanel workspace mode reads editor session actions from store",
        pass: viewerSource.includes("const editorSessionActions = useMvpEditorSessionStoreActions();"),
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
        label: "Viewer interaction controller is decoupled from scene source resolution",
        pass:
            !viewerControllerSource.includes("const overrideSceneSlices =") &&
            !viewerControllerSource.includes("useRenderableSceneDocumentSnapshotGetter("),
    },
    {
        label: "ViewerPanel routes sceneGraph overrides through dedicated override mode",
        pass: viewerSource.includes("if (props.sceneGraph) {") && viewerSource.includes("<ViewerPanelOverrideMode"),
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
        label: "ViewerPanel defines connected overlay surface",
        pass: viewerSource.includes("const ViewerOverlaySurfaceConnected = React.memo(function ViewerOverlaySurfaceConnected("),
    },
    {
        label: "ViewerPanel defines connected director HUD",
        pass: viewerSource.includes("const ViewerDirectorHudConnected = React.memo(function ViewerDirectorHudConnected("),
    },
    {
        label: "ViewerPanel defines connected selection tray",
        pass: viewerSource.includes("const ViewerSelectionTrayConnected = React.memo(function ViewerSelectionTrayConnected("),
    },
    {
        label: "ViewerPanel renders connected director HUD",
        pass: viewerSource.includes("<ViewerDirectorHudConnected"),
    },
    {
        label: "ViewerPanel renders connected overlay surface",
        pass: viewerSource.includes("<ViewerOverlaySurfaceConnected"),
    },
    {
        label: "ViewerPanel renders connected selection tray",
        pass: viewerSource.includes("<ViewerSelectionTrayConnected"),
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
        label: "Connected overlay surface no longer accepts a sceneGraph prop",
        pass: !viewerSource.includes("const ViewerOverlaySurfaceConnected = React.memo(function ViewerOverlaySurfaceConnected({\n    sceneGraph,"),
    },
    {
        label: "Connected director HUD no longer accepts a sceneGraph prop",
        pass: !viewerSource.includes("const ViewerDirectorHudConnected = React.memo(function ViewerDirectorHudConnected({\n    sceneGraph,"),
    },
    {
        label: "Connected selection tray no longer accepts a sceneGraph prop",
        pass: !viewerSource.includes("const ViewerSelectionTrayConnected = React.memo(function ViewerSelectionTrayConnected({\n    sceneGraph,"),
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
        label: "ThreeOverlay defines connected workspace wrapper",
        pass: threeOverlaySource.includes("export const ThreeOverlayConnected = React.memo(function ThreeOverlayConnected("),
    },
    {
        label: "ThreeOverlay connected wrapper reads editor session state from store",
        pass:
            threeOverlaySource.includes("const focusRequest = useEditorSessionFocusRequest();") &&
            threeOverlaySource.includes("const captureRequestKey = useEditorSessionCaptureRequestKey();") &&
            threeOverlaySource.includes("const isPinPlacementEnabled = useEditorSessionPinPlacementEnabled();") &&
            threeOverlaySource.includes("const pinType = useEditorSessionPinType();") &&
            threeOverlaySource.includes("const isRecordingPath = useEditorSessionRecordingPath();"),
    },
    {
        label: "ThreeOverlay connected wrapper reads scene slices from store",
        pass:
            threeOverlaySource.includes("const environment = useSceneEnvironmentSlice();") &&
            threeOverlaySource.includes("const assets = useSceneAssetsSlice();") &&
            threeOverlaySource.includes("const pins = useScenePinsSlice();") &&
            threeOverlaySource.includes("const viewer = useSceneViewerSlice();"),
    },
    {
        label: "RightPanel defines memoized scene graph section",
        pass: rightSource.includes("const RightPanelSceneGraphSection = React.memo(function RightPanelSceneGraphSection("),
    },
    {
        label: "RightPanel defines memoized workspace overview section",
        pass: rightSource.includes("const RightPanelWorkspaceOverviewSection = React.memo(function RightPanelWorkspaceOverviewSection("),
    },
    {
        label: "RightPanel defines memoized local assets section",
        pass: rightSource.includes("const RightPanelLocalAssetsSection = React.memo(function RightPanelLocalAssetsSection("),
    },
    {
        label: "RightPanel uses scene snapshot getter in the parent shell",
        pass: rightSource.includes("const getRenderableSceneDocumentSnapshot = useRenderableSceneDocumentSnapshotGetter();"),
    },
    {
        label: "RightPanel reads selected pin from store",
        pass: rightSource.includes("const selectedPinId = useSceneSelectedPinId();"),
    },
    {
        label: "RightPanel reads selected view from store",
        pass: rightSource.includes("const selectedViewId = useSceneSelectedViewId();"),
    },
    {
        label: "RightPanel uses editor session focus actions from store",
        pass:
            rightSource.includes("const editorSessionActions = useMvpEditorSessionStoreActions();") &&
            !rightSource.includes("onFocusRequest?:") &&
            rightSource.includes("editorSessionActions.requestFocus("),
    },
    {
        label: "RightPanel defines connected scene graph section",
        pass: rightSource.includes("const RightPanelSceneGraphSectionConnected = React.memo(function RightPanelSceneGraphSectionConnected("),
    },
    {
        label: "RightPanel defines connected local assets section",
        pass: rightSource.includes("const RightPanelLocalAssetsSectionConnected = React.memo(function RightPanelLocalAssetsSectionConnected("),
    },
    {
        label: "RightPanel renders extracted scene graph section",
        pass: rightSource.includes("<RightPanelSceneGraphSection"),
    },
    {
        label: "RightPanel renders extracted local assets section",
        pass: rightSource.includes("<RightPanelLocalAssetsSection"),
    },
    {
        label: "RightPanel renders connected workspace overview section",
        pass: rightSource.includes("<RightPanelWorkspaceOverviewSection"),
    },
    {
        label: "RightPanel renders connected scene graph section",
        pass: rightSource.includes("<RightPanelSceneGraphSectionConnected"),
    },
    {
        label: "RightPanel renders connected local assets section",
        pass: rightSource.includes("<RightPanelLocalAssetsSectionConnected"),
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
