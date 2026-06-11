# Management UI and API

The repository includes an optional management surface for `ValkeyCluster` resources:

- Rust Axum API embedded in the `manager` binary
- Next.js management UI in `ui/`
- Optional Kustomize overlay in `config/management-api`

The API is disabled by default. It does not implement an application login system; expose it only through trusted Kubernetes networking, port-forwarding, an authenticated ingress, or another protected gateway.

## Run locally

Start the manager with the management API enabled:

```sh
cargo run --bin manager -- --management-api-bind-address=:8082
```

Start the UI:

```sh
cd ui
bun install
VALKEY_OPERATOR_API_BASE=http://127.0.0.1:8082 bun run dev
```

The UI calls `/operator-api/v1/*`. Next.js rewrites those requests to `${VALKEY_OPERATOR_API_BASE}/api/v1/*`.

For visual development without a Kubernetes cluster:

```sh
cd ui
NEXT_PUBLIC_VALKEY_OPERATOR_MOCK=true bun run dev
```

## API endpoints

- `GET /api/v1/namespaces`
- `GET /api/v1/clusters?namespace=&state=&q=`
- `POST /api/v1/namespaces/{namespace}/clusters`
- `POST /api/v1/namespaces/{namespace}/clusters/dry-run`
- `GET /api/v1/namespaces/{namespace}/clusters/{name}`
- `PUT /api/v1/namespaces/{namespace}/clusters/{name}`
- `POST /api/v1/namespaces/{namespace}/clusters/{name}/dry-run`
- `DELETE /api/v1/namespaces/{namespace}/clusters/{name}`

Write requests use:

```json
{
  "metadata": {
    "name": "cluster-sample",
    "resourceVersion": "12345",
    "labels": {},
    "annotations": {}
  },
  "spec": {
    "shards": 3,
    "replicas": 1
  }
}
```

`metadata.resourceVersion` is required for updates and produces `409 Conflict` when missing. `ValkeyNode` resources are exposed only through cluster detail responses for diagnostics.

## Deploy with the optional overlay

Build or apply the overlay:

```sh
kustomize build config/management-api
kubectl apply -k config/management-api
```

Port-forward the ClusterIP Service:

```sh
kubectl -n valkey-operator-system port-forward svc/valkey-operator-controller-manager-management-api-service 8082:8082
```

Then run the UI with:

```sh
cd ui
VALKEY_OPERATOR_API_BASE=http://127.0.0.1:8082 bun run dev
```
