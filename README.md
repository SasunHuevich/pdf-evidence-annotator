## Описание проекта

Данный сервис разработан в рамках технического задания на создание **инструмента ручной разметки evidence-регионов в PDF-документах** для мультимодальных RAG-систем и оценки ретриверов.

Сервис решает задачу сопоставления текстовых вопросов/ответов из датасета с их физическим визуальным расположением на страницах исходных документов.

### Основной функционал системы:
*   **Синхронизация с датасетом**: Загрузка исходных объектов разметки из `samples.json` и автоматическое отслеживание версий файлов (поддержка чтения из `output.sample.json`).
*   **Интеграция с Qdrant (Только чтение)**: Загрузка ранее существовавших регионов, bbox-координат и метаданных элементов из снапшота коллекции Qdrant по вычисляемому хэшу файла для отображения в интерфейсе разметки.
*   **Инструмент фиксации разметки**: Прием новых или отредактированных пользователем прямоугольных областей (`bbox`) и полная перезапись поля `evidence_regions` для конкретного вопроса.
*   **Асинхронное сохранение**: Локальное сохранение актуального состояния разметки в файл JSON на диске без блокировки основного потока выполнения HTTP-запросов.


## Подготовка к запуску и запуск

### Подготовка к запуску

- В корне проекта папку `qudrant_snapshots` и поместите туда файл выгруженный преподом. В докер-компос указал его точное название, поэтому проверьте там, что оно совпадает и тд. Это нужно для запуска Qdrant.
- Коллекцию pdf документов (папку data) поместите в корень проекта. Она необходима для запуска backend.
- Схему можно посмотреть по пути: `http://localhost:3000/swagger-ui`
- Собрать бэкенд скриптом `backend/build.sh`

### Запуск

Сервисы запускаются через docker-compose:
```sh
docker compose up -d --build
```

## Готовые запросы для удобства разработки 

#### Проверить список все созданных коллекций
```sh
curl http://localhost:6333/collections
```

#### Посмотреть информацию о нашей коллеции
```sh
curl http://localhost:6333/collections/documents
```

#### Запросы в бэк
```sh
curl -X POST "http://localhost:3000/qdrant_evidence_regions" \
     -H "Content-Type: application/json" \
     -d '{"file_name": "PH_2016.06.08_Economy-Final.pdf"}'
```

```sh
curl -X POST "http://localhost:3000/json_evidence_regions" \
     -H "Content-Type: application/json" \
     -d '{"file_name": "PH_2016.06.08_Economy-Final.pdf"}'
```

```sh
curl -X POST "http://localhost:3000/get_pdf" \
     -H "Content-Type: application/json" \
     -d '{"file_name": "PH_2016.06.08_Economy-Final.pdf"}' \
     -o "downloaded_document.pdf"
```

```sh
curl -X POST "http://localhost:3000/get_dataset" \
     -H "Content-Type: application/json" \
     -d '{"file_name": "PH_2016.06.08_Economy-Final.pdf"}'
```

```sh
curl -i -X POST "http://localhost:3000/save_evidence_regions" \
     -H "Content-Type: application/json" \
     -d '{
       "question_id": "21ba9d55-697f-4e5d-9a87-c50f30256edc",
       "evidence_regions": [
         {
           "region_id": 1,
           "page": 5,
           "bbox": [
             [10.5, 20.0, 110.5, 220.0]
           ],
           "type": "paragraph"
         }
       ]
     }'
```