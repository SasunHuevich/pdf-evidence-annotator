use qdrant_client::Qdrant;
use qdrant_client::qdrant::{Condition, Filter, ScrollPointsBuilder};
use serde::Deserialize;
use std::error::Error;

use crate::dataset::{self, EvidenceRegions};

#[derive(Deserialize, Debug)]
struct QdrantOriginalElement {
    pub r#type: String,
    pub bbox: (i32, i32, i32, i32),
    pub page_idx: i32,
}

#[derive(Deserialize, Debug)]
struct QdrantPayloadSchema {
    pub region_id: i32,
    pub original_element: QdrantOriginalElement,
}

pub async fn qdrant_get_evidense_regions_by_file_name(
    qdrant_client: &Qdrant,
    hash: &str,
) -> Result<Vec<EvidenceRegions>, Box<dyn Error>> {
    let filter = Filter::all(vec![Condition::matches("file_hash", hash.to_string())]);

    let response = qdrant_client
        .scroll(
            ScrollPointsBuilder::new("documents")
                .filter(filter)
                .limit(1000)
                .with_payload(true)
                .with_vectors(false),
        )
        .await?;

    let mut regions_list = Vec::new();

    for point in response.result {
        let json_value = serde_json::to_value(&point.payload)?;

        let raw_payload: QdrantPayloadSchema = match serde_json::from_value(json_value) {
            Ok(p) => p,
            Err(err) => {
                // TODO(petrov): заменить на логгинг
                eprintln!(
                    "Пропуск точки: не удалось распарсить original_element: {}",
                    err
                );
                continue;
            }
        };

        let orig = raw_payload.original_element;
        let (x1, y1, x2, y2) = orig.bbox;

        let region = EvidenceRegions {
            region_id: raw_payload.region_id,
            page: orig.page_idx,
            bbox: vec![dataset::Bbox(x1, y1, x2, y2)],
            r#type: orig.r#type,
        };

        regions_list.push(region);
    }

    Ok(regions_list)
}
