'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function Navbar() {
    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="marketing-header mix-blend-difference"
        >
            <div className="marketing-header__inner">
                <div className="marketing-header__row">
                    <div className="marketing-header__group">
                        <Link href="/" className="pointer-events-auto inline-flex items-center text-xl font-medium tracking-tight text-white transition-opacity hover:opacity-80 md:text-2xl">
                            GAUSET
                        </Link>
                    </div>

                    <div className="marketing-header__actions">
                        <Link
                            href="/auth/login"
                            className="pointer-events-auto inline-flex min-h-10 items-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white backdrop-blur-md transition-colors duration-300 hover:bg-white hover:text-black sm:px-5"
                        >
                            Log in
                        </Link>
                    </div>
                </div>
            </div>
        </motion.header>
    );
}
