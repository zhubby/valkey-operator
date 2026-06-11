use std::net::SocketAddr;
use std::sync::Arc;

use clap::{ArgAction, Parser};
use futures::StreamExt;
use k8s_openapi::api::apps::v1::{Deployment, StatefulSet};
use k8s_openapi::api::core::v1::{ConfigMap, PersistentVolumeClaim, Secret, Service};
use k8s_openapi::api::policy::v1::PodDisruptionBudget;
use kube::api::Api;
use kube::core::NamespaceResourceScope;
use kube::runtime::{Controller, watcher};
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;
use valkey_operator::api::{ValkeyCluster, ValkeyNode};
use valkey_operator::controller::{Context, cluster, node};
use warp::Filter;

#[derive(Debug, Parser)]
#[command(author, version, about)]
struct Args {
    #[arg(long = "metrics-bind-address", default_value = "0")]
    metrics_bind_address: String,

    #[arg(long = "health-probe-bind-address", default_value = ":8081")]
    health_probe_bind_address: String,

    #[arg(long = "leader-elect", default_value_t = false)]
    _leader_elect: bool,

    #[arg(
        long = "metrics-secure",
        default_value_t = true,
        default_missing_value = "true",
        num_args = 0..=1,
        require_equals = true,
        action = ArgAction::Set,
    )]
    metrics_secure: bool,

    #[arg(long = "enable-http2", default_value_t = false)]
    _enable_http2: bool,

    #[arg(long = "watch-namespace")]
    watch_namespace: Vec<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    init_tracing();

    let health_addr = parse_probe_addr(&args.health_probe_bind_address)?;
    tokio::spawn(async move {
        let route = warp::path!("healthz")
            .or(warp::path!("readyz"))
            .map(|_| String::from("ok"));
        warp::serve(route).run(health_addr).await;
    });

    if args.metrics_bind_address != "0" {
        if args.metrics_secure {
            warn!("metrics TLS is not implemented; serving /metrics over HTTP");
        }
        let metrics_addr = parse_probe_addr(&args.metrics_bind_address)?;
        tokio::spawn(async move {
            let route = warp::path!("metrics").map(|| {
                warp::reply::with_header(
                    metrics_body(),
                    "content-type",
                    "text/plain; version=0.0.4; charset=utf-8",
                )
            });
            warp::serve(route).run(metrics_addr).await;
        });
    }

    let client = kube::Client::try_default().await?;
    let context = Arc::new(Context {
        client: client.clone(),
        watch_namespaces: args.watch_namespace.clone(),
    });

    let cluster_api = root_api::<ValkeyCluster>(client.clone(), &args.watch_namespace);
    let node_api = root_api::<ValkeyNode>(client.clone(), &args.watch_namespace);

    let cluster_controller = Controller::new(cluster_api, watcher::Config::default())
        .owns(
            Api::<Service>::all(client.clone()),
            watcher::Config::default(),
        )
        .owns(
            Api::<ConfigMap>::all(client.clone()),
            watcher::Config::default(),
        )
        .owns(
            Api::<Secret>::all(client.clone()),
            watcher::Config::default(),
        )
        .owns(
            Api::<PodDisruptionBudget>::all(client.clone()),
            watcher::Config::default(),
        )
        .owns(
            Api::<ValkeyNode>::all(client.clone()),
            watcher::Config::default(),
        )
        .run(cluster::reconcile, cluster::error_policy, context.clone())
        .for_each(|result| async {
            match result {
                Ok((obj, action)) => {
                    info!(
                        name = %obj.name,
                        namespace = ?obj.namespace,
                        ?action,
                        "reconciled ValkeyCluster"
                    )
                }
                Err(err) => error!(%err, "ValkeyCluster controller error"),
            }
        });

    let node_controller = Controller::new(node_api, watcher::Config::default())
        .owns(
            Api::<ConfigMap>::all(client.clone()),
            watcher::Config::default(),
        )
        .owns(
            Api::<PersistentVolumeClaim>::all(client.clone()),
            watcher::Config::default(),
        )
        .owns(
            Api::<StatefulSet>::all(client.clone()),
            watcher::Config::default(),
        )
        .owns(
            Api::<Deployment>::all(client.clone()),
            watcher::Config::default(),
        )
        .run(node::reconcile, node::error_policy, context.clone())
        .for_each(|result| async {
            match result {
                Ok((obj, action)) => {
                    info!(
                        name = %obj.name,
                        namespace = ?obj.namespace,
                        ?action,
                        "reconciled ValkeyNode"
                    )
                }
                Err(err) => error!(%err, "ValkeyNode controller error"),
            }
        });

    info!("starting valkey-operator manager");
    tokio::select! {
        _ = cluster_controller => {},
        _ = node_controller => {},
        _ = shutdown_signal() => {
            info!("shutdown signal received");
        }
    }
    Ok(())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
}

fn parse_probe_addr(value: &str) -> anyhow::Result<SocketAddr> {
    let normalized = if let Some(port) = value.strip_prefix(':') {
        format!("0.0.0.0:{port}")
    } else {
        value.to_string()
    };
    Ok(normalized.parse()?)
}

fn metrics_body() -> String {
    concat!(
        "# HELP valkey_operator_build_info Build information for the Valkey operator.\n",
        "# TYPE valkey_operator_build_info gauge\n",
        "valkey_operator_build_info{version=\"",
        env!("CARGO_PKG_VERSION"),
        "\"} 1\n"
    )
    .to_string()
}

fn root_api<K>(client: kube::Client, namespaces: &[String]) -> Api<K>
where
    K: kube::Resource<DynamicType = (), Scope = NamespaceResourceScope>,
{
    if namespaces.len() == 1 {
        Api::namespaced(client, &namespaces[0])
    } else {
        Api::all(client)
    }
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_secure_accepts_explicit_false() {
        let args = Args::parse_from(["manager", "--metrics-secure=false"]);

        assert!(!args.metrics_secure);
    }

    #[test]
    fn metrics_secure_accepts_bare_flag() {
        let args = Args::parse_from(["manager", "--metrics-secure"]);

        assert!(args.metrics_secure);
    }
}
