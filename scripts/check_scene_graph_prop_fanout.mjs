import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "src/app/mvp/MVPRouteClient.tsx");
const source = fs.readFileSync(routePath, "utf8");

const requirements = [
    {
        label: "editor session store provider wrapper",
        pass: source.includes("<MvpEditorSessionStoreProvider"),
    },
    {
        label: "scene store provider wrapper",
        pass: source.includes("<MvpSceneStoreProvider"),
    },
    {
        label: "MVPRouteClient uses workspace shell controller hook",
        pass: source.includes("const workspace = useMvpWorkspaceShellController({"),
    },
    {
        label: "ViewerPanel not receiving sceneGraph prop from MVPRouteClient",
        pass: !/<ViewerPanel[\s\S]*?sceneGraph=/.test(source),
    },
    {
        label: "ViewerPanel not receiving live scene mutation props from MVPRouteClient",
        pass:
            !/<ViewerPanel[\s\S]*?onAppendAsset=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onUpdateAssetTransformDraft=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onCommitSceneTransforms=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onAppendPin=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onUpdateViewerState=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onAppendCameraView=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onSetDirectorPath=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onUpdateDirectorBrief=/.test(source),
    },
    {
        label: "ViewerPanel not receiving editor selection props from MVPRouteClient",
        pass:
            !/<ViewerPanel[\s\S]*?selectedPinId=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onSelectPin=/.test(source) &&
            !/<ViewerPanel[\s\S]*?selectedViewId=/.test(source) &&
            !/<ViewerPanel[\s\S]*?onSelectView=/.test(source),
    },
    {
        label: "ViewerPanel not receiving editor focus props from MVPRouteClient",
        pass: !/<ViewerPanel[\s\S]*?focusRequest=/.test(source),
    },
    {
        label: "RightPanel not receiving sceneGraph prop from MVPRouteClient",
        pass: !/<RightPanel[\s\S]*?sceneGraph=/.test(source),
    },
    {
        label: "RightPanel not receiving editor selection props from MVPRouteClient",
        pass:
            !/<RightPanel[\s\S]*?selectedPinId=/.test(source) &&
            !/<RightPanel[\s\S]*?onSelectPin=/.test(source) &&
            !/<RightPanel[\s\S]*?selectedViewId=/.test(source) &&
            !/<RightPanel[\s\S]*?onSelectView=/.test(source),
    },
    {
        label: "RightPanel not receiving editor focus props from MVPRouteClient",
        pass: !/<RightPanel[\s\S]*?onFocusRequest=/.test(source),
    },
    {
        label: "MVPRouteClient no longer owns pin and view selection state",
        pass: !source.includes("const [selectedPinId") && !source.includes("const [selectedViewId"),
    },
    {
        label: "MVPRouteClient no longer owns viewer focus request state",
        pass: !source.includes("const [focusRequest") && !source.includes("handleFocusRequest"),
    },
    {
        label: "MVPRouteClient no longer owns workspace shell state directly",
        pass:
            !source.includes("const [entryMode") &&
            !source.includes("const [activeScene") &&
            !source.includes("const [assetsList") &&
            !source.includes("const [saveState") &&
            !source.includes("const [saveMessage") &&
            !source.includes("const [saveError") &&
            !source.includes("const [lastSavedAt") &&
            !source.includes("const [versions") &&
            !source.includes("const [storedDraft") &&
            !source.includes("const [stepStatus") &&
            !source.includes("const [activityLog") &&
            !source.includes("const [currentInputLabel") &&
            !source.includes("const [lastOutputInputLabel") &&
            !source.includes("const [lastOutputSceneGraph") &&
            !source.includes("const [lastOutputLabel") &&
            !source.includes("const [hudState"),
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
