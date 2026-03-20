import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "src/app/mvp/MVPRouteClient.tsx");
const runtimePath = path.join(process.cwd(), "src/app/mvp/_components/MVPWorkspaceRuntime.tsx");
const shellPath = path.join(process.cwd(), "src/app/mvp/_hooks/useMvpWorkspaceShellController.ts");
const sessionPath = path.join(process.cwd(), "src/app/mvp/_hooks/useMvpWorkspaceSessionController.ts");
const sceneStoreContextPath = path.join(process.cwd(), "src/state/mvpSceneStoreContext.tsx");
const routeSource = fs.readFileSync(routePath, "utf8");
const runtimeSource = fs.readFileSync(runtimePath, "utf8");
const shellSource = fs.readFileSync(shellPath, "utf8");
const sessionSource = fs.readFileSync(sessionPath, "utf8");
const sceneStoreContextSource = fs.readFileSync(sceneStoreContextPath, "utf8");

const requirements = [
    {
        label: "editor session store provider wrapper",
        pass: routeSource.includes("<MvpEditorSessionStoreProvider"),
    },
    {
        label: "scene store provider wrapper",
        pass: routeSource.includes("<MvpSceneStoreProvider store={sceneStoreRef.current}>"),
    },
    {
        label: "MVPRouteClient uses workspace shell controller hook",
        pass: routeSource.includes("const workspaceShell = useMvpWorkspaceShellController({"),
    },
    {
        label: "MVPRouteClient uses workspace session controller hook",
        pass: routeSource.includes("const workspaceSession = useMvpWorkspaceSessionController({"),
    },
    {
        label: "workspace shell provider wrapper",
        pass: routeSource.includes("<MvpWorkspaceShellProvider workspace={workspaceShell}>"),
    },
    {
        label: "workspace session provider wrapper",
        pass: routeSource.includes("<MvpWorkspaceSessionProvider session={workspaceSession}>"),
    },
    {
        label: "MVPRouteClient renders dedicated workspace runtime component",
        pass: routeSource.includes("<MVPWorkspaceRuntime"),
    },
    {
        label: "MVPRouteClient no longer serializes scene graph for workspace session",
        pass:
            !routeSource.includes("serializeSceneDocumentToPersistedSceneGraph(") &&
            !routeSource.includes("const sceneGraph = useMemo(") &&
            !routeSource.includes("useSyncExternalStore("),
    },
    {
        label: "MVPRouteClient no longer owns renderable scene snapshot caching",
        pass:
            !routeSource.includes("renderSceneDocumentSnapshotRef") &&
            !routeSource.includes("getRenderableSceneDocumentSnapshot") &&
            !routeSource.includes("selectRenderableSceneDocument"),
    },
    {
        label: "scene store provider owns renderable scene snapshot getter",
        pass:
            sceneStoreContextSource.includes("const getRenderableSceneDocumentSnapshot = useMemo(() => createRenderableSceneDocumentSnapshotGetter(store), [store]);") &&
            !sceneStoreContextSource.includes("value: MvpSceneStoreContextValue;"),
    },
    {
        label: "workspace session controller derives renderable document from scene store",
        pass:
            sessionSource.includes("const getRenderableSceneDocumentSnapshot = useMemo(() => createRenderableSceneDocumentSnapshotGetter(sceneStore), [sceneStore]);") &&
            sessionSource.includes("const renderableSceneDocument = useSyncExternalStore("),
    },
    {
        label: "workspace session controller no longer serializes renderable document through persisted adapter",
        pass:
            !sessionSource.includes("serializeSceneDocumentToPersistedSceneGraph(") &&
            !sessionSource.includes("selectWorkspaceSceneGraphFromDocument(renderableSceneDocument)") &&
            !sessionSource.includes("selectCompatibilityWorkspaceSceneGraphFromDocument(renderableSceneDocument)") &&
            !sessionSource.includes("const getSceneGraphSnapshot = useCallback(") &&
            sessionSource.includes("sceneDocument: renderableSceneDocument,") &&
            sessionSource.includes("getSceneDocumentSnapshot: getRenderableSceneDocumentSnapshot,"),
    },
    {
        label: "workspace session controller composes dedicated persistence controller hook",
        pass: sessionSource.includes("const workspacePersistence = useMvpWorkspacePersistenceController({"),
    },
    {
        label: "workspace session controller composes dedicated telemetry controller hook",
        pass: sessionSource.includes("const workspaceTelemetry = useMvpWorkspaceTelemetryController({"),
    },
    {
        label: "workspace session controller composes dedicated HUD controller hook",
        pass: sessionSource.includes("const workspaceHud = useMvpWorkspaceHudController({ routeVariant });"),
    },
    {
        label: "workspace session controller no longer owns persistence and HUD state directly",
        pass:
            !sessionSource.includes("const [entryMode") &&
            !sessionSource.includes("const [saveState") &&
            !sessionSource.includes("const [versions") &&
            !sessionSource.includes("const [storedDraft") &&
            !sessionSource.includes("const [hudState") &&
            !sessionSource.includes("const [activityLog") &&
            !sessionSource.includes("const [stepStatus"),
    },
    {
        label: "workspace shell controller no longer derives renderable document snapshots",
        pass:
            !shellSource.includes("createRenderableSceneDocumentSnapshotGetter(") &&
            !shellSource.includes("useSyncExternalStore(") &&
            !shellSource.includes("selectWorkspaceSceneGraphFromDocument(") &&
            !shellSource.includes("selectCompatibilityWorkspaceSceneGraphFromDocument("),
    },
    {
        label: "workspace shell controller owns direct scene mutation helpers",
        pass:
            shellSource.includes("const replaceSceneEnvironment = useCallback(") &&
            shellSource.includes("const appendSceneAsset = useCallback(") &&
            shellSource.includes("const duplicateSceneAsset = useCallback(") &&
            shellSource.includes("const removeSceneAsset = useCallback(") &&
            shellSource.includes("const removeScenePin = useCallback(") &&
            shellSource.includes("const removeSceneView = useCallback("),
    },
    {
        label: "workspace runtime reads workspace session context",
        pass:
            runtimeSource.includes('import { useMvpWorkspaceSession } from "../_state/mvpWorkspaceSessionContext";') &&
            runtimeSource.includes("const workspaceSession = useMvpWorkspaceSession();"),
    },
    {
        label: "workspace runtime owns launchpad gating and fingerprint badge",
        pass:
            runtimeSource.includes("<MVPClarityLaunchpad") &&
            runtimeSource.includes("<DeploymentFingerprintBadge"),
    },
    {
        label: "workspace runtime owns editor chrome and panel composition",
        pass:
            runtimeSource.includes("<LeftPanel") &&
            runtimeSource.includes("<ViewerPanel") &&
            runtimeSource.includes("<RightPanel") &&
            runtimeSource.includes("const MVPWorkspaceFrame = React.memo(function MVPWorkspaceFrame("),
    },
    {
        label: "LeftPanel not receiving workspace shell orchestration props from MVPRouteClient",
        pass:
            !/<LeftPanel[\s\S]*?setActiveScene=/.test(routeSource) &&
            !/<LeftPanel[\s\S]*?setAssetsList=/.test(routeSource) &&
            !/<LeftPanel[\s\S]*?onLoadEnvironment=/.test(routeSource) &&
            !/<LeftPanel[\s\S]*?onProgrammaticSceneChange=/.test(routeSource) &&
            !/<LeftPanel[\s\S]*?onInputReady=/.test(routeSource) &&
            !/<LeftPanel[\s\S]*?onGenerationStart=/.test(routeSource) &&
            !/<LeftPanel[\s\S]*?onGenerationSuccess=/.test(routeSource) &&
            !/<LeftPanel[\s\S]*?onGenerationError=/.test(routeSource),
    },
    {
        label: "MVPRouteClient no longer renders launchpad or panels directly",
        pass:
            !routeSource.includes("<MVPClarityLaunchpad") &&
            !routeSource.includes("<LeftPanel") &&
            !routeSource.includes("<ViewerPanel") &&
            !routeSource.includes("<RightPanel"),
    },
    {
        label: "ViewerPanel not receiving sceneGraph prop from MVPRouteClient",
        pass: !/<ViewerPanel[\s\S]*?sceneGraph=/.test(routeSource),
    },
    {
        label: "ViewerPanel not receiving live scene mutation props from MVPRouteClient",
        pass:
            !/<ViewerPanel[\s\S]*?onAppendAsset=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onUpdateAssetTransformDraft=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onCommitSceneTransforms=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onAppendPin=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onUpdateViewerState=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onAppendCameraView=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onSetDirectorPath=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onUpdateDirectorBrief=/.test(routeSource),
    },
    {
        label: "ViewerPanel not receiving editor selection props from MVPRouteClient",
        pass:
            !/<ViewerPanel[\s\S]*?selectedPinId=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onSelectPin=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?selectedViewId=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onSelectView=/.test(routeSource),
    },
    {
        label: "ViewerPanel not receiving editor focus props from MVPRouteClient",
        pass: !/<ViewerPanel[\s\S]*?focusRequest=/.test(routeSource),
    },
    {
        label: "ViewerPanel not receiving workspace HUD props from MVPRouteClient",
        pass:
            !/<ViewerPanel[\s\S]*?leftHudCollapsed=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?rightHudCollapsed=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?directorHudCompact=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onToggleLeftHud=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onToggleRightHud=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?onToggleDirectorHud=/.test(routeSource) &&
            !/<ViewerPanel[\s\S]*?processingStatus=/.test(routeSource),
    },
    {
        label: "RightPanel not receiving sceneGraph prop from MVPRouteClient",
        pass: !/<RightPanel[\s\S]*?sceneGraph=/.test(routeSource),
    },
    {
        label: "RightPanel not receiving editor selection props from MVPRouteClient",
        pass:
            !/<RightPanel[\s\S]*?selectedPinId=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onSelectPin=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?selectedViewId=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onSelectView=/.test(routeSource),
    },
    {
        label: "RightPanel not receiving editor focus props from MVPRouteClient",
        pass: !/<RightPanel[\s\S]*?onFocusRequest=/.test(routeSource),
    },
    {
        label: "RightPanel not receiving workspace shell props from MVPRouteClient",
        pass:
            !/<RightPanel[\s\S]*?activityLog=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?changeSummary=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?lastOutputLabel=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?assetsList=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?activeScene=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?saveState=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?saveMessage=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?saveError=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?lastSavedAt=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?versions=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onManualSave=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onRestoreVersion=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onExport=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onDeletePin=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onDeleteView=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onDuplicateAsset=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onDeleteAsset=/.test(routeSource) &&
            !/<RightPanel[\s\S]*?onAddAsset=/.test(routeSource),
    },
    {
        label: "MVPRouteClient no longer owns pin and view selection state",
        pass: !routeSource.includes("const [selectedPinId") && !routeSource.includes("const [selectedViewId"),
    },
    {
        label: "MVPRouteClient no longer owns viewer focus request state",
        pass: !routeSource.includes("const [focusRequest") && !routeSource.includes("handleFocusRequest"),
    },
    {
        label: "MVPRouteClient no longer owns workspace shell state directly",
        pass:
            !routeSource.includes("const [entryMode") &&
            !routeSource.includes("const [activeScene") &&
            !routeSource.includes("const [assetsList") &&
            !routeSource.includes("const [saveState") &&
            !routeSource.includes("const [saveMessage") &&
            !routeSource.includes("const [saveError") &&
            !routeSource.includes("const [lastSavedAt") &&
            !routeSource.includes("const [versions") &&
            !routeSource.includes("const [storedDraft") &&
            !routeSource.includes("const [stepStatus") &&
            !routeSource.includes("const [activityLog") &&
            !routeSource.includes("const [currentInputLabel") &&
            !routeSource.includes("const [lastOutputInputLabel") &&
            !routeSource.includes("const [lastOutputSceneGraph") &&
            !routeSource.includes("const [lastOutputLabel") &&
            !routeSource.includes("const [hudState"),
    },
];

let failed = false;

for (const requirement of requirements) {
    if (!requirement.pass) {
        failed = true;
        console.error(`fanout check failed: ${requirement.label}`);
    } else {
        console.log(`pass: ${requirement.label}`);
    }
}

if (failed) {
    process.exit(1);
}
