## Подготовка к запуску

### Qdrant

Для запуска qdrant, создайте в корне проекта папку `qudrant_snapshots` и поместите туда файл выгруженный преподом. В докер-компос указал его точное название, поэтому проверьте там, что оно совпадает и тд. Коллекцию pdf документов (папку data) поместите в корень проекта.

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