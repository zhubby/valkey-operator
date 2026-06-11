"use client";

import { useParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ClusterForm } from "@/components/cluster-form";

export default function EditClusterPage() {
  const params = useParams<{ namespace: string; name: string }>();

  return (
    <AppShell>
      <ClusterForm
        mode="edit"
        namespace={params.namespace}
        name={params.name}
      />
    </AppShell>
  );
}
