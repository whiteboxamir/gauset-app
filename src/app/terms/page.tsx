import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service | GAUSET',
    description: 'Terms of Service for GAUSET by Gnosika Inc.',
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-black text-[#ebebeb] px-6 py-20 md:px-16">
            <div className="max-w-2xl mx-auto">
                <a href="/" className="text-xs uppercase tracking-[0.3em] text-neutral-600 hover:text-neutral-400 transition-colors mb-16 inline-block">
                    ← Back
                </a>

                <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white/90 mb-12">
                    Terms of Service
                </h1>

                <div className="space-y-8 text-sm md:text-base text-neutral-400 leading-relaxed">
                    <p className="text-neutral-500 text-xs uppercase tracking-[0.2em]">
                        Last updated: February 2026
                    </p>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using GAUSET, you agree to be bound by these Terms of Service. If you do not agree, you may not use the service.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">2. Description of Service</h2>
                        <p>
                            GAUSET is a production layer for AI-generated cinema. The service is currently in development, and access is provided on an invite-only basis through our waitlist.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">3. Waitlist</h2>
                        <p>
                            Joining the waitlist does not guarantee access to the product. Invitations are issued at our discretion on a rolling basis.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">4. Intellectual Property</h2>
                        <p>
                            All content, branding, and technology associated with GAUSET are the property of Gnosika Inc. You may not reproduce, distribute, or create derivative works without explicit permission.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">5. Limitation of Liability</h2>
                        <p>
                            GAUSET is provided &ldquo;as is&rdquo; without warranties of any kind. Gnosika Inc. shall not be liable for any damages arising from the use of or inability to use the service.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">6. Changes to Terms</h2>
                        <p>
                            We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of any changes.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">7. Contact</h2>
                        <p>
                            For questions about these terms, please contact Gnosika Inc.
                        </p>
                    </section>
                </div>

                <div className="mt-16 pt-8 border-t border-white/5 text-xs text-neutral-600">
                    © {new Date().getFullYear()} Gnosika Inc.
                </div>
            </div>
        </div>
    );
}
