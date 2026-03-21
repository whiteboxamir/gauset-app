import { Suspense } from "react";
import ReviewExperience from "@/components/Editor/ReviewExperience";

export default function MVPReviewPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-neutral-400 p-6">Loading review scene...</div>}>
            <ReviewExperience />
        </Suspense>
    );
}
