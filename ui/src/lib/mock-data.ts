import type { ClusterDetail, ClusterSummary, NamespaceSummary } from "@/lib/types"

const now = new Date().toISOString()

export const mockNamespaces: NamespaceSummary[] = [
  { name: "default" },
  { name: "cache-system" },
  { name: "payments" },
]

export const mockClusters: ClusterSummary[] = [
  {
    name: "checkout-cache",
    namespace: "payments",
    state: "Ready",
    reason: "ClusterHealthy",
    message: "All shards are serving traffic",
    shards: 3,
    readyShards: 3,
    desiredShards: 3,
    desiredReplicas: 1,
    workloadType: "StatefulSet",
    resourceVersion: "98123",
    age: now,
  },
  {
    name: "session-cache",
    namespace: "default",
    state: "Reconciling",
    reason: "RebalancingSlots",
    message: "Slots are being redistributed after scale out",
    shards: 2,
    readyShards: 1,
    desiredShards: 3,
    desiredReplicas: 1,
    workloadType: "Deployment",
    resourceVersion: "10294",
    age: now,
  },
]

export const mockDetail: ClusterDetail = {
  cluster: {
    apiVersion: "valkey.io/v1alpha1",
    kind: "ValkeyCluster",
    metadata: {
      name: "checkout-cache",
      namespace: "payments",
      resourceVersion: "98123",
      creationTimestamp: now,
      labels: {
        team: "payments",
      },
      annotations: {},
    },
    spec: {
      image: "valkey/valkey:9.0.0",
      shards: 3,
      replicas: 1,
      workloadType: "StatefulSet",
      podDisruptionBudget: "Managed",
      exporter: {
        enabled: true,
        image: "oliver006/redis_exporter:v1.80.0",
      },
      persistence: {
        size: "10Gi",
        storageClassName: "gp3",
        reclaimPolicy: "Retain",
      },
      resources: {
        requests: { memory: "256Mi", cpu: "100m" },
        limits: { memory: "512Mi", cpu: "500m" },
      },
      config: {
        maxmemory: "50mb",
        "maxmemory-policy": "allkeys-lfu",
      },
      users: [
        {
          name: "app",
          passwordSecret: { name: "checkout-users", keys: ["app"] },
          commands: { allow: ["@read", "@write"], deny: ["@admin"] },
          keys: { readWrite: ["checkout:*"] },
        },
      ],
      tolerations: [],
      nodeSelector: {},
      topologySpreadConstraints: [
        {
          maxSkew: 1,
          topologyKey: "kubernetes.io/hostname",
          whenUnsatisfiable: "ScheduleAnyway",
        },
      ],
    },
    status: {
      state: "Ready",
      reason: "ClusterHealthy",
      message: "All shards are serving traffic",
      shards: 3,
      readyShards: 3,
      conditions: [
        {
          type: "Ready",
          status: "True",
          reason: "ClusterHealthy",
          message: "Cluster is healthy",
          lastTransitionTime: now,
        },
      ],
    },
  },
  nodes: Array.from({ length: 6 }, (_, index) => {
    const shard = Math.floor(index / 2)
    const node = index % 2
    const role = node === 0 ? "primary" : "replica"
    return {
      name: `checkout-cache-${shard}-${node}`,
      namespace: "payments",
      ready: true,
      role,
      podName: `valkey-checkout-cache-${shard}-${node}-0`,
      podIP: `10.40.${shard}.${20 + node}`,
      shardIndex: shard,
      nodeIndex: node,
      observedGeneration: 7,
      conditions: [
        {
          type: "Ready",
          status: "True",
          reason: "PodRunning",
          message: "Pod is running",
          lastTransitionTime: now,
        },
      ],
    }
  }),
  health: {
    state: "Ready",
    reason: "ClusterHealthy",
    message: "All shards are serving traffic",
    readyNodes: 6,
    totalNodes: 6,
    primaries: 3,
    replicas: 3,
  },
}
