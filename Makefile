IMG                  ?= controller:latest
CONTAINER_IMAGE_NAME ?= $(IMG)
CONTAINER_TOOL       ?= docker
CARGO                ?= cargo
KUBECTL              ?= kubectl
KUSTOMIZE            ?= kustomize
KUSTOMIZE_BUILD      ?= $(shell if command -v "$(KUSTOMIZE)" >/dev/null 2>&1; then printf '%s build' "$(KUSTOMIZE)"; elif command -v kubectl >/dev/null 2>&1; then printf 'kubectl kustomize'; else printf '%s build' "$(KUSTOMIZE)"; fi)
PLATFORMS            ?= linux/amd64,linux/arm64
CONTAINER_PLATFORM   ?=
RUST_IMAGE           ?= rust:1.95-bookworm
RUNTIME_IMAGE        ?= debian:bookworm-slim
CARGO_REGISTRY_REPLACE_WITH ?=
CARGO_REGISTRY_REPLACEMENT_URL ?=

DOCKER_BUILD_ARGS = --build-arg RUST_IMAGE=$(RUST_IMAGE) --build-arg RUNTIME_IMAGE=$(RUNTIME_IMAGE)
DOCKER_PLATFORM_ARG =
ifneq ($(strip $(CONTAINER_PLATFORM)),)
  DOCKER_PLATFORM_ARG = --platform=$(CONTAINER_PLATFORM)
endif
ifneq ($(strip $(CARGO_REGISTRY_REPLACE_WITH)),)
  DOCKER_BUILD_ARGS += --build-arg CARGO_REGISTRY_REPLACE_WITH=$(CARGO_REGISTRY_REPLACE_WITH)
endif
ifneq ($(strip $(CARGO_REGISTRY_REPLACEMENT_URL)),)
  DOCKER_BUILD_ARGS += --build-arg CARGO_REGISTRY_REPLACEMENT_URL=$(CARGO_REGISTRY_REPLACEMENT_URL)
endif

SHELL = /usr/bin/env bash
.SHELLFLAGS = -ec

.PHONY: all
all: build

##@ General

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: fmt
fmt: ## Format Rust code.
	$(CARGO) fmt --all

.PHONY: fmt-check
fmt-check: ## Check Rust formatting.
	$(CARGO) fmt --all --check

.PHONY: check
check: ## Type-check all Rust targets.
	$(CARGO) check --all-targets --all-features

.PHONY: lint
lint: ## Run clippy with warnings denied.
	$(CARGO) clippy --all-targets --all-features -- -D warnings

.PHONY: lint-fix
lint-fix: ## Run clippy fixes.
	$(CARGO) clippy --fix --allow-dirty --all-targets --all-features -- -D warnings

.PHONY: test
test: ## Run Rust unit tests.
	$(CARGO) test --all-targets --all-features

.PHONY: manifests
manifests: kustomize ## Validate checked-in CRDs and kustomize manifests.
	@test -s config/crd/bases/valkey.io_valkeyclusters.yaml
	@test -s config/crd/bases/valkey.io_valkeynodes.yaml
	$(KUSTOMIZE_BUILD) config/crd >/dev/null

##@ Build

.PHONY: build
build: ## Build the Rust manager binary.
	$(CARGO) build --release --bin manager

.PHONY: run
run: ## Run the controller from your host.
	$(CARGO) run --bin manager --

.PHONY: docker-build
docker-build: ## Build the manager container image.
	$(CONTAINER_TOOL) build $(DOCKER_PLATFORM_ARG) $(DOCKER_BUILD_ARGS) -t $(CONTAINER_IMAGE_NAME) .

.PHONY: docker-push
docker-push: ## Push the manager container image.
	$(CONTAINER_TOOL) push $(CONTAINER_IMAGE_NAME)

.PHONY: docker-buildx
docker-buildx: ## Build and push a multi-architecture manager image.
	- $(CONTAINER_TOOL) buildx create --name valkey-operator-builder
	$(CONTAINER_TOOL) buildx use valkey-operator-builder
	- $(CONTAINER_TOOL) buildx build --push $(DOCKER_BUILD_ARGS) --platform=$(PLATFORMS) --tag $(CONTAINER_IMAGE_NAME) .
	- $(CONTAINER_TOOL) buildx rm valkey-operator-builder

.PHONY: build-installer
build-installer: manifests ## Generate a consolidated YAML with CRDs and deployment.
	@command -v "$(KUSTOMIZE)" >/dev/null 2>&1 || { echo "kustomize executable is required for image edits. Set KUSTOMIZE=/path/to/kustomize."; exit 1; }
	mkdir -p dist
	tmp="$$(mktemp)" && cp config/manager/kustomization.yaml "$$tmp" && \
	trap 'cp "$$tmp" config/manager/kustomization.yaml; rm -f "$$tmp"' EXIT && \
	cd config/manager && "$(KUSTOMIZE)" edit set image controller=$(CONTAINER_IMAGE_NAME) && \
	cd ../.. && $(KUSTOMIZE_BUILD) config/default > dist/install.yaml

##@ Deployment

ifndef ignore-not-found
  ignore-not-found = false
endif

.PHONY: install
install: manifests ## Install CRDs into the Kubernetes cluster configured in kubeconfig.
	$(KUSTOMIZE_BUILD) config/crd | "$(KUBECTL)" apply -f -

.PHONY: uninstall
uninstall: kustomize ## Uninstall CRDs from the Kubernetes cluster configured in kubeconfig.
	$(KUSTOMIZE_BUILD) config/crd | "$(KUBECTL)" delete --ignore-not-found=$(ignore-not-found) -f -

.PHONY: deploy
deploy: manifests ## Deploy the controller to the Kubernetes cluster configured in kubeconfig.
	@command -v "$(KUSTOMIZE)" >/dev/null 2>&1 || { echo "kustomize executable is required for image edits. Set KUSTOMIZE=/path/to/kustomize."; exit 1; }
	tmp="$$(mktemp)" && cp config/manager/kustomization.yaml "$$tmp" && \
	trap 'cp "$$tmp" config/manager/kustomization.yaml; rm -f "$$tmp"' EXIT && \
	cd config/manager && "$(KUSTOMIZE)" edit set image controller=$(CONTAINER_IMAGE_NAME) && \
	cd ../.. && $(KUSTOMIZE_BUILD) config/default | "$(KUBECTL)" apply -f -

.PHONY: undeploy
undeploy: kustomize ## Undeploy the controller from the Kubernetes cluster configured in kubeconfig.
	$(KUSTOMIZE_BUILD) config/default | "$(KUBECTL)" delete --ignore-not-found=$(ignore-not-found) -f -

##@ Dependencies

.PHONY: kustomize
kustomize: ## Verify kustomize is available.
	@$(KUSTOMIZE_BUILD) --help >/dev/null 2>&1 || { echo "kustomize build support is required. Install kustomize or kubectl."; exit 1; }

.PHONY: print-version
print-version: ## Print the package version.
	@$(CARGO) metadata --no-deps --format-version 1 | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
