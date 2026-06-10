# syntax=docker/dockerfile:1

FROM rust:1.95-bookworm AS builder

WORKDIR /workspace
COPY Cargo.toml Cargo.lock ./
COPY assets ./assets
COPY src ./src

RUN cargo build --release --bin manager

FROM debian:bookworm-slim
WORKDIR /
COPY --from=builder /etc/ssl/certs /etc/ssl/certs
COPY --from=builder /workspace/target/release/manager /manager
USER 65532:65532

ENTRYPOINT ["/manager"]
