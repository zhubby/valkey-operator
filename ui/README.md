# Valkey Operator UI

Next.js management console for the Valkey Operator management API.

## Development

Install dependencies with Bun:

```sh
bun install
```

Run against a local manager API:

```sh
VALKEY_OPERATOR_API_BASE=http://127.0.0.1:8082 bun run dev
```

The UI calls `/operator-api/v1/*`; `next.config.ts` rewrites those requests to
`${VALKEY_OPERATOR_API_BASE}/api/v1/*`.

For visual work without a Kubernetes cluster:

```sh
NEXT_PUBLIC_VALKEY_OPERATOR_MOCK=true bun run dev
```

## Checks

```sh
bun run typecheck
bun run lint
bun run build
```
