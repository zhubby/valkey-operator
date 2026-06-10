use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("kubernetes API error: {0}")]
    Kube(#[from] kube::Error),

    #[error("redis/valkey error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("serialization error: {0}")]
    SerdeJson(#[from] serde_json::Error),

    #[error("invalid object state: {0}")]
    InvalidState(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
