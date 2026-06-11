"use client"

import type {
  ApiErrorBody,
  ClusterDetail,
  ClusterState,
  ClusterSummary,
  ClusterWriteRequest,
  NamespaceSummary,
} from "@/lib/types"
import { mockClusters, mockDetail, mockNamespaces } from "@/lib/mock-data"

const API_BASE = "/operator-api/v1"
const MOCK = process.env.NEXT_PUBLIC_VALKEY_OPERATOR_MOCK === "true"

export class OperatorApiError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message)
    this.name = "OperatorApiError"
    this.status = status
    this.code = body.error.code
    this.details = body.error.details
  }
}

type ListClustersParams = {
  namespace?: string
  state?: ClusterState | "all"
  q?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: {
        code: "RequestFailed",
        message: response.statusText,
      },
    }))) as ApiErrorBody
    throw new OperatorApiError(response.status, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function listNamespaces(): Promise<NamespaceSummary[]> {
  if (MOCK) return mockNamespaces
  return request<NamespaceSummary[]>("/namespaces")
}

export async function listClusters({
  namespace,
  state,
  q,
}: ListClustersParams = {}): Promise<ClusterSummary[]> {
  if (MOCK) {
    return mockClusters.filter((cluster) => {
      if (namespace && cluster.namespace !== namespace) return false
      if (state && state !== "all" && cluster.state !== state) return false
      if (q) {
        const needle = q.toLowerCase()
        return (
          cluster.name.toLowerCase().includes(needle) ||
          cluster.namespace.toLowerCase().includes(needle) ||
          cluster.reason.toLowerCase().includes(needle)
        )
      }
      return true
    })
  }

  const params = new URLSearchParams()
  if (namespace) params.set("namespace", namespace)
  if (state && state !== "all") params.set("state", state)
  if (q) params.set("q", q)
  const query = params.toString()
  return request<ClusterSummary[]>(`/clusters${query ? `?${query}` : ""}`)
}

export async function getClusterDetail(
  namespace: string,
  name: string
): Promise<ClusterDetail> {
  if (MOCK) {
    return {
      ...mockDetail,
      cluster: {
        ...mockDetail.cluster,
        metadata: {
          ...mockDetail.cluster.metadata,
          name,
          namespace,
        },
      },
    }
  }

  return request<ClusterDetail>(
    `/namespaces/${encodeURIComponent(namespace)}/clusters/${encodeURIComponent(
      name
    )}`
  )
}

export async function createCluster(
  namespace: string,
  payload: ClusterWriteRequest
): Promise<ClusterDetail> {
  if (MOCK) {
    return getClusterDetail(namespace, payload.metadata.name)
  }

  return request<ClusterDetail>(
    `/namespaces/${encodeURIComponent(namespace)}/clusters`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  )
}

export async function updateCluster(
  namespace: string,
  name: string,
  payload: ClusterWriteRequest
): Promise<ClusterDetail> {
  if (MOCK) {
    return getClusterDetail(namespace, name)
  }

  return request<ClusterDetail>(
    `/namespaces/${encodeURIComponent(namespace)}/clusters/${encodeURIComponent(
      name
    )}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  )
}

export async function dryRunCluster(
  namespace: string,
  payload: ClusterWriteRequest,
  name?: string
): Promise<void> {
  if (MOCK) return

  const path = name
    ? `/namespaces/${encodeURIComponent(namespace)}/clusters/${encodeURIComponent(
        name
      )}/dry-run`
    : `/namespaces/${encodeURIComponent(namespace)}/clusters/dry-run`

  await request(path, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function deleteCluster(
  namespace: string,
  name: string
): Promise<void> {
  if (MOCK) return

  await request(
    `/namespaces/${encodeURIComponent(namespace)}/clusters/${encodeURIComponent(
      name
    )}`,
    {
      method: "DELETE",
    }
  )
}
