import { AppShell } from "@/components/app-shell";
import { ClusterList } from "@/components/cluster-list";

export default function ClustersPage() {
  return (
    <AppShell>
      <ClusterList />
    </AppShell>
  );
}
