export type ClusterState =
  | "Initializing"
  | "Reconciling"
  | "Ready"
  | "Degraded"
  | "Failed"

export type WorkloadType = "StatefulSet" | "Deployment"
export type PdbPolicy = "Managed" | "Disabled"
export type ReclaimPolicy = "Retain" | "Delete"

export type Condition = {
  type: string
  status: "True" | "False" | "Unknown" | string
  reason: string
  message: string
  lastTransitionTime?: string
  observedGeneration?: number
}

export type ValkeyClusterSpec = {
  image?: string
  imagePullSecrets?: Array<Record<string, unknown>>
  shards?: number
  replicas?: number
  resources?: Record<string, unknown>
  tolerations?: Array<Record<string, unknown>>
  nodeSelector?: Record<string, string>
  affinity?: Record<string, unknown>
  topologySpreadConstraints?: Array<Record<string, unknown>>
  exporter?: {
    image?: string
    resources?: Record<string, unknown>
    enabled?: boolean
  }
  workloadType?: WorkloadType
  persistence?: {
    size: string
    storageClassName?: string
    reclaimPolicy?: ReclaimPolicy
  }
  users?: Array<Record<string, unknown>>
  containers?: Array<Record<string, unknown>>
  config?: Record<string, string>
  tls?: {
    certificate?: {
      secretName?: string
    }
  }
  podDisruptionBudget?: PdbPolicy
}

export type ValkeyCluster = {
  apiVersion?: string
  kind?: string
  metadata: {
    name?: string
    namespace?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    resourceVersion?: string
    creationTimestamp?: string
    generation?: number
  }
  spec: ValkeyClusterSpec
  status?: {
    state?: ClusterState
    reason?: string
    message?: string
    shards?: number
    readyShards?: number
    conditions?: Condition[]
  }
}

export type NamespaceSummary = {
  name: string
}

export type ClusterSummary = {
  name: string
  namespace: string
  state: ClusterState
  reason: string
  message: string
  shards: number
  readyShards: number
  desiredShards: number
  desiredReplicas: number
  workloadType: WorkloadType | string
  resourceVersion: string
  age?: string
}

export type NodeSummary = {
  name: string
  namespace: string
  ready: boolean
  role: string
  podName: string
  podIP: string
  shardIndex?: number
  nodeIndex?: number
  observedGeneration: number
  conditions: Condition[]
}

export type ClusterHealth = {
  state: ClusterState
  reason: string
  message: string
  readyNodes: number
  totalNodes: number
  primaries: number
  replicas: number
}

export type ClusterDetail = {
  cluster: ValkeyCluster
  nodes: NodeSummary[]
  health: ClusterHealth
}

export type ClusterWriteRequest = {
  metadata: {
    name: string
    resourceVersion?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: ValkeyClusterSpec
}

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
