#!/bin/bash
set -euo pipefail

echo "===================================="
echo "Valkey Operator Rust DevContainer"
echo "===================================="

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run as root"
  exit 1
fi

case "$(uname -m)" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "WARNING: Unsupported architecture $(uname -m), defaulting to amd64"
    ARCH="amd64"
    ;;
esac

BASH_COMPLETIONS_DIR="/usr/share/bash-completion/completions"
mkdir -p "${BASH_COMPLETIONS_DIR}"

if ! grep -q "source /usr/share/bash-completion/bash_completion" ~/.bashrc 2>/dev/null; then
  echo 'source /usr/share/bash-completion/bash_completion' >> ~/.bashrc
fi

if ! command -v kind >/dev/null 2>&1; then
  curl -fsSL -o /usr/local/bin/kind "https://kind.sigs.k8s.io/dl/latest/kind-linux-${ARCH}"
  chmod +x /usr/local/bin/kind
fi

if ! command -v kubectl >/dev/null 2>&1; then
  KUBECTL_VERSION="$(curl -fsSL https://dl.k8s.io/release/stable.txt)"
  curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl"
  chmod +x /usr/local/bin/kubectl
fi

if ! command -v kustomize >/dev/null 2>&1; then
  curl -fsSL -o /tmp/kustomize.tar.gz "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/v5.8.1/kustomize_v5.8.1_linux_${ARCH}.tar.gz"
  tar -xzf /tmp/kustomize.tar.gz -C /usr/local/bin kustomize
  rm -f /tmp/kustomize.tar.gz
fi

rustup component add rustfmt clippy

kind completion bash > "${BASH_COMPLETIONS_DIR}/kind" 2>/dev/null || true
kubectl completion bash > "${BASH_COMPLETIONS_DIR}/kubectl" 2>/dev/null || true
docker completion bash > "${BASH_COMPLETIONS_DIR}/docker" 2>/dev/null || true

for i in {1..30}; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker network inspect kind >/dev/null 2>&1 || docker network create kind >/dev/null 2>&1 || true

cargo --version
rustc --version
kind version
kubectl version --client
kustomize version
docker --version

echo "DevContainer ready."
