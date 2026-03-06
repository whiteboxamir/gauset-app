'use client';

import { EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

export function FilmGrainEffect() {
    return (
        <EffectComposer multisampling={0}>
            <Noise
                premultiply
                blendFunction={BlendFunction.SOFT_LIGHT}
                opacity={0.4}
            />
            <Vignette
                offset={0.3}
                darkness={0.7}
                blendFunction={BlendFunction.NORMAL}
            />
        </EffectComposer>
    );
}
