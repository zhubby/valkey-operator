import { Badge } from "@/components/ui/badge"
import type { ClusterState } from "@/lib/types"

export function StateBadge({ state }: { state: ClusterState | string }) {
  const normalized = state.toLowerCase()
  const variant =
    state === "Ready"
      ? "success"
      : state === "Failed"
        ? "danger"
        : state === "Degraded"
          ? "warning"
          : "outline"

  return (
    <Badge variant={variant} className={`state-${normalized}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {state}
    </Badge>
  )
}
