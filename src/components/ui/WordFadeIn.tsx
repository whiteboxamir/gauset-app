'use client';

import { motion, Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

interface WordFadeInProps {
    text: string;
    className?: string;
    delay?: number;
    duration?: number;
}

export function WordFadeIn({
    text,
    className,
    delay = 0,
    duration = 0.5,
}: WordFadeInProps) {
    const words = text.split(' ');

    const container: Variants = {
        hidden: { opacity: 0 },
        visible: (i = 1) => ({
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: delay,
            },
        }),
    };

    const child: Variants = {
        visible: {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            transition: {
                type: 'spring',
                damping: 12,
                stiffness: 100,
                duration: duration,
            },
        },
        hidden: {
            opacity: 0,
            y: 20,
            filter: 'blur(10px)',
        },
    };

    // Extract gradient/clip classes that must go on individual spans, not the flex parent
    const gradientClasses = [
        'bg-clip-text', 'text-transparent',
    ];
    const bgGradientRegex = /bg-gradient-[\w-]+|from-[\w/[\]]+|via-[\w/[\]]+|to-[\w/[\]]+/g;

    const allClasses = (className || '').split(/\s+/);
    const spanOnlyClasses: string[] = [];
    const containerClasses: string[] = [];

    for (const cls of allClasses) {
        if (gradientClasses.includes(cls) || bgGradientRegex.test(cls)) {
            spanOnlyClasses.push(cls);
            // Reset regex lastIndex
            bgGradientRegex.lastIndex = 0;
        } else {
            containerClasses.push(cls);
        }
    }

    const spanClassName = spanOnlyClasses.length > 0
        ? `mr-3 lg:mr-4 last:mr-0 inline-block ${spanOnlyClasses.join(' ')}`
        : 'mr-3 lg:mr-4 last:mr-0 inline-block';

    return (
        <motion.div
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className={cn('flex flex-wrap', containerClasses.join(' '))}
        >
            {words.map((word, index) => (
                <motion.span variants={child} key={index} className={spanClassName}>
                    {word === '<br/>' ? (
                        <div className="w-full h-0 lg:hidden" />
                    ) : word.includes('<br/>') ? (
                        <>
                            {word.replace('<br/>', '')}
                            <div className="w-full h-0 lg:hidden" />
                        </>
                    ) : (
                        word
                    )}
                </motion.span>
            ))}
        </motion.div>
    );
}
