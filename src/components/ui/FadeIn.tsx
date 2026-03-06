'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FadeInProps {
    children: ReactNode;
    className?: string;
    delay?: number;
    direction?: 'up' | 'down' | 'left' | 'right' | 'none';
    duration?: number;
    distance?: number;
}

export function FadeIn({
    children,
    className,
    delay = 0,
    direction = 'up',
    duration = 0.8,
    distance = 30,
}: FadeInProps) {
    const directionOffset = {
        up: { y: distance, x: 0 },
        down: { y: distance * -1, x: 0 },
        left: { x: distance, y: 0 },
        right: { x: distance * -1, y: 0 },
        none: { x: 0, y: 0 },
    };

    return (
        <motion.div
            initial={{
                opacity: 0,
                ...directionOffset[direction],
            }}
            whileInView={{
                opacity: 1,
                y: 0,
                x: 0,
            }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{
                duration,
                delay,
                ease: [0.21, 0.47, 0.32, 0.98], // Apple-like easing (easeOutQuint)
            }}
            className={cn(className)}
        >
            {children}
        </motion.div>
    );
}
