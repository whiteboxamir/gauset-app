import * as THREE from "three";

import type { SceneDocumentV2, SceneNodeId } from "../scene-graph/types.ts";
import { EMPTY_SCENE_NODE_REGISTRY, createSceneNodeRegistry, type SceneNodeRegistry } from "./sceneNodeRegistry.ts";

interface SceneRuntimeBinding {
    lifecycleKey: string;
    object: THREE.Object3D;
}

function disposeMaterialTextures(material: THREE.Material) {
    Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) {
            value.dispose();
        }
    });
}

export function disposeThreeObjectResources(object: THREE.Object3D) {
    object.traverse((child) => {
        const geometry = (child as THREE.Mesh).geometry;
        if (geometry && typeof geometry.dispose === "function") {
            geometry.dispose();
        }

        const material = (child as THREE.Mesh).material;
        if (Array.isArray(material)) {
            material.forEach((entry) => {
                disposeMaterialTextures(entry);
                entry.dispose();
            });
            return;
        }

        if (material && typeof material.dispose === "function") {
            disposeMaterialTextures(material);
            material.dispose();
        }
    });
}

export class SceneRuntime {
    private registry: SceneNodeRegistry;
    private readonly bindings = new Map<SceneNodeId, SceneRuntimeBinding>();

    constructor(initialRegistry: SceneNodeRegistry = EMPTY_SCENE_NODE_REGISTRY) {
        this.registry = initialRegistry;
    }

    syncRegistry(nextRegistry: SceneNodeRegistry) {
        this.registry = nextRegistry;

        Array.from(this.bindings.entries()).forEach(([nodeId, binding]) => {
            const nextNode = nextRegistry.byId[nodeId];
            if (!nextNode || nextNode.lifecycleKey !== binding.lifecycleKey) {
                disposeThreeObjectResources(binding.object);
                this.bindings.delete(nodeId);
            }
        });
    }

    syncDocument(document: SceneDocumentV2) {
        const registry = createSceneNodeRegistry(document);
        this.syncRegistry(registry);
        return registry;
    }

    bindObject(nodeId: SceneNodeId, lifecycleKey: string, object: THREE.Object3D) {
        const node = this.registry.byId[nodeId];
        if (!node || node.lifecycleKey !== lifecycleKey) {
            return;
        }

        const current = this.bindings.get(nodeId);
        if (current?.object === object && current.lifecycleKey === lifecycleKey) {
            return;
        }

        if (current && current.object !== object) {
            disposeThreeObjectResources(current.object);
        }

        this.bindings.set(nodeId, {
            lifecycleKey,
            object,
        });
    }

    unbindObject(nodeId: SceneNodeId, object?: THREE.Object3D | null) {
        const current = this.bindings.get(nodeId);
        if (!current) {
            return;
        }

        if (object && current.object !== object) {
            return;
        }

        if (!this.registry.byId[nodeId]) {
            disposeThreeObjectResources(current.object);
        }

        this.bindings.delete(nodeId);
    }

    getRegistry() {
        return this.registry;
    }

    getBoundObject(nodeId: SceneNodeId) {
        return this.bindings.get(nodeId)?.object ?? null;
    }

    dispose() {
        Array.from(this.bindings.values()).forEach((binding) => {
            disposeThreeObjectResources(binding.object);
        });
        this.bindings.clear();
        this.registry = EMPTY_SCENE_NODE_REGISTRY;
    }
}

export function createSceneRuntime(initialRegistry: SceneNodeRegistry = EMPTY_SCENE_NODE_REGISTRY) {
    return new SceneRuntime(initialRegistry);
}
