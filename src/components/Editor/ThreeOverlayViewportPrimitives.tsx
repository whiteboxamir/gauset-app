"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { ContactShadows, Grid } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { TAARenderPass } from "three/examples/jsm/postprocessing/TAARenderPass.js";

type TAARenderPassInternal = TAARenderPass & { accumulateIndex: number };

const sceneBackgroundScratchColor = new THREE.Color();

export const TemporalAntialiasingComposer = React.memo(function TemporalAntialiasingComposer() {
    const { camera, gl, scene, size } = useThree();
    const composerRef = useRef<EffectComposer | null>(null);
    const taaPassRef = useRef<TAARenderPassInternal | null>(null);
    const lastCameraPositionRef = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
    const lastCameraQuaternionRef = useRef(new THREE.Quaternion());
    const lastProjectionMatrixRef = useRef(new THREE.Matrix4());

    useEffect(() => {
        const composer = new EffectComposer(gl);
        composer.setPixelRatio(gl.getPixelRatio());
        composer.setSize(size.width, size.height);

        const taaPass = new TAARenderPass(scene, camera, 0x000000, 0) as TAARenderPassInternal;
        taaPass.unbiased = true;
        taaPass.sampleLevel = 2;
        taaPass.accumulate = true;
        taaPass.accumulateIndex = -1;
        composer.addPass(taaPass);

        composerRef.current = composer;
        taaPassRef.current = taaPass;
        lastCameraPositionRef.current.copy(camera.position);
        lastCameraQuaternionRef.current.copy(camera.quaternion);
        lastProjectionMatrixRef.current.copy(camera.projectionMatrix);

        return () => {
            taaPass.dispose();
            composer.dispose();
            composerRef.current = null;
            taaPassRef.current = null;
        };
    }, [camera, gl, scene, size.height, size.width]);

    useEffect(() => {
        const composer = composerRef.current;
        const taaPass = taaPassRef.current;
        if (!composer || !taaPass) {
            return;
        }

        composer.setPixelRatio(gl.getPixelRatio());
        composer.setSize(size.width, size.height);
        taaPass.accumulateIndex = -1;
    }, [gl, size.height, size.width]);

    useFrame((_, delta) => {
        const composer = composerRef.current;
        const taaPass = taaPassRef.current;
        if (!composer || !taaPass) {
            return;
        }

        const positionDeltaSq = lastCameraPositionRef.current.distanceToSquared(camera.position);
        const rotationDelta = 1 - Math.abs(lastCameraQuaternionRef.current.dot(camera.quaternion));
        const projectionChanged = !lastProjectionMatrixRef.current.equals(camera.projectionMatrix);

        if (positionDeltaSq > 1e-8 || rotationDelta > 1e-8 || projectionChanged) {
            taaPass.accumulateIndex = -1;
            lastCameraPositionRef.current.copy(camera.position);
            lastCameraQuaternionRef.current.copy(camera.quaternion);
            lastProjectionMatrixRef.current.copy(camera.projectionMatrix);
        }

        composer.render(delta);
    }, 1);

    return null;
});

export const SceneBackgroundLock = React.memo(function SceneBackgroundLock({ backgroundColor }: { backgroundColor: string }) {
    const { gl, scene } = useThree();
    const background = useMemo(() => new THREE.Color(backgroundColor), [backgroundColor]);

    useEffect(() => {
        const previousBackground = scene.background;
        const previousClearColor = gl.getClearColor(new THREE.Color()).clone();
        const previousClearAlpha = gl.getClearAlpha();

        scene.background = background;
        gl.setClearColor(background, 1);
        gl.domElement.style.backgroundColor = backgroundColor;

        return () => {
            scene.background = previousBackground;
            gl.setClearColor(previousClearColor, previousClearAlpha);
        };
    }, [background, backgroundColor, gl, scene]);

    useFrame(() => {
        if (!(scene.background instanceof THREE.Color) || !scene.background.equals(background)) {
            scene.background = background;
        }

        if (!gl.getClearColor(sceneBackgroundScratchColor).equals(background) || gl.getClearAlpha() !== 1) {
            gl.setClearColor(background, 1);
        }

        if (gl.domElement.style.backgroundColor !== backgroundColor) {
            gl.domElement.style.backgroundColor = backgroundColor;
        }
    }, -1);

    return null;
});

export const ViewerGrid = React.memo(function ViewerGrid() {
    return (
        <Grid
            args={[30, 30]}
            cellSize={1}
            cellThickness={0.8}
            cellColor="#3f3f46"
            sectionSize={5}
            sectionThickness={1.2}
            sectionColor="#71717a"
            fadeDistance={45}
            fadeStrength={1}
        />
    );
});

export const ViewerContactShadows = React.memo(function ViewerContactShadows() {
    return <ContactShadows position={[0, -0.5, 0]} opacity={0.35} scale={30} blur={2.2} far={8} />;
});
