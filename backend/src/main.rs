pub mod dataset;
pub mod handlers;

use crate::dataset::Sample;
use axum::{Router, extract::FromRef, middleware::from_fn, routing::get};
use std::{collections::HashSet, sync::Arc};
use tokio::sync::RwLock;

type DatasetState = Arc<RwLock<Vec<Sample>>>;

#[derive(Clone, FromRef)] // Макрос Clone ОБЯЗАТЕЛЕН для состояний Axum!
pub struct AppState {
    pub dataset: Arc<RwLock<Vec<Sample>>>,
    pub names: Arc<HashSet<String>>,
}

#[tokio::main]
async fn main() {
    let dataset_file_path = "data/samples.json";

    let dataset = match dataset::read_dataset_from_file(dataset_file_path).await {
        Ok(data) => data,
        Err(error) => {
            panic!("Критическая ошибка: {}", error)
        }
    };

    let shared_dataset: DatasetState = Arc::new(RwLock::new(dataset));

    let dataset_guard = shared_dataset.read().await;
    let shared_names = Arc::new(dataset::get_filenames(&dataset_guard));
    drop(dataset_guard);

    let state = AppState {
        dataset: shared_dataset,
        names: shared_names,
    };

    let app = Router::new()
        .route("/pdf_list", get(handlers::get_pdf_list))
        .layer(from_fn(handlers::cors_middleware))
        .with_state(state);

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
