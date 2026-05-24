use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderValue, Method, Request, Response, StatusCode, header},
    middleware::Next,
    response::IntoResponse,
};
use futures_util::StreamExt;
use serde::Deserialize;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use crate::{AppState, qdrant};

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

#[derive(Deserialize)]
pub struct FileNameRequest {
    pub file_name: String,
}

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

pub async fn get_pdf_by_file_name(Json(payload): Json<FileNameRequest>) -> impl IntoResponse {
    let path = format!("./data/documents/{}", &payload.file_name);

    let file = match File::open(&path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    let stream = ReaderStream::new(file).map(|bytes| bytes.into());

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "appliction/pdf")
        .body(Body::from_stream(stream))
        .unwrap()
}
