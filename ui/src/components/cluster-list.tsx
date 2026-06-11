"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Plus, RefreshCcw, Search } from "lucide-react"

import { ErrorBanner } from "@/components/error-banner"
import { EmptyState } from "@/components/empty-state"
import { StateBadge } from "@/components/state-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listClusters, listNamespaces } from "@/lib/api"
import type { ClusterState } from "@/lib/types"

const states: Array<ClusterState | "all"> = [
  "all",
  "Initializing",
  "Reconciling",
  "Ready",
  "Degraded",
  "Failed",
]

export function ClusterList() {
  const [namespace, setNamespace] = React.useState("all")
  const [state, setState] = React.useState<ClusterState | "all">("all")
  const [q, setQ] = React.useState("")

  const namespaces = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
  })
  const clusters = useQuery({
    queryKey: ["clusters", namespace, state, q],
    queryFn: () =>
      listClusters({
        namespace: namespace === "all" ? undefined : namespace,
        state,
        q,
      }),
  })

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Valkey clusters
          </h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block lg:max-w-3xl">
            Desired topology, reconcile state, and node readiness across watched namespaces.
          </p>
        </div>
        <Button asChild>
          <Link href="/clusters/new">
            <Plus className="size-4" />
            New cluster
          </Link>
        </Button>
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search name, namespace, reason"
          />
        </label>
        <Select value={namespace} onValueChange={setNamespace}>
          <SelectTrigger>
            <SelectValue placeholder="Namespace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All namespaces</SelectItem>
            {(namespaces.data ?? []).map((item) => (
              <SelectItem key={item.name} value={item.name}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state}
          onValueChange={(value) => setState(value as ClusterState | "all")}
        >
          <SelectTrigger>
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            {states.map((item) => (
              <SelectItem key={item} value={item}>
                {item === "all" ? "All states" : item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            void namespaces.refetch()
            void clusters.refetch()
          }}
        >
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </div>

      {clusters.error ? <ErrorBanner error={clusters.error} /> : null}

      <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Namespace</th>
                <th className="px-3 py-2 text-left font-medium">State</th>
                <th className="px-3 py-2 text-left font-medium">Shards</th>
                <th className="px-3 py-2 text-left font-medium">Replicas</th>
                <th className="px-3 py-2 text-left font-medium">Workload</th>
                <th className="px-3 py-2 text-left font-medium">Reason</th>
                <th className="px-3 py-2 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {clusters.isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b last:border-0">
                    {Array.from({ length: 8 }).map((__, cell) => (
                      <td key={cell} className="px-3 py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : clusters.data?.length ? (
                clusters.data.map((cluster) => (
                  <tr
                    key={`${cluster.namespace}/${cluster.name}`}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2 font-medium">{cluster.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {cluster.namespace}
                    </td>
                    <td className="px-3 py-2">
                      <StateBadge state={cluster.state} />
                    </td>
                    <td className="px-3 py-2">
                      {cluster.readyShards}/{cluster.desiredShards}
                    </td>
                    <td className="px-3 py-2">{cluster.desiredReplicas}</td>
                    <td className="px-3 py-2">{cluster.workloadType}</td>
                    <td className="max-w-60 truncate px-3 py-2 text-muted-foreground">
                      {cluster.reason || "None"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button asChild variant="ghost" size="icon-sm">
                        <Link
                          href={`/clusters/${cluster.namespace}/${cluster.name}`}
                          aria-label={`Open ${cluster.name}`}
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              ) : null}
            </tbody>
          </table>
        </div>
        {!clusters.isLoading && !clusters.data?.length ? (
          <div className="p-4">
            <EmptyState
              title="No clusters found"
              detail="Adjust filters or create a ValkeyCluster in one of the watched namespaces."
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
