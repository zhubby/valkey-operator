"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit, RefreshCcw, Trash2 } from "lucide-react"
import { stringify } from "yaml"

import { ErrorBanner } from "@/components/error-banner"
import { StateBadge } from "@/components/state-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { deleteCluster, getClusterDetail } from "@/lib/api"

export function ClusterDetailView({
  namespace,
  name,
}: {
  namespace: string
  name: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const detail = useQuery({
    queryKey: ["cluster", namespace, name],
    queryFn: () => getClusterDetail(namespace, name),
  })
  const remove = useMutation({
    mutationFn: () => deleteCluster(namespace, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clusters"] })
      router.push("/clusters")
    },
  })

  const data = detail.data

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{namespace}</Badge>
            {data ? <StateBadge state={data.health.state} /> : null}
          </div>
          <h1 className="break-words text-2xl font-semibold tracking-normal">
            {name}
          </h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block lg:max-w-3xl">
            {data?.health.message || "Cluster state from ValkeyCluster status and ValkeyNode resources."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void detail.refetch()}>
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
          <Button asChild variant="outline">
            <Link href={`/clusters/${namespace}/${name}/edit`}>
              <Edit className="size-4" />
              Edit
            </Link>
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete ValkeyCluster</DialogTitle>
                <DialogDescription>
                  Deleting {namespace}/{name} removes the parent custom resource.
                  Owned ValkeyNode resources are garbage-collected by Kubernetes.
                </DialogDescription>
              </DialogHeader>
              {remove.error ? <ErrorBanner error={remove.error} /> : null}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={remove.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {detail.error ? <ErrorBanner error={detail.error} /> : null}

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Ready nodes", data ? `${data.health.readyNodes}/${data.health.totalNodes}` : "-"],
          ["Primaries", data?.health.primaries ?? "-"],
          ["Replicas", data?.health.replicas ?? "-"],
          ["Ready shards", data?.cluster.status?.readyShards ?? "-"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="nodes" className="space-y-3">
        <TabsList>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="spec">Spec YAML</TabsTrigger>
        </TabsList>
        <TabsContent value="nodes">
          <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Node</th>
                    <th className="px-3 py-2 text-left font-medium">Ready</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className="px-3 py-2 text-left font-medium">Shard</th>
                    <th className="px-3 py-2 text-left font-medium">Pod</th>
                    <th className="px-3 py-2 text-left font-medium">Pod IP</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.nodes ?? []).map((node) => (
                    <tr key={node.name} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{node.name}</td>
                      <td className="px-3 py-2">
                        <Badge variant={node.ready ? "success" : "warning"}>
                          {node.ready ? "Ready" : "Not ready"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{node.role || "-"}</td>
                      <td className="px-3 py-2">
                        {node.shardIndex ?? "-"} / {node.nodeIndex ?? "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {node.podName || "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {node.podIP || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="conditions">
          <div className="grid gap-3 md:grid-cols-2">
            {(data?.cluster.status?.conditions ?? []).map((condition) => (
              <div key={condition.type} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{condition.type}</div>
                  <Badge
                    variant={
                      condition.status === "True"
                        ? "success"
                        : condition.status === "False"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {condition.status}
                  </Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {condition.reason}
                </div>
                <div className="mt-1 text-sm">{condition.message}</div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="spec">
          <pre className="max-h-[620px] overflow-auto rounded-lg border bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
            {data ? stringify(data.cluster) : "Loading..."}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}
