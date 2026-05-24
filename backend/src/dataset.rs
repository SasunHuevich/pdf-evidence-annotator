use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};
use tokio::{fs::File, io::AsyncReadExt};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone, ToSchema)]
pub struct Bbox(pub i32, pub i32, pub i32, pub i32);

#[derive(Serialize, Deserialize, Debug, Clone, ToSchema)]
pub struct EvidenceRegions {
    pub region_id: i32,
    pub page: i32,
    pub bbox: Vec<Bbox>,
    pub r#type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, ToSchema)]
pub struct Sample {
    #[serde(default)]
    pub question_id: Option<String>,

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

pub async fn add_uuid_to_dataset(mut dataset: Vec<Sample>, file_path: &str) -> Vec<Sample> {
    let mut modified = false;

    for sample in &mut dataset {
        if sample.question_id.is_none() {
            sample.question_id = Some(Uuid::new_v4().to_string());
            modified = true;
        }
    }

    if modified {
        match serde_json::to_string_pretty(&dataset) {
            Ok(json_string) => {
                if let Err(e) = tokio::fs::write(file_path, json_string).await {
                    eprintln!(
                        "Предупреждение: Не удалось перезаписать файл датасета с UUID: {}",
                        e
                    );
                } else {
                    println!(
                        "Успех: Исходный файл обновлен. Всем записям проставлен уникальный question_id."
                    );
                }
            }
            Err(e) => eprintln!(
                "Предупреждение: Ошибка сериализации при сохранении UUID: {}",
                e
            ),
        }
    }

    dataset
}

async fn calculate_real_file_hash<P: AsRef<Path>>(path: P) -> Result<String, std::io::Error> {
    let mut file = File::open(path).await?;
    let mut context = md5::Context::new();
    let mut buffer = [0u8; 16384];

    loop {
        let bytes_read = file.read(&mut buffer).await?;
        if bytes_read == 0 {
            break;
        }
        context.consume(&buffer[..bytes_read]);
    }

    let digest = context.finalize();
    Ok(format!("{:x}", digest))
}

pub async fn get_filenames_to_hashes(
    dataset: &[Sample],
    docs_dir: &str,
) -> HashMap<String, String> {
    let mut names_to_hashes = HashMap::new();

    for sample in dataset {
        if !names_to_hashes.contains_key(&sample.doc_id) {
            let file_path = Path::new(docs_dir).join(&sample.doc_id);

            match calculate_real_file_hash(&file_path).await {
                Ok(hash) => {
                    names_to_hashes.insert(sample.doc_id.clone(), hash);
                }
                Err(err) => {
                    println!(
                        "Ошибка (пропуск файла): {}. Проверьте путь: {:?}",
                        err, file_path
                    );
                    continue;
                }
            }
        }
    }

    names_to_hashes
}
