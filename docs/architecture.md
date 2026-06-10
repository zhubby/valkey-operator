# Architecture

This document describes the internal implementation of the valkey-operator for developers contributing to the codebase.

For the user-facing API see [valkeycluster.md](valkeycluster.md). For the ValkeyNode CRD design rationale see [valkeynode-design.md](valkeynode-design.md). For status conditions and events see [status-conditions.md](status-conditions.md).

## Controllers

### ValkeyClusterReconciler

`src/controller/cluster.rs` owns top-level orchestration. Each reconcile loop:

1. Upserts a headless Service and PodDisruptionBudget
2. Reconciles ACL users (Secret with type `valkey.io/acl`)
3. Upserts a ConfigMap containing `valkey.conf` and health-check scripts. A SHA-256 of `valkey.conf` is propagated to each ValkeyNode spec to trigger rolling restarts when config changes
4. Creates/updates ValkeyNode CRs — one per (shard, node-index) pair, named `<cluster>-<N>-<M>`. Updates are one-at-a-time, replicas-before-primary within each shard
5. Connects to live pods via `valkey::get_cluster_state` (CLUSTER INFO / CLUSTER NODES) to build a `ClusterState`
6. Issues CLUSTER MEET, CLUSTER ADDSLOTSRANGE, CLUSTER REPLICATE in phases
7. Handles scale-in (drains slots via CLUSTER MIGRATESLOTS, deletes excess ValkeyNodes) and scale-out (rebalances slots via `valkey::plan_rebalance_move`)

### ValkeyNodeReconciler

`src/controller/node.rs` manages the workload for a single node:

1. Ensures a ConfigMap (skipped if `serverConfigMapName` is set, i.e. when owned by ValkeyCluster)
2. Ensures a PVC (if persistence is configured)
3. Ensures a StatefulSet or Deployment (determined by `spec.workloadType`, immutable)
4. Updates `status.ready`, `status.podIP`, `status.role` (fetched via INFO replication), and `status.observedGeneration`

## Key packages

- `src/api.rs` — Kubernetes custom resource definitions used by the Rust controller
- `src/valkey.rs` — Valkey protocol layer: `ClusterState` / `NodeState` types, CLUSTER NODES parsing, slot range arithmetic, slot migration and rebalancing logic
- `src/controller/config.rs` — builds `valkey.conf` from `spec.config`, embeds `assets/scripts/` into the ConfigMap
- `src/controller/users.rs` — manages the internal `_operator` system user Secret and user-defined ACL Secrets
- `src/controller/resources.rs` — builds Services, PodDisruptionBudgets, StatefulSets, Deployments, PVCs, probes, affinity, and volumes
- `src/controller/mod.rs` — shared naming, labels, owner references, status condition helpers, and server-side apply helpers

## Naming convention

ValkeyNode names encode position: `<cluster>-<shardIndex>-<nodeIndex>`. Node-index 0 is the *initial* primary; 1+ are replicas. After a failover, Valkey may promote a replica — the labels are not updated; the live role is always read from CLUSTER NODES. Labels `valkey.io/shard-index` and `valkey.io/node-index` are used by the reconciler to determine slot assignment vs. replication.

## Config hash propagation

When `valkey.conf` changes, ValkeyCluster computes a SHA-256 of the rendered `valkey.conf` string and writes it to `ValkeyNode.spec.serverConfigHash`. The ValkeyNode controller stamps this as a pod template annotation, triggering a rolling restart.

## Manifests

The checked-in Kubernetes manifests remain the deployable API surface:

- `config/crd/bases/*.yaml`
- `config/rbac/role.yaml`

`make manifests` validates that CRD manifests are present and render through kustomize. When changing `src/api.rs`, update the CRD YAML intentionally in the same change.

## Controller design patterns

- **Idempotent reconciliation** — every reconcile loop must be safe to run multiple times with the same outcome
- **Server-side apply** — build desired Kubernetes objects and apply them with a stable field manager
- **Structured logging** — use `tracing` fields rather than formatting operational context into the message string
- **Owner references** — set via `owner_reference` to enable automatic garbage collection of child resources
- **Watch secondary resources** — use kube-runtime ownership watches so changes to owned resources trigger reconciliation

## Testing

The current Rust test suite is made of deterministic unit tests for config rendering, ACL generation, and Valkey slot/topology planning. Run it with `cargo test` or `make test`. See [developer-guide.md](developer-guide.md) for commands.
