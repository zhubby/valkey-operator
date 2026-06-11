use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use k8s_openapi::api::core::v1::Namespace;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::{Condition, ObjectMeta};
use kube::api::{DeleteParams, ListParams, PostParams};
use kube::{Api, Client, ResourceExt};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::api::{ClusterState, ValkeyCluster, ValkeyClusterSpec, ValkeyNode};
use crate::controller::{LABEL_CLUSTER, LABEL_NODE_INDEX, LABEL_SHARD_INDEX};

const API_PREFIX: &str = "/api/v1";

#[derive(Clone)]
pub struct ManagementApiState {
    client: Client,
    watch_namespaces: Arc<Vec<String>>,
}

impl ManagementApiState {
    pub fn new(client: Client, watch_namespaces: Vec<String>) -> Self {
        Self {
            client,
            watch_namespaces: Arc::new(watch_namespaces),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterListQuery {
    namespace: Option<String>,
    state: Option<ClusterState>,
    q: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterWriteMetadata {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_version: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub annotations: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterWriteRequest {
    pub metadata: ClusterWriteMetadata,
    pub spec: ValkeyClusterSpec,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NamespaceSummary {
    pub name: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterSummary {
    pub name: String,
    pub namespace: String,
    pub state: ClusterState,
    pub reason: String,
    pub message: String,
    pub shards: i32,
    pub ready_shards: i32,
    pub desired_shards: i32,
    pub desired_replicas: i32,
    pub workload_type: String,
    pub resource_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NodeSummary {
    pub name: String,
    pub namespace: String,
    pub ready: bool,
    pub role: String,
    pub pod_name: String,
    #[serde(rename = "podIP")]
    pub pod_ip: String,
    pub shard_index: Option<i32>,
    pub node_index: Option<i32>,
    pub observed_generation: i64,
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterHealth {
    pub state: ClusterState,
    pub reason: String,
    pub message: String,
    pub ready_nodes: usize,
    pub total_nodes: usize,
    pub primaries: usize,
    pub replicas: usize,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterDetail {
    pub cluster: ValkeyCluster,
    pub nodes: Vec<NodeSummary>,
    pub health: ClusterHealth,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DryRunResponse {
    pub valid: bool,
    pub cluster: ValkeyCluster,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorBody {
    pub error: ApiErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: String,
    message: String,
    details: Option<serde_json::Value>,
}

impl ApiError {
    fn new(status: StatusCode, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            status,
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "BadRequest", message)
    }

    fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "Forbidden", message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ApiErrorBody {
                error: ApiErrorDetail {
                    code: self.code,
                    message: self.message,
                    details: self.details,
                },
            }),
        )
            .into_response()
    }
}

impl From<kube::Error> for ApiError {
    fn from(err: kube::Error) -> Self {
        match &err {
            kube::Error::Api(api_error) => {
                let status =
                    StatusCode::from_u16(api_error.code).unwrap_or(StatusCode::BAD_GATEWAY);
                let code = if status == StatusCode::CONFLICT {
                    "Conflict".to_string()
                } else if status == StatusCode::NOT_FOUND {
                    "NotFound".to_string()
                } else if status == StatusCode::FORBIDDEN {
                    "Forbidden".to_string()
                } else if status == StatusCode::BAD_REQUEST {
                    "BadRequest".to_string()
                } else {
                    api_error.reason.clone()
                };
                Self {
                    status,
                    code,
                    message: api_error.message.clone(),
                    details: Some(serde_json::json!({
                        "reason": api_error.reason,
                    })),
                }
            }
            _ => Self::new(
                StatusCode::BAD_GATEWAY,
                "KubernetesRequestFailed",
                err.to_string(),
            ),
        }
    }
}

pub fn router(state: ManagementApiState) -> Router {
    Router::new()
        .route(&format!("{API_PREFIX}/namespaces"), get(list_namespaces))
        .route(&format!("{API_PREFIX}/clusters"), get(list_clusters))
        .route(
            &format!("{API_PREFIX}/namespaces/{{namespace}}/clusters"),
            post(create_cluster),
        )
        .route(
            &format!("{API_PREFIX}/namespaces/{{namespace}}/clusters/dry-run"),
            post(dry_run_create_cluster),
        )
        .route(
            &format!("{API_PREFIX}/namespaces/{{namespace}}/clusters/{{name}}"),
            get(get_cluster).put(update_cluster).delete(delete_cluster),
        )
        .route(
            &format!("{API_PREFIX}/namespaces/{{namespace}}/clusters/{{name}}/dry-run"),
            post(dry_run_update_cluster),
        )
        .with_state(state)
}

pub async fn serve(
    addr: SocketAddr,
    client: Client,
    watch_namespaces: Vec<String>,
) -> anyhow::Result<()> {
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(%addr, "starting management API");
    axum::serve(
        listener,
        router(ManagementApiState::new(client, watch_namespaces)),
    )
    .await?;
    Ok(())
}

async fn list_namespaces(
    State(state): State<ManagementApiState>,
) -> Result<Json<Vec<NamespaceSummary>>, ApiError> {
    let namespaces = if state.watch_namespaces.is_empty() {
        let api = Api::<Namespace>::all(state.client.clone());
        api.list(&ListParams::default())
            .await?
            .items
            .into_iter()
            .filter_map(|namespace| {
                namespace
                    .metadata
                    .name
                    .map(|name| NamespaceSummary { name })
            })
            .collect()
    } else {
        state
            .watch_namespaces
            .iter()
            .cloned()
            .map(|name| NamespaceSummary { name })
            .collect()
    };
    Ok(Json(namespaces))
}

async fn list_clusters(
    State(state): State<ManagementApiState>,
    Query(query): Query<ClusterListQuery>,
) -> Result<Json<Vec<ClusterSummary>>, ApiError> {
    let clusters = if let Some(namespace) = query.namespace.as_deref() {
        ensure_namespace_allowed(&state, namespace)?;
        list_clusters_in_namespace(&state.client, namespace).await?
    } else if state.watch_namespaces.is_empty() {
        Api::<ValkeyCluster>::all(state.client.clone())
            .list(&ListParams::default())
            .await?
            .items
    } else {
        let mut clusters = Vec::new();
        for namespace in state.watch_namespaces.iter() {
            clusters.extend(list_clusters_in_namespace(&state.client, namespace).await?);
        }
        clusters
    };

    let q = query.q.as_deref().map(str::to_ascii_lowercase);
    let summaries = clusters
        .into_iter()
        .filter(|cluster| {
            let summary = cluster_summary(cluster);
            if let Some(state_filter) = &query.state
                && &summary.state != state_filter
            {
                return false;
            }
            if let Some(q) = &q {
                return summary.name.to_ascii_lowercase().contains(q)
                    || summary.namespace.to_ascii_lowercase().contains(q)
                    || summary.reason.to_ascii_lowercase().contains(q);
            }
            true
        })
        .map(|cluster| cluster_summary(&cluster))
        .collect();
    Ok(Json(summaries))
}

async fn create_cluster(
    State(state): State<ManagementApiState>,
    Path(namespace): Path<String>,
    Json(request): Json<ClusterWriteRequest>,
) -> Result<(StatusCode, Json<ClusterDetail>), ApiError> {
    ensure_namespace_allowed(&state, &namespace)?;
    let cluster = cluster_from_write_request(&namespace, request, None)?;
    let api = Api::<ValkeyCluster>::namespaced(state.client.clone(), &namespace);
    let created = api.create(&PostParams::default(), &cluster).await?;
    let detail = cluster_detail(created, Vec::new());
    Ok((StatusCode::CREATED, Json(detail)))
}

async fn dry_run_create_cluster(
    State(state): State<ManagementApiState>,
    Path(namespace): Path<String>,
    Json(request): Json<ClusterWriteRequest>,
) -> Result<Json<DryRunResponse>, ApiError> {
    ensure_namespace_allowed(&state, &namespace)?;
    let cluster = cluster_from_write_request(&namespace, request, None)?;
    let api = Api::<ValkeyCluster>::namespaced(state.client.clone(), &namespace);
    let validated = api
        .create(
            &PostParams {
                dry_run: true,
                field_manager: None,
            },
            &cluster,
        )
        .await?;
    Ok(Json(DryRunResponse {
        valid: true,
        cluster: validated,
    }))
}

async fn get_cluster(
    State(state): State<ManagementApiState>,
    Path((namespace, name)): Path<(String, String)>,
) -> Result<Json<ClusterDetail>, ApiError> {
    ensure_namespace_allowed(&state, &namespace)?;
    Ok(Json(
        get_cluster_detail(&state.client, &namespace, &name).await?,
    ))
}

async fn update_cluster(
    State(state): State<ManagementApiState>,
    Path((namespace, name)): Path<(String, String)>,
    Json(request): Json<ClusterWriteRequest>,
) -> Result<Json<ClusterDetail>, ApiError> {
    ensure_namespace_allowed(&state, &namespace)?;
    let resource_version = require_resource_version(&request)?;
    let cluster = cluster_from_write_request(&namespace, request, Some(resource_version))?;
    let api = Api::<ValkeyCluster>::namespaced(state.client.clone(), &namespace);
    let updated = api.replace(&name, &PostParams::default(), &cluster).await?;
    let nodes = list_nodes_for_cluster(&state.client, &namespace, &name).await?;
    Ok(Json(cluster_detail(updated, nodes)))
}

async fn dry_run_update_cluster(
    State(state): State<ManagementApiState>,
    Path((namespace, name)): Path<(String, String)>,
    Json(request): Json<ClusterWriteRequest>,
) -> Result<Json<DryRunResponse>, ApiError> {
    ensure_namespace_allowed(&state, &namespace)?;
    let resource_version = require_resource_version(&request)?;
    let cluster = cluster_from_write_request(&namespace, request, Some(resource_version))?;
    let api = Api::<ValkeyCluster>::namespaced(state.client.clone(), &namespace);
    let validated = api
        .replace(
            &name,
            &PostParams {
                dry_run: true,
                field_manager: None,
            },
            &cluster,
        )
        .await?;
    Ok(Json(DryRunResponse {
        valid: true,
        cluster: validated,
    }))
}

async fn delete_cluster(
    State(state): State<ManagementApiState>,
    Path((namespace, name)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    ensure_namespace_allowed(&state, &namespace)?;
    let api = Api::<ValkeyCluster>::namespaced(state.client.clone(), &namespace);
    api.delete(&name, &DeleteParams::default()).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_cluster_detail(
    client: &Client,
    namespace: &str,
    name: &str,
) -> Result<ClusterDetail, ApiError> {
    let api = Api::<ValkeyCluster>::namespaced(client.clone(), namespace);
    let cluster = api.get(name).await?;
    let nodes = list_nodes_for_cluster(client, namespace, name).await?;
    Ok(cluster_detail(cluster, nodes))
}

async fn list_clusters_in_namespace(
    client: &Client,
    namespace: &str,
) -> Result<Vec<ValkeyCluster>, ApiError> {
    let api = Api::<ValkeyCluster>::namespaced(client.clone(), namespace);
    Ok(api.list(&ListParams::default()).await?.items)
}

async fn list_nodes_for_cluster(
    client: &Client,
    namespace: &str,
    name: &str,
) -> Result<Vec<ValkeyNode>, ApiError> {
    let api = Api::<ValkeyNode>::namespaced(client.clone(), namespace);
    let selector = format!("{LABEL_CLUSTER}={name}");
    Ok(api
        .list(&ListParams::default().labels(&selector))
        .await?
        .items)
}

fn ensure_namespace_allowed(state: &ManagementApiState, namespace: &str) -> Result<(), ApiError> {
    if state.watch_namespaces.is_empty()
        || state
            .watch_namespaces
            .iter()
            .any(|allowed| allowed == namespace)
    {
        return Ok(());
    }

    Err(ApiError::forbidden(format!(
        "namespace {namespace} is outside the configured watch namespace set"
    )))
}

fn require_resource_version(request: &ClusterWriteRequest) -> Result<String, ApiError> {
    request
        .metadata
        .resource_version
        .clone()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::CONFLICT,
                "ResourceVersionRequired",
                "metadata.resourceVersion is required when updating a cluster",
            )
        })
}

fn cluster_from_write_request(
    namespace: &str,
    request: ClusterWriteRequest,
    resource_version: Option<String>,
) -> Result<ValkeyCluster, ApiError> {
    let name = request.metadata.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("metadata.name is required"));
    }

    Ok(ValkeyCluster {
        metadata: ObjectMeta {
            name: Some(name.to_string()),
            namespace: Some(namespace.to_string()),
            labels: (!request.metadata.labels.is_empty()).then_some(request.metadata.labels),
            annotations: (!request.metadata.annotations.is_empty())
                .then_some(request.metadata.annotations),
            resource_version,
            ..ObjectMeta::default()
        },
        spec: request.spec,
        status: None,
    })
}

fn cluster_summary(cluster: &ValkeyCluster) -> ClusterSummary {
    let status = cluster.status.as_ref();
    ClusterSummary {
        name: cluster.name_any(),
        namespace: cluster.namespace().unwrap_or_default(),
        state: status
            .map(|status| status.state.clone())
            .unwrap_or_default(),
        reason: status
            .map(|status| status.reason.clone())
            .unwrap_or_default(),
        message: status
            .map(|status| status.message.clone())
            .unwrap_or_default(),
        shards: status.map(|status| status.shards).unwrap_or_default(),
        ready_shards: status.map(|status| status.ready_shards).unwrap_or_default(),
        desired_shards: cluster.spec.shards,
        desired_replicas: cluster.spec.replicas,
        workload_type: serde_json::to_value(&cluster.spec.workload_type)
            .ok()
            .and_then(|value| value.as_str().map(ToOwned::to_owned))
            .unwrap_or_else(|| "StatefulSet".to_string()),
        resource_version: cluster.resource_version().unwrap_or_default(),
        age: cluster
            .metadata
            .creation_timestamp
            .as_ref()
            .map(|time| time.0.strftime("%Y-%m-%dT%H:%M:%SZ").to_string()),
    }
}

fn cluster_detail(cluster: ValkeyCluster, nodes: Vec<ValkeyNode>) -> ClusterDetail {
    let node_summaries = nodes.iter().map(node_summary).collect::<Vec<_>>();
    let health = cluster_health(&cluster, &node_summaries);
    ClusterDetail {
        cluster,
        nodes: node_summaries,
        health,
    }
}

fn node_summary(node: &ValkeyNode) -> NodeSummary {
    let status = node.status.as_ref();
    let labels = node.metadata.labels.clone().unwrap_or_default();
    NodeSummary {
        name: node.name_any(),
        namespace: node.namespace().unwrap_or_default(),
        ready: status.map(|status| status.ready).unwrap_or_default(),
        role: status.map(|status| status.role.clone()).unwrap_or_default(),
        pod_name: status
            .map(|status| status.pod_name.clone())
            .unwrap_or_default(),
        pod_ip: status
            .map(|status| status.pod_ip.clone())
            .unwrap_or_default(),
        shard_index: parse_i32_label(&labels, LABEL_SHARD_INDEX),
        node_index: parse_i32_label(&labels, LABEL_NODE_INDEX),
        observed_generation: status
            .map(|status| status.observed_generation)
            .unwrap_or_default(),
        conditions: status
            .map(|status| status.conditions.clone())
            .unwrap_or_default(),
    }
}

fn cluster_health(cluster: &ValkeyCluster, nodes: &[NodeSummary]) -> ClusterHealth {
    let status = cluster.status.as_ref();
    ClusterHealth {
        state: status
            .map(|status| status.state.clone())
            .unwrap_or_default(),
        reason: status
            .map(|status| status.reason.clone())
            .unwrap_or_default(),
        message: status
            .map(|status| status.message.clone())
            .unwrap_or_default(),
        ready_nodes: nodes.iter().filter(|node| node.ready).count(),
        total_nodes: nodes.len(),
        primaries: nodes
            .iter()
            .filter(|node| node.role == "primary" || node.role == "master")
            .count(),
        replicas: nodes
            .iter()
            .filter(|node| node.role == "replica" || node.role == "slave")
            .count(),
    }
}

fn parse_i32_label(labels: &BTreeMap<String, String>, key: &str) -> Option<i32> {
    labels.get(key).and_then(|value| value.parse().ok())
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Method, Request, Response as HttpResponse};
    use http_body_util::BodyExt;
    use k8s_openapi::apimachinery::pkg::apis::meta::v1::Condition;
    use kube_client::client::Body as KubeBody;
    use pretty_assertions::assert_eq;
    use serde_json::json;
    use tower::ServiceExt;
    use tower_test::mock;

    use super::*;
    use crate::api::{ValkeyClusterStatus, ValkeyNodeStatus};

    #[tokio::test]
    async fn namespace_gate_allows_configured_namespaces_only() {
        let (client, _) = mock::pair::<Request<KubeBody>, HttpResponse<KubeBody>>();
        let state = ManagementApiState::new(Client::new(client, "default"), vec!["ops".into()]);

        assert!(ensure_namespace_allowed(&state, "ops").is_ok());
        let error = ensure_namespace_allowed(&state, "default").expect_err("namespace is blocked");
        assert_eq!(error.status, StatusCode::FORBIDDEN);
    }

    #[test]
    fn update_requires_resource_version() {
        let request = ClusterWriteRequest {
            metadata: ClusterWriteMetadata {
                name: "cache".into(),
                ..ClusterWriteMetadata::default()
            },
            spec: ValkeyClusterSpec::default(),
        };

        let error = require_resource_version(&request).expect_err("resourceVersion is required");
        assert_eq!(error.status, StatusCode::CONFLICT);
        assert_eq!(error.code, "ResourceVersionRequired");
    }

    #[test]
    fn cluster_detail_derives_node_health() {
        let mut cluster = ValkeyCluster::new(
            "cache",
            ValkeyClusterSpec {
                shards: 1,
                replicas: 1,
                ..ValkeyClusterSpec::default()
            },
        );
        cluster.status = Some(ValkeyClusterStatus {
            state: ClusterState::Ready,
            reason: "ClusterHealthy".into(),
            message: "ok".into(),
            shards: 1,
            ready_shards: 1,
            conditions: vec![],
        });

        let mut node = ValkeyNode::new("cache-0-0", Default::default());
        node.metadata.namespace = Some("default".into());
        node.metadata.labels = Some(BTreeMap::from([
            (LABEL_SHARD_INDEX.to_string(), "0".into()),
            (LABEL_NODE_INDEX.to_string(), "0".into()),
        ]));
        node.status = Some(ValkeyNodeStatus {
            observed_generation: 2,
            ready: true,
            pod_name: "valkey-cache-0-0-0".into(),
            pod_ip: "10.0.0.10".into(),
            role: "primary".into(),
            conditions: vec![Condition {
                type_: "Ready".into(),
                status: "True".into(),
                reason: "PodRunning".into(),
                message: "ready".into(),
                observed_generation: Some(2),
                last_transition_time: k8s_openapi::apimachinery::pkg::apis::meta::v1::Time(
                    k8s_openapi::jiff::Timestamp::now(),
                ),
            }],
        });

        let detail = cluster_detail(cluster, vec![node]);

        assert_eq!(detail.health.state, ClusterState::Ready);
        assert_eq!(detail.health.ready_nodes, 1);
        assert_eq!(detail.health.primaries, 1);
        assert_eq!(detail.nodes[0].shard_index, Some(0));
    }

    #[tokio::test]
    async fn dry_run_create_routes_to_kubernetes_dry_run() {
        let (service, mut handle) = mock::pair::<Request<KubeBody>, HttpResponse<KubeBody>>();
        let client = Client::new(service, "default");
        let app = router(ManagementApiState::new(client, vec!["default".into()]));

        let server = tokio::spawn(async move {
            let (request, send) = handle.next_request().await.expect("request received");
            assert_eq!(request.method(), Method::POST);
            assert_eq!(
                request.uri().path(),
                "/apis/valkey.io/v1alpha1/namespaces/default/valkeyclusters"
            );
            assert!(
                request
                    .uri()
                    .query()
                    .is_some_and(|query| query.contains("dryRun=All"))
            );

            let body = request.into_body().collect().await.unwrap().to_bytes();
            let cluster: ValkeyCluster = serde_json::from_slice(&body).unwrap();
            assert_eq!(cluster.name_any(), "cache");
            send.send_response(HttpResponse::new(KubeBody::from(
                serde_json::to_vec(&cluster).unwrap(),
            )));
        });

        let request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/namespaces/default/clusters/dry-run")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_vec(&json!({
                    "metadata": { "name": "cache" },
                    "spec": { "shards": 1, "replicas": 1 }
                }))
                .unwrap(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        server.await.unwrap();
    }
}
