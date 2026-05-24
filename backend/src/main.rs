pub mod dataset;
pub mod handlers;
pub mod qdrant;

use crate::dataset::Sample;
use axum::{
    Router,
    extract::FromRef,
    middleware::from_fn,
    routing::{get, post},
};
use qdrant_client::Qdrant;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

type DatasetState = Arc<RwLock<Vec<Sample>>>;

#[derive(Clone, FromRef)] // Макрос Clone ОБЯЗАТЕЛЕН для состояний Axum!
pub struct AppState {
    pub dataset: Arc<RwLock<Vec<Sample>>>,
    pub names_to_hashes: Arc<HashMap<String, String>>,
    pub qdrant_client: Qdrant,
}

#[tokio::main]
async fn main() {
    let dataset_file_path = "data/samples.json";
    let docs_directory = "data/documents";

    let dataset = match dataset::read_dataset_from_file(dataset_file_path).await {
        Ok(data) => data,
        Err(error) => {
            panic!("Критическая ошибка: {}", error)
        }
    };

    let shared_dataset: DatasetState = Arc::new(RwLock::new(dataset));

    let dataset_guard = shared_dataset.read().await;
    let shared_names_to_hashes =
        Arc::new(dataset::get_filenames_to_hashes(&dataset_guard, docs_directory).await);
    drop(dataset_guard);

    let qdrant_url = "http://qdrant:6334";
    let qdrant_client = match Qdrant::from_url(qdrant_url).build() {
        Ok(client) => client,
        Err(error) => {
            panic!(
                "Критическая ошибка: Не удалось собрать клиент Qdrant: {}",
                error
            );
        }
    };

    let state = AppState {
        dataset: shared_dataset,
        names_to_hashes: shared_names_to_hashes,
        qdrant_client,
    };

    println!("{:#?}", state.names_to_hashes);

    let app = Router::new()
        .route("/pdf_list", get(handlers::get_pdf_list))
        .route(
            "/qdrant_evidence_regions",
            post(handlers::get_evidence_regoins_by_file_name),
        )
        .route(
            "/json_evidence_regions",
            post(handlers::get_json_evidence_regions_by_file_name),
        )
        .route("/get_pdf", post(handlers::get_pdf_by_file_name))
        .layer(from_fn(handlers::cors_middleware))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
