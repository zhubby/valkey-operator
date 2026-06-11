"use client";

import { useParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ClusterDetailView } from "@/components/cluster-detail";

export default function ClusterDetailPage() {
  const params = useParams<{ namespace: string; name: string }>();

  return (
    <AppShell>
      <ClusterDetailView namespace={params.namespace} name={params.name} />
    </AppShell>
  );
}
