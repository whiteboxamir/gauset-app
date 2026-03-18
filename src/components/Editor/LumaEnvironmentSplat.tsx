"use client";

import { useEffect, useMemo } from "react";
import { LumaSplatsLoader, LumaSplatsThree } from "@lumaai/luma-web";
import * as THREE from "three";

type LumaSplatsThreeInternal = {
    lumaSplatsWebGL?: {
        enableEnd: boolean;
        maxSortAge: number;
        needsSort: boolean;
        sortAge: number;
        loader?: {
            streaming: boolean;
        };
        loadingAnimation: {
            enabled: boolean;
            particleRevealEnabled: boolean;
        };
        shaderParams: {
            tweakScale: number;
            loadR1: number;
            loadR2: number;
            revealR1: number;
            revealR2: number;
            solidR1: number;
            solidR2: number;
        };
    };
};

function configureLumaForUltra(splat: LumaSplatsThree, camera: THREE.Camera) {
    const internal = splat as unknown as LumaSplatsThreeInternal;
    const lumaSplatsWebGL = internal.lumaSplatsWebGL;
    if (!lumaSplatsWebGL) {
        return;
    }

    const sceneRadius = Math.max(1e-3, splat.boundingSphere?.radius ?? 1);
    const settledRadius = sceneRadius * 1.001;

    lumaSplatsWebGL.enableEnd = false;
    lumaSplatsWebGL.maxSortAge = 1;
    lumaSplatsWebGL.needsSort = true;
    lumaSplatsWebGL.sortAge = lumaSplatsWebGL.maxSortAge;
    if (lumaSplatsWebGL.loader) {
        lumaSplatsWebGL.loader.streaming = false;
    }
    lumaSplatsWebGL.loadingAnimation.enabled = false;
    lumaSplatsWebGL.loadingAnimation.particleRevealEnabled = false;
    lumaSplatsWebGL.shaderParams.tweakScale = 1;
    lumaSplatsWebGL.shaderParams.loadR1 = sceneRadius;
    lumaSplatsWebGL.shaderParams.loadR2 = settledRadius;
    lumaSplatsWebGL.shaderParams.revealR1 = sceneRadius;
    lumaSplatsWebGL.shaderParams.revealR2 = settledRadius;
    lumaSplatsWebGL.shaderParams.solidR1 = sceneRadius;
    lumaSplatsWebGL.shaderParams.solidR2 = settledRadius;

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        lumaSplatsWebGL.needsSort = true;
        lumaSplatsWebGL.sortAge = lumaSplatsWebGL.maxSortAge;
        void direction;
    }
}

export function LumaEnvironmentSplat({ source }: { source: string }) {
    const loader = useMemo(() => new LumaSplatsLoader(source, false), [source]);
    const splat = useMemo(
        () =>
            new LumaSplatsThree({
                loader,
                enableThreeShaderIntegration: true,
                loadingAnimationEnabled: false,
                particleRevealEnabled: false,
                onBeforeRender: (_renderer, _scene, camera, currentSplat) => {
                    configureLumaForUltra(currentSplat, camera);
                },
            }),
        [loader],
    );

    useEffect(() => {
        splat.frustumCulled = false;
        splat.loadingAnimationEnabled = false;
        splat.particleRevealEnabled = false;

        return () => {
            splat.dispose();
        };
    }, [splat]);

    return <primitive object={splat} position={[0, 0, 0]} />;
}
