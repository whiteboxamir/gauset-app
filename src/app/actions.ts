'use server';

import db from '@/lib/db';
import { z } from 'zod';

const emailSchema = z.string().email();

export async function submitWaitlist(formData: FormData) {
    const email = formData.get('email');

    try {
        const validEmail = emailSchema.parse(email);

        const stmt = db.prepare('INSERT INTO waitlist (email) VALUES (?)');
        stmt.run(validEmail);

        // Simulate slight network delay for premium feel
        await new Promise(r => setTimeout(r, 600));

        return { success: true, message: "You're in. Early access secured." };
    } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return { success: true, message: "You're already in. We'll be in touch." };
        }
        return { success: false, message: "Please provide a valid email." };
    }
}

import { cookies } from 'next/headers';

export async function loginUser(formData: FormData) {
    const email = formData.get('email');
    try {
        const validEmail = emailSchema.parse(email);
        const stmt = db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)');
        stmt.run(validEmail);

        await new Promise(r => setTimeout(r, 800)); // Artificial latency for premium feel

        // Save dummy auth token to simulate logged-in backend state
        const cookieStore = await cookies();
        cookieStore.set('auth-token', validEmail, { path: '/' });

        return { success: true, message: "Welcome back." };
    } catch {
        return { success: false, message: "Invalid email." };
    }
}

