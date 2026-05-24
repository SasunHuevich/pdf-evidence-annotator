use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderValue, Method, Request, Response, StatusCode, header},
    middleware::Next,
    response::IntoResponse,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use utoipa::ToSchema;

use crate::{
    AppState, OUTPUT_DATASET_FILE_PATH,
    dataset::{self, Sample},
    qdrant,
};

pub async fn cors_middleware(req: Request<Body>, next: Next) -> Response<Body> {
    if req.method() == Method::OPTIONS {
        let mut response = Response::new(Body::empty());

        let headers = response.headers_mut();
        headers.insert(
            "Access-Control-Allow-Origin",
            HeaderValue::from_static("http://localhost"),
        );
        headers.insert(
            "Access-Control-Allow-Methods",
            HeaderValue::from_static("GET, POST, OPTIONS"),
        );
        headers.insert(
            "Access-Control-Allow-Headers",
            HeaderValue::from_static("Content-Type, Authorization"),
        );

        return response;
    }

    let mut response = next.run(req).await;

    response.headers_mut().insert(
        "Access-Control-Allow-Origin",
        HeaderValue::from_static("http://localhost"),
    );

    response
}

#[utoipa::path(
    get,
    path = "/pdf_list",
    responses(
        (status = OK, description = "Список имен файлов успешно получен", body = Vec<String>)
    )
)]
pub async fn get_pdf_list(State(state): State<AppState>) -> impl IntoResponse {
    Json(
        state
            .names_to_hashes
            .keys()
            .cloned()
            .collect::<Vec<String>>(),
    )
    .into_response()
}

#[derive(Deserialize, ToSchema)]
pub struct FileNameRequest {
    pub file_name: String,
}

#[utoipa::path(
    post,
    path = "/qdrant_evidence_regions",
    request_body = FileNameRequest,
    responses(
        (status = OK, description = "Регионы из Qdrant успешно получены"),
        (status = NOT_FOUND, description = "Указанный файл не найден в маппинге хешей"),
        (status = INTERNAL_SERVER_ERROR, description = "Внутренняя ошибка при обращении к базе Qdrant")
    )
)]
pub async fn get_evidence_regoins_by_file_name(
    State(state): State<AppState>,
    Json(payload): Json<FileNameRequest>,
) -> impl IntoResponse {
    let file_hash = match state.names_to_hashes.get(&payload.file_name) {
        Some(hash) => hash,
        None => return (StatusCode::NOT_FOUND, "Файл не найден").into_response(),
    };

    match qdrant::qdrant_get_evidense_regions_by_file_name(&state.qdrant_client, file_hash).await {
        Ok(regions) => Json(regions).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Ошибка базы: {}", err),
        )
            .into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/json_evidence_regions",
    request_body = FileNameRequest,
    responses(
        (status = OK, description = "Массив регионов успешно сформирован"),
        (status = NOT_FOUND, description = "Запрошенный документ отсутствует в датасете")
    )
)]
pub async fn get_json_evidence_regions_by_file_name(
    State(state): State<AppState>,
    Json(payload): Json<FileNameRequest>,
) -> impl IntoResponse {
    let dataset_guard = state.dataset.read().await;

    let mut accumulated_regions = Vec::new();

    for sample in dataset_guard.iter() {
        if sample.doc_id == payload.file_name {
            if let Some(regions) = &sample.evidence_regions {
                accumulated_regions.extend(regions.clone());
            }
        }
    }

    if !state.names_to_hashes.contains_key(&payload.file_name) {
        return (
            StatusCode::NOT_FOUND,
            "Запрошенный документ не найден в датасете",
        )
            .into_response();
    }
    Json(accumulated_regions).into_response()
}

#[utoipa::path(
    post,
    path = "/get_pdf",
    request_body = FileNameRequest,
    responses(
        (status = OK, description = "Бинарный поток PDF-файла", content_type = "application/pdf"),
        (status = NOT_FOUND, description = "Файл физически не найден на диске сервера")
    )
)]
pub async fn get_pdf_by_file_name(Json(payload): Json<FileNameRequest>) -> impl IntoResponse {
    let path = format!("./data/documents/{}", &payload.file_name);

    let file = match File::open(&path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    let stream = ReaderStream::new(file).map(|bytes| bytes.into());

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .body(Body::from_stream(stream))
        .unwrap()
}

#[utoipa::path(
    post,
    path = "/get_dataset",
    request_body = FileNameRequest,
    responses(
        (status = OK, description = "Список отфильтрованных объектов Sample успешно получен")
    )
)]
pub async fn get_dataset_by_file_name(
    State(state): State<AppState>,
    Json(payload): Json<FileNameRequest>,
) -> impl IntoResponse {
    let dataset_guard = state.dataset.read().await;
    let filtered: Vec<Sample> = dataset_guard
        .iter()
        .filter(|sample| sample.doc_id == payload.file_name)
        .cloned()
        .collect();

    Json(filtered)
}

#[derive(Serialize, Deserialize, Debug, Clone, ToSchema)]
pub struct SaveEvidenceRequest {
    pub question_id: String,
    pub evidence_regions: Vec<dataset::EvidenceRegions>,
}

#[utoipa::path(
    post,
    path = "/save_evidence_regions",
    request_body = SaveEvidenceRequest,
    responses(
        (status = OK, description = "Регионы успешно обновлены в памяти и сохранены на диск"),
        (status = NOT_FOUND, description = "Указанный question_id не найден в текущем датасете"),
        (status = INTERNAL_SERVER_ERROR, description = "Ошибка сериализации данных или сбой асинхронной записи файла на диск")
    )
)]
pub async fn save_evidence_regions(
    State(state): State<AppState>,
    Json(payload): Json<SaveEvidenceRequest>,
) -> impl IntoResponse {
    let mut dataset_guard = state.dataset.write().await;

    let sample_opt = dataset_guard
        .iter_mut()
        .find(|sample| sample.question_id.as_deref() == Some(&payload.question_id));

    let sample = match sample_opt {
        Some(s) => s,
        None => return (StatusCode::NOT_FOUND, "Question ID not found").into_response(),
    };

    sample.evidence_regions = Some(payload.evidence_regions);

    let dataset_to_save = dataset_guard.clone();

    drop(dataset_guard);

    let json_string = match serde_json::to_string_pretty(&dataset_to_save) {
        Ok(json) => json,
        Err(e) => {
            eprintln!("Ошибка сериализации JSON: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Serialization error").into_response();
        }
    };

    if let Err(e) = tokio::fs::write(OUTPUT_DATASET_FILE_PATH, json_string).await {
        eprintln!("Ошибка записи на диск: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to write file").into_response();
    }

    (StatusCode::OK, "Evidence regions overwritten successfully").into_response()
}
