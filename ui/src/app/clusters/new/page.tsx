import { AppShell } from "@/components/app-shell";
import { ClusterForm } from "@/components/cluster-form";

export default function NewClusterPage() {
  return (
    <AppShell>
      <ClusterForm mode="create" />
    </AppShell>
  );
}
