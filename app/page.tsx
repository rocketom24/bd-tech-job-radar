import { Suspense } from "react";
import { JobDiscovery } from "@/components/jobs/JobDiscovery";

export default function Home() {
  // useSearchParams (inside JobDiscovery) needs a Suspense boundary under Cache Components.
  return (
    <Suspense fallback={<div className="container" style={{ minHeight: 600 }} />}>
      <JobDiscovery />
    </Suspense>
  );
}
