pub mod dataset;

#[tokio::main]
async fn main() {
    let dataset_file_path = "data/samples.json";

    let mut dataset = match dataset::read_dataset_from_file(dataset_file_path).await {
        Ok(data) => data,
        Err(error) => {
            panic!("Критическая ошибка: {}", error)
        }
    };

    println!("{:#?}", dataset);
}
