# Contributing to Valkey Operator

Thank you for your interest in contributing to the Valkey Operator.

## Getting Started

### Prerequisites

- Rust stable toolchain.
- Docker or Podman.
- kubectl v1.31+.
- kustomize, or kubectl with built-in `kubectl kustomize`.
- Access to a Kubernetes cluster for install/deploy testing.

### Development Setup

See the [Developer Guide](./docs/developer-guide.md) for detailed setup instructions.

Quick start:

```bash
make fmt
make check
make test
make lint
make manifests
```

Run the operator locally against your current kubeconfig:

```bash
make install
make run
```

## How to Contribute

### Reporting Bugs

Found a bug? Please [open an issue](https://github.com/valkey-io/valkey-operator/issues/new).

### Suggesting Features

Have an idea? Start a discussion in [GitHub Discussions](https://github.com/valkey-io/valkey-operator/discussions) under the "Ideas" category.

### Submitting Pull Requests

1. Fork the repository and create a branch from `main`.
2. Make your changes following the local style.
3. Add focused tests for new behavior.
4. Run `make fmt-check check test lint manifests`.
5. Update documentation and samples when behavior changes.
6. Commit with a clear message describing what changed and why.
7. Open a Pull Request using the PR template.

Stack PRs for larger changes. Keep each PR focused and reviewable.

## Developer Certificate of Origin

This project requires all contributors to sign off commits, certifying that they have the right to submit the code under the project's license.

Use:

```bash
git commit -s -m "Add new feature"
```

This adds a line like:

```text
Signed-off-by: Your Name <your.email@example.com>
```

## Coding Standards

- Prefer idiomatic Rust and existing local patterns.
- Keep changes minimal and avoid unrelated refactors.
- Run `cargo fmt` before committing, or use `make fmt`.
- Run `cargo clippy --all-targets --all-features -- -D warnings`, or use `make lint`.
- Add deterministic unit tests for config rendering, ACL generation, resource construction, and Valkey topology planning when those areas change.
- When `src/api.rs` changes, update `config/crd/bases/` intentionally and run `make manifests`.

## Project Structure

```text
valkey-operator/
├── src/api.rs              # Custom resource API types
├── src/main.rs             # Manager entry point
├── src/controller/         # Reconciliation and Kubernetes resource builders
├── src/valkey.rs           # Valkey protocol and slot/topology logic
├── assets/scripts/         # Health check scripts mounted into Valkey pods
├── config/                 # Kubernetes manifests and kustomize configs
└── docs/                   # Documentation
```

## Testing

```bash
make test
cargo test --lib
cargo test valkey::tests::plan_rebalance
```

## API and RBAC Changes

If you change the CRD API:

1. Edit `src/api.rs`.
2. Update the corresponding CRD YAML in `config/crd/bases/`.
3. Update sample resources in `config/samples/` if needed.
4. Run `make manifests` and `make test`.

If RBAC permissions change, update `config/rbac/role.yaml` and keep any downstream Helm chart permissions in sync.

## Development Workflow

```bash
# 1. Make code changes
$EDITOR src/controller/cluster.rs

# 2. Format and validate
make fmt
make check
make test
make lint
make manifests

# 3. Build and test the container
make docker-build IMG=valkey-operator:dev

# 4. Deploy to a test cluster
make deploy IMG=valkey-operator:dev
```

## Code Review Process

- All submissions require review from maintainers.
- PRs should pass all CI checks before merging.
- Keep summaries and testing notes concrete.

## Questions?

- Ask in [GitHub Discussions](https://github.com/valkey-io/valkey-operator/discussions).
- Check the [Developer Guide](./docs/developer-guide.md).
- Read the [Support Guide](./SUPPORT.md).

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
