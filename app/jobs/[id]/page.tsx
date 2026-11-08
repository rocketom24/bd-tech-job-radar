import { Suspense } from "react";
import type { Metadata } from "next";
import { JobDetail } from "@/components/jobs/JobDetail";

export const metadata: Metadata = { title: "Job details" };

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetail id={id} />;
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="container" style={{ minHeight: 400 }} />}>
      <Detail params={params} />
    </Suspense>
  );
}
