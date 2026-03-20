"use client";

import type { SceneDocumentV2, SceneNodeId, SceneNodeKind, SceneNodeRecord } from "@/lib/scene-graph/types.ts";

export interface SceneTreeRow {
    nodeId: SceneNodeId;
    node: SceneNodeRecord;
    depth: number;
    effectiveVisible: boolean;
    effectiveLocked: boolean;
    hiddenByAncestor: boolean;
    lockedByAncestor: boolean;
}

export function formatSceneNodeKindLabel(kind: SceneNodeKind) {
    switch (kind) {
        case "group":
            return "Group";
        case "camera":
            return "Camera";
        case "light":
            return "Light";
        case "mesh":
            return "Asset";
        case "splat":
            return "World";
        default:
            return "Node";
    }
}

export function buildSceneTreeRows(document: SceneDocumentV2) {
    const rows: SceneTreeRow[] = [];

    const visitNode = (nodeId: SceneNodeId, depth: number, parentVisible: boolean, parentLocked: boolean) => {
        const node = document.nodes[nodeId];
        if (!node) {
            return;
        }

        const effectiveVisible = parentVisible && node.visible !== false;
        const effectiveLocked = parentLocked || node.locked === true;
        rows.push({
            nodeId,
            node,
            depth,
            effectiveVisible,
            effectiveLocked,
            hiddenByAncestor: parentVisible && node.visible === false ? false : !parentVisible,
            lockedByAncestor: parentLocked,
        });

        node.childIds.forEach((childId) => {
            visitNode(childId, depth + 1, effectiveVisible, effectiveLocked);
        });
    };

    document.rootIds.forEach((nodeId) => {
        visitNode(nodeId, 0, true, false);
    });

    return rows;
}

export function isSceneTreeDescendant(document: SceneDocumentV2, nodeId: SceneNodeId, ancestorId: SceneNodeId) {
    let currentParentId = document.nodes[nodeId]?.parentId ?? null;
    while (currentParentId) {
        if (currentParentId === ancestorId) {
            return true;
        }
        currentParentId = document.nodes[currentParentId]?.parentId ?? null;
    }
    return false;
}

export function collectSceneGroupTargets(document: SceneDocumentV2, nodeId: SceneNodeId | null = null) {
    return buildSceneTreeRows(document).flatMap((row) => {
        if (row.node.kind !== "group") {
            return [];
        }
        if (nodeId && (row.nodeId === nodeId || isSceneTreeDescendant(document, row.nodeId, nodeId))) {
            return [];
        }
        return [
            {
                id: row.nodeId,
                label: `${"  ".repeat(row.depth)}${row.node.name}`,
            },
        ];
    });
}
