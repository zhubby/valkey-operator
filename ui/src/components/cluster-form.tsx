"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Save, ShieldCheck } from "lucide-react"

import { ErrorBanner } from "@/components/error-banner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createCluster,
  dryRunCluster,
  getClusterDetail,
  listNamespaces,
  updateCluster,
} from "@/lib/api"
import {
  defaultFormValues,
  formFromCluster,
  payloadFromForm,
  type ClusterFormValues,
} from "@/lib/cluster-form"

type Mode = "create" | "edit"

export function ClusterForm({
  mode,
  namespace,
  name,
}: {
  mode: Mode
  namespace?: string
  name?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [values, setValues] = React.useState<ClusterFormValues>(() => ({
    ...defaultFormValues,
    namespace: namespace ?? defaultFormValues.namespace,
  }))
  const [localError, setLocalError] = React.useState<Error | null>(null)
  const [validated, setValidated] = React.useState(false)

  const namespaces = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
  })

  const detail = useQuery({
    queryKey: ["cluster", namespace, name],
    queryFn: () => getClusterDetail(namespace!, name!),
    enabled: mode === "edit" && Boolean(namespace && name),
  })

  React.useEffect(() => {
    if (mode === "edit" && detail.data?.cluster) {
      setValues(formFromCluster(detail.data.cluster))
    }
  }, [detail.data?.cluster, mode])

  const dryRun = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      await dryRunCluster(
        values.namespace,
        payload,
        mode === "edit" ? values.name : undefined
      )
    },
    onSuccess: () => {
      setValidated(true)
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      if (mode === "edit") {
        return updateCluster(values.namespace, values.name, payload)
      }
      return createCluster(values.namespace, payload)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["clusters"] })
      router.push(
        `/clusters/${result.cluster.metadata.namespace}/${result.cluster.metadata.name}`
      )
    },
  })

  function buildPayload() {
    setLocalError(null)
    setValidated(false)
    try {
      return payloadFromForm(
        values,
        mode === "edit" ? detail.data?.cluster.metadata.resourceVersion : undefined
      )
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("Invalid form")
      setLocalError(normalized)
      throw normalized
    }
  }

  function update<K extends keyof ClusterFormValues>(
    key: K,
    value: ClusterFormValues[K]
  ) {
    setValidated(false)
    setValues((current) => ({ ...current, [key]: value }))
  }

  const busy = dryRun.isPending || save.isPending
  const error = localError ?? dryRun.error ?? save.error ?? detail.error

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            {mode === "create" ? "Create ValkeyCluster" : "Edit ValkeyCluster"}
          </h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block lg:max-w-3xl">
            Configure the ValkeyCluster spec that the operator reconciles.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => dryRun.mutate()}
          >
            <ShieldCheck className="size-4" />
            Dry run
          </Button>
          <Button form="cluster-form" type="submit" disabled={busy}>
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </div>

      {validated ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" />
          Kubernetes accepted the dry-run request.
        </div>
      ) : null}
      {error ? <ErrorBanner error={error} /> : null}

      <form
        id="cluster-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Tabs defaultValue="core" className="space-y-3">
          <div className="overflow-x-auto">
            <TabsList>
              <TabsTrigger value="core">Core</TabsTrigger>
              <TabsTrigger value="runtime">Runtime</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="core" className="space-y-4">
            <Section title="Identity and topology">
              <Field label="Namespace">
                <Select
                  value={values.namespace}
                  onValueChange={(value) => update("namespace", value)}
                  disabled={mode === "edit"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Namespace" />
                  </SelectTrigger>
                  <SelectContent>
                    {(namespaces.data ?? [{ name: values.namespace }]).map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Name">
                <Input
                  value={values.name}
                  onChange={(event) => update("name", event.target.value)}
                  disabled={mode === "edit"}
                  placeholder="cluster-sample"
                />
              </Field>
              <Field label="Shards">
                <Input
                  type="number"
                  min={0}
                  value={values.shards}
                  onChange={(event) => update("shards", event.target.value)}
                />
              </Field>
              <Field label="Replicas per shard">
                <Input
                  type="number"
                  min={0}
                  value={values.replicas}
                  onChange={(event) => update("replicas", event.target.value)}
                />
              </Field>
              <Field label="Workload type">
                <Select
                  value={values.workloadType}
                  onValueChange={(value) =>
                    update("workloadType", value as ClusterFormValues["workloadType"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="StatefulSet">StatefulSet</SelectItem>
                    <SelectItem value="Deployment">Deployment</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pod disruption budget">
                <Select
                  value={values.podDisruptionBudget}
                  onValueChange={(value) =>
                    update(
                      "podDisruptionBudget",
                      value as ClusterFormValues["podDisruptionBudget"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Managed">Managed</SelectItem>
                    <SelectItem value="Disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            <Section title="Metadata">
              <YamlField
                label="Labels"
                value={values.labelsYaml}
                onChange={(value) => update("labelsYaml", value)}
                placeholder="team: platform"
              />
              <YamlField
                label="Annotations"
                value={values.annotationsYaml}
                onChange={(value) => update("annotationsYaml", value)}
                placeholder="owner: sre"
              />
            </Section>
          </TabsContent>

          <TabsContent value="runtime" className="space-y-4">
            <Section title="Images and resources">
              <Field label="Valkey image">
                <Input
                  value={values.image}
                  onChange={(event) => update("image", event.target.value)}
                  placeholder="valkey/valkey:9.0.0"
                />
              </Field>
              <YamlField
                label="Image pull secrets"
                value={values.imagePullSecretsYaml}
                onChange={(value) => update("imagePullSecretsYaml", value)}
                placeholder="- name: registrycredential"
              />
              <YamlField
                label="Server resources"
                value={values.resourcesYaml}
                onChange={(value) => update("resourcesYaml", value)}
                className="min-h-36"
              />
            </Section>

            <Section title="Persistence">
              <ToggleRow
                label="Enable persistence"
                checked={values.persistenceEnabled}
                onCheckedChange={(checked) => update("persistenceEnabled", checked)}
              />
              <Field label="Volume size">
                <Input
                  value={values.persistenceSize}
                  onChange={(event) =>
                    update("persistenceSize", event.target.value)
                  }
                  disabled={!values.persistenceEnabled}
                  placeholder="10Gi"
                />
              </Field>
              <Field label="StorageClass">
                <Input
                  value={values.persistenceStorageClass}
                  onChange={(event) =>
                    update("persistenceStorageClass", event.target.value)
                  }
                  disabled={!values.persistenceEnabled}
                  placeholder="gp3"
                />
              </Field>
              <Field label="Reclaim policy">
                <Select
                  value={values.persistenceReclaimPolicy}
                  onValueChange={(value) =>
                    update(
                      "persistenceReclaimPolicy",
                      value as ClusterFormValues["persistenceReclaimPolicy"]
                    )
                  }
                  disabled={!values.persistenceEnabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Retain">Retain</SelectItem>
                    <SelectItem value="Delete">Delete</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            <Section title="Exporter">
              <ToggleRow
                label="Enable metrics exporter"
                checked={values.exporterEnabled}
                onCheckedChange={(checked) => update("exporterEnabled", checked)}
              />
              <Field label="Exporter image">
                <Input
                  value={values.exporterImage}
                  onChange={(event) => update("exporterImage", event.target.value)}
                />
              </Field>
              <YamlField
                label="Exporter resources"
                value={values.exporterResourcesYaml}
                onChange={(value) => update("exporterResourcesYaml", value)}
                placeholder={'requests:\n  memory: "64Mi"\n  cpu: "50m"'}
              />
            </Section>
          </TabsContent>

          <TabsContent value="access" className="space-y-4">
            <Section title="TLS">
              <ToggleRow
                label="Enable TLS"
                checked={values.tlsEnabled}
                onCheckedChange={(checked) => update("tlsEnabled", checked)}
              />
              <Field label="Certificate secret">
                <Input
                  value={values.tlsSecretName}
                  onChange={(event) => update("tlsSecretName", event.target.value)}
                  disabled={!values.tlsEnabled}
                  placeholder="valkey-tls"
                />
              </Field>
            </Section>
            <Section title="ACL users">
              <YamlField
                label="Users"
                value={values.usersYaml}
                onChange={(value) => update("usersYaml", value)}
                className="min-h-80"
                placeholder={
                  '- name: alice\n  passwordSecret:\n    name: my-users-secret\n    keys: [alicepw]\n  commands:\n    allow: ["@read", "@write"]\n  keys:\n    readWrite: ["app:*"]'
                }
              />
            </Section>
          </TabsContent>

          <TabsContent value="scheduling" className="space-y-4">
            <Section title="Scheduling">
              <YamlField
                label="Node selector"
                value={values.nodeSelectorYaml}
                onChange={(value) => update("nodeSelectorYaml", value)}
                placeholder="kubernetes.io/arch: amd64"
              />
              <YamlField
                label="Tolerations"
                value={values.tolerationsYaml}
                onChange={(value) => update("tolerationsYaml", value)}
                placeholder={'- key: "dedicated"\n  operator: "Equal"\n  value: "valkey"\n  effect: "NoSchedule"'}
              />
              <YamlField
                label="Affinity"
                value={values.affinityYaml}
                onChange={(value) => update("affinityYaml", value)}
                className="min-h-56"
              />
              <YamlField
                label="Topology spread constraints"
                value={values.topologySpreadYaml}
                onChange={(value) => update("topologySpreadYaml", value)}
                placeholder={'- maxSkew: 1\n  topologyKey: kubernetes.io/hostname\n  whenUnsatisfiable: ScheduleAnyway'}
              />
            </Section>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <Section title="Valkey and pod extensions">
              <YamlField
                label="Valkey config"
                value={values.configYaml}
                onChange={(value) => update("configYaml", value)}
              />
              <YamlField
                label="Additional containers"
                value={values.containersYaml}
                onChange={(value) => update("containersYaml", value)}
                className="min-h-72"
                placeholder={'- name: my-sidecar\n  image: busybox:latest\n  command: ["sh", "-c", "sleep infinity"]'}
              />
            </Section>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function YamlField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className="space-y-1.5 md:col-span-2">
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={`font-mono text-xs leading-5 ${className ?? ""}`}
      />
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex h-8 items-center gap-2">
      <span className="text-sm">{label}</span>
      <Switch
        className="ml-auto"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </label>
  )
}
