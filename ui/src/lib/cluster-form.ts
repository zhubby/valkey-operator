import { parse, stringify } from "yaml"

import type {
  ClusterWriteRequest,
  PdbPolicy,
  ReclaimPolicy,
  ValkeyCluster,
  ValkeyClusterSpec,
  WorkloadType,
} from "@/lib/types"

export type ClusterFormValues = {
  namespace: string
  name: string
  labelsYaml: string
  annotationsYaml: string
  shards: string
  replicas: string
  image: string
  imagePullSecretsYaml: string
  workloadType: WorkloadType
  resourcesYaml: string
  persistenceEnabled: boolean
  persistenceSize: string
  persistenceStorageClass: string
  persistenceReclaimPolicy: ReclaimPolicy
  exporterEnabled: boolean
  exporterImage: string
  exporterResourcesYaml: string
  podDisruptionBudget: PdbPolicy
  tlsEnabled: boolean
  tlsSecretName: string
  nodeSelectorYaml: string
  tolerationsYaml: string
  affinityYaml: string
  topologySpreadYaml: string
  usersYaml: string
  configYaml: string
  containersYaml: string
}

export const defaultFormValues: ClusterFormValues = {
  namespace: "default",
  name: "",
  labelsYaml: "",
  annotationsYaml: "",
  shards: "3",
  replicas: "1",
  image: "valkey/valkey:9.0.0",
  imagePullSecretsYaml: "",
  workloadType: "StatefulSet",
  resourcesYaml:
    'requests:\n  memory: "256Mi"\n  cpu: "100m"\nlimits:\n  memory: "512Mi"\n  cpu: "500m"',
  persistenceEnabled: false,
  persistenceSize: "10Gi",
  persistenceStorageClass: "",
  persistenceReclaimPolicy: "Retain",
  exporterEnabled: true,
  exporterImage: "oliver006/redis_exporter:v1.80.0",
  exporterResourcesYaml: "",
  podDisruptionBudget: "Managed",
  tlsEnabled: false,
  tlsSecretName: "",
  nodeSelectorYaml: "",
  tolerationsYaml: "",
  affinityYaml: "",
  topologySpreadYaml: "",
  usersYaml: "",
  configYaml: "maxmemory: 50mb\nmaxmemory-policy: allkeys-lfu",
  containersYaml: "",
}

export function formFromCluster(cluster: ValkeyCluster): ClusterFormValues {
  const spec = cluster.spec
  return {
    ...defaultFormValues,
    namespace: cluster.metadata.namespace ?? "default",
    name: cluster.metadata.name ?? "",
    labelsYaml: toYaml(cluster.metadata.labels),
    annotationsYaml: toYaml(cluster.metadata.annotations),
    shards: String(spec.shards ?? 0),
    replicas: String(spec.replicas ?? 0),
    image: spec.image ?? "",
    imagePullSecretsYaml: toYaml(spec.imagePullSecrets),
    workloadType: spec.workloadType ?? "StatefulSet",
    resourcesYaml: toYaml(spec.resources),
    persistenceEnabled: Boolean(spec.persistence),
    persistenceSize: spec.persistence?.size ?? "10Gi",
    persistenceStorageClass: spec.persistence?.storageClassName ?? "",
    persistenceReclaimPolicy: spec.persistence?.reclaimPolicy ?? "Retain",
    exporterEnabled: spec.exporter?.enabled ?? true,
    exporterImage: spec.exporter?.image ?? "",
    exporterResourcesYaml: toYaml(spec.exporter?.resources),
    podDisruptionBudget: spec.podDisruptionBudget ?? "Managed",
    tlsEnabled: Boolean(spec.tls?.certificate?.secretName),
    tlsSecretName: spec.tls?.certificate?.secretName ?? "",
    nodeSelectorYaml: toYaml(spec.nodeSelector),
    tolerationsYaml: toYaml(spec.tolerations),
    affinityYaml: toYaml(spec.affinity),
    topologySpreadYaml: toYaml(spec.topologySpreadConstraints),
    usersYaml: toYaml(spec.users),
    configYaml: toYaml(spec.config),
    containersYaml: toYaml(spec.containers),
  }
}

export function payloadFromForm(
  values: ClusterFormValues,
  resourceVersion?: string
): ClusterWriteRequest {
  const name = values.name.trim()
  if (!name) throw new Error("metadata.name is required")

  const labels = parseYaml<Record<string, string>>(values.labelsYaml, {})
  const annotations = parseYaml<Record<string, string>>(values.annotationsYaml, {})

  const spec: ValkeyClusterSpec = {
    shards: parseInteger(values.shards, "shards"),
    replicas: parseInteger(values.replicas, "replicas"),
    workloadType: values.workloadType,
    podDisruptionBudget: values.podDisruptionBudget,
    exporter: {
      enabled: values.exporterEnabled,
    },
  }

  assignString(spec, "image", values.image)
  assignYaml(spec, "imagePullSecrets", values.imagePullSecretsYaml, [])
  assignYaml(spec, "resources", values.resourcesYaml, undefined)
  assignYaml(spec, "nodeSelector", values.nodeSelectorYaml, {})
  assignYaml(spec, "tolerations", values.tolerationsYaml, [])
  assignYaml(spec, "affinity", values.affinityYaml, undefined)
  assignYaml(spec, "topologySpreadConstraints", values.topologySpreadYaml, [])
  assignYaml(spec, "users", values.usersYaml, [])
  assignYaml(spec, "containers", values.containersYaml, [])
  assignYaml(spec, "config", values.configYaml, {})

  if (values.exporterImage.trim()) {
    spec.exporter = {
      ...spec.exporter,
      image: values.exporterImage.trim(),
    }
  }
  const exporterResources = parseOptionalYaml<Record<string, unknown>>(
    values.exporterResourcesYaml
  )
  if (exporterResources) {
    spec.exporter = {
      ...spec.exporter,
      resources: exporterResources,
    }
  }

  if (values.persistenceEnabled) {
    if (!values.persistenceSize.trim()) {
      throw new Error("persistence.size is required when persistence is enabled")
    }
    spec.persistence = {
      size: values.persistenceSize.trim(),
      reclaimPolicy: values.persistenceReclaimPolicy,
    }
    if (values.persistenceStorageClass.trim()) {
      spec.persistence.storageClassName = values.persistenceStorageClass.trim()
    }
  }

  if (values.tlsEnabled) {
    if (!values.tlsSecretName.trim()) {
      throw new Error("tls.certificate.secretName is required when TLS is enabled")
    }
    spec.tls = {
      certificate: {
        secretName: values.tlsSecretName.trim(),
      },
    }
  }

  return {
    metadata: {
      name,
      resourceVersion,
      labels,
      annotations,
    },
    spec,
  }
}

function parseInteger(value: string, field: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return parsed
}

function parseYaml<T>(source: string, fallback: T): T {
  if (!source.trim()) return fallback
  return (parse(source) ?? fallback) as T
}

function parseOptionalYaml<T>(source: string): T | undefined {
  if (!source.trim()) return undefined
  return (parse(source) ?? undefined) as T | undefined
}

function toYaml(value: unknown): string {
  if (value == null) return ""
  if (Array.isArray(value) && value.length === 0) return ""
  if (typeof value === "object" && Object.keys(value).length === 0) return ""
  return stringify(value).trimEnd()
}

function assignString<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: string
) {
  if (value.trim()) {
    target[key] = value.trim() as T[K]
  }
}

function assignYaml<T extends object, K extends keyof T>(
  target: T,
  key: K,
  source: string,
  fallback: T[K] | undefined
) {
  const value = parseYaml(source, fallback)
  if (value == null) return
  if (Array.isArray(value) && value.length === 0) return
  if (typeof value === "object" && Object.keys(value).length === 0) return
  target[key] = value as T[K]
}
