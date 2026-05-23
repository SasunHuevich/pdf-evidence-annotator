use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderValue, Method, Request, Response},
    middleware::Next,
    response::IntoResponse,
};

use crate::AppState;

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
    Json(&*state.names).into_response()
}
