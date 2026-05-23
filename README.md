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
     -d '{"file_name": "tacl_a_00660.pdf"}'
```