import { NextRequest, NextResponse } from 'next/server';
import { supabaseInsert } from '@/lib/supabase';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const email = body.email?.trim().toLowerCase();

        // Validate
        if (!email || !EMAIL_REGEX.test(email)) {
            return NextResponse.json(
                { success: false, message: 'Please enter a valid email.' },
                { status: 400 }
            );
        }

        // Insert into Supabase
        const { error } = await supabaseInsert('waitlist', { email });

        if (error) {
            // Unique constraint violation = duplicate
            if (error.code === '23505') {
                return NextResponse.json(
                    { success: true, message: "You're already in. We'll be in touch." },
                    { status: 200 }
                );
            }
            console.error('Supabase insert error:', error);
            return NextResponse.json(
                { success: false, message: 'Something went wrong. Try again.' },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { success: true, message: "You're in." },
            { status: 201 }
        );
    } catch (err) {
        console.error('Waitlist API error:', err);
        return NextResponse.json(
            { success: false, message: 'Something went wrong. Try again.' },
            { status: 500 }
        );
    }
}
