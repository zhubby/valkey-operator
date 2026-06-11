ARG RUST_IMAGE=rust:1.95-bookworm
ARG RUNTIME_IMAGE=debian:bookworm-slim
ARG CARGO_REGISTRY_REPLACE_WITH
ARG CARGO_REGISTRY_REPLACEMENT_URL

FROM ${RUST_IMAGE} AS builder
ARG CARGO_REGISTRY_REPLACE_WITH
ARG CARGO_REGISTRY_REPLACEMENT_URL

WORKDIR /workspace
COPY Cargo.toml Cargo.lock ./

RUN if [ -n "$CARGO_REGISTRY_REPLACE_WITH" ] && [ -n "$CARGO_REGISTRY_REPLACEMENT_URL" ]; then \
      mkdir -p "${CARGO_HOME:-/usr/local/cargo}" && \
      printf '[source.crates-io]\nreplace-with = "%s"\n\n[source.%s]\nregistry = "%s"\n' \
        "$CARGO_REGISTRY_REPLACE_WITH" \
        "$CARGO_REGISTRY_REPLACE_WITH" \
        "$CARGO_REGISTRY_REPLACEMENT_URL" \
        > "${CARGO_HOME:-/usr/local/cargo}/config.toml"; \
    fi

RUN mkdir -p src && \
    printf 'fn main() {}\n' > src/main.rs && \
    cargo build --release --bin manager && \
    rm -rf src

COPY assets ./assets
COPY src ./src

RUN cargo build --release --bin manager

FROM ${RUNTIME_IMAGE}
WORKDIR /
COPY --from=builder /etc/ssl/certs /etc/ssl/certs
COPY --from=builder /workspace/target/release/manager /manager
USER 65532:65532

ENTRYPOINT ["/manager"]
