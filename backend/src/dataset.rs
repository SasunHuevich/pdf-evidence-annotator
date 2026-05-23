use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::{fs::File, io::AsyncReadExt};

#[derive(Serialize, Deserialize, Debug)]
pub struct Bbox(pub i32, pub i32, pub i32, pub i32);

#[derive(Serialize, Deserialize, Debug)]
pub struct EvidenceRegions {
    pub region_id: i32,
    pub page: i32,
    pub bbox: Vec<Bbox>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Sample {
    pub doc_id: String,
    pub doc_type: String,
    pub question: String,
    pub answer: String,
    pub evidence_pages: String,
    pub evidence_sources: String,
    pub answer_format: String,

    #[serde(default)]
    pub evidence_regions: Option<Vec<EvidenceRegions>>,
}

pub async fn read_dataset_from_file(path: &str) -> Result<Vec<Sample>, Box<dyn std::error::Error>> {
    if !Path::new(path).exists() {
        return Err(format!("Файл '{}' не найден!", path).into());
    }

    let mut file = File::open(path).await?;
    let mut contents = String::new();

    file.read_to_string(&mut contents).await?;

    let dataset: Vec<Sample> = serde_json::from_str(&contents)?;

    Ok(dataset)
}
