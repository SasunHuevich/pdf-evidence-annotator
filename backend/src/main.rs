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
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

type DatasetState = Arc<RwLock<Vec<Sample>>>;

static DATASET_FILE_PATH: &str = "data/samples.json";
pub static OUTPUT_DATASET_FILE_PATH: &str = "data/output.sample.json";
static DOCS_DIRECTORY: &str = "data/documents";

#[derive(Clone, FromRef)]
pub struct AppState {
    pub dataset: Arc<RwLock<Vec<Sample>>>,
    pub names_to_hashes: Arc<HashMap<String, String>>,
    pub qdrant_client: Qdrant,
}

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::get_pdf_list,
        handlers::get_evidence_regoins_by_file_name,
        handlers::get_json_evidence_regions_by_file_name,
        handlers::get_pdf_by_file_name,
        handlers::get_dataset_by_file_name,
        handlers::save_evidence_regions
    ),
    components(
        schemas(
            handlers::FileNameRequest,
            handlers::SaveEvidenceRequest,
            dataset::Sample,
            dataset::EvidenceRegions,
            dataset::Bbox
        )
    ),
    tags(
        (name = "PDF Evidence Annotator", description = "Инструмент для разметки документов")
    )
)]
struct ApiDoc;

#[tokio::main]
async fn main() {
    let file_to_load = if tokio::fs::try_exists(OUTPUT_DATASET_FILE_PATH)
        .await
        .unwrap_or(false)
    {
        println!(
            "Найден ранее сохраненный файл: {}",
            OUTPUT_DATASET_FILE_PATH
        );
        OUTPUT_DATASET_FILE_PATH
    } else {
        println!("Загрузка исходного датасета: {}", DATASET_FILE_PATH);
        DATASET_FILE_PATH
    };

    let dataset = match dataset::read_dataset_from_file(file_to_load).await {
        Ok(data) => data,
        Err(error) => {
            panic!("Критическая ошибка: {}", error)
        }
    };

    let dataset = dataset::add_uuid_to_dataset(dataset, OUTPUT_DATASET_FILE_PATH).await;

    let shared_dataset: DatasetState = Arc::new(RwLock::new(dataset));

    let dataset_guard = shared_dataset.read().await;
    let shared_names_to_hashes =
        Arc::new(dataset::get_filenames_to_hashes(&dataset_guard, DOCS_DIRECTORY).await);
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
        .route("/get_dataset", post(handlers::get_dataset_by_file_name))
        .route(
            "/save_evidence_regions",
            post(handlers::save_evidence_regions),
        )
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(from_fn(handlers::cors_middleware))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();

    axum::serve(listener, app).await.unwrap();
}
