import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy | GAUSET',
    description: 'Privacy Policy for GAUSET by Gnosika Inc.',
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-black text-[#ebebeb] px-6 py-20 md:px-16">
            <div className="max-w-2xl mx-auto">
                <a href="/" className="text-xs uppercase tracking-[0.3em] text-neutral-600 hover:text-neutral-400 transition-colors mb-16 inline-block">
                    ← Back
                </a>

                <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white/90 mb-12">
                    Privacy Policy
                </h1>

                <div className="space-y-8 text-sm md:text-base text-neutral-400 leading-relaxed">
                    <p className="text-neutral-500 text-xs uppercase tracking-[0.2em]">
                        Last updated: February 2026
                    </p>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">1. Information We Collect</h2>
                        <p>
                            When you join our waitlist, we collect your email address. We do not collect any other personal information at this time.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">2. How We Use Your Information</h2>
                        <p>
                            We use your email address solely to communicate with you about GAUSET, including product updates, launch announcements, and early access invitations.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">3. Data Storage</h2>
                        <p>
                            Your information is stored securely using industry-standard encryption and security practices. We do not sell, trade, or share your personal information with third parties.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">4. Your Rights</h2>
                        <p>
                            You may request deletion of your data at any time by contacting us. We will remove your information from our systems promptly upon request.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-medium text-white/80">5. Contact</h2>
                        <p>
                            For any privacy-related inquiries, please contact Gnosika Inc.
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
