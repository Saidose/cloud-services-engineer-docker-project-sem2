# Momo Store — контейнеризация (Docker + Docker Compose)

Проектная работа: контейнеризация существующего приложения (бэкенд на Go +
фронтенд на Vue.js), оркестрация через Docker Compose и обеспечение безопасности
образов и контейнеров.

Push workflow.

- **backend** — API на Go (`go-chi`), слушает `:8081`, эндпоинт `/health`.
- **frontend** — SPA на Vue.js, в проде отдаётся через nginx и проксирует API на бэкенд.

---

## Быстрый старт

### Прод

```bash
# сборка и запуск
docker compose up -d --build

# Фронт
http://localhost:80

# логи / статус
docker compose ps
docker compose logs -f

# остановка
docker compose down
```

> Бэкенд намеренно не публикуется на хост
> доступен через nginx-прокси, эндпоинты: `/products`, `/categories`, `/orders`, `/auth/*`

### Дев

```bash
docker compose -f docker-compose.dev.yml up --build
```

### Масштабирование

```bash
docker compose up -d --scale backend=3
```

nginx балансирует запросы между всеми репликами бэкенда
Бэкенд не привязан к хостовому порту, поэтому реплики поднимаются без конфликтов

---

## Образы и их оптимизация

Обе части собираются multi-stage: тяжёлый build-образ с тулчейном используется только для сборки, 
в финальный образ попадает лишь результат
Базовые образы — лёгкие (`alpine` / `nginx-unprivileged:alpine`)

| Компонент | Dev-образ (с тулчейном) | Прод-образ (multi-stage) | Экономия |
|-----------|-------------------------|--------------------------|----------|
| backend   | ~1.16 GB                | **~27.5 MB**             | ~97 %    |
| frontend  | ~701 MB                 | **~78.3 MB**             | ~89 %    |

Как достигается размер:

- **backend**: статический бинарник `CGO_ENABLED=0`, флаги `-s -w -trimpath`
  (без отладочной информации и абсолютных путей); финальный образ — `alpine` с
  одним бинарником, без Go, исходников и кэша.
- **frontend**: сборка статики в Node-образе, в рантайме — только `nginx` со
  статикой из `dist/`, без Node и `node_modules`.
- Порядок инструкций оптимизирован под кэш: зависимости (`go mod download` /
  `npm ci`) — отдельным слоем перед копированием исходников.
- `.dockerignore` исключает из build-контекста `.git`, `node_modules`, `dist`,
  IDE-файлы и т. п.

---

## Конфигурация

### Build-аргументы

| Образ | Аргумент | По умолчанию | Назначение |
|-------|----------|--------------|------------|
| backend  | `GO_VERSION`     | `1.17` | версия Go в build-стадии |
| backend  | `APP_VERSION`    | `dev`  | версия, зашиваемая в бинарник (`-X main.version`) |
| frontend | `NODE_VERSION`   | `16`   | версия Node в build-стадии |
| frontend | `PUBLIC_PATH`    | `/`    | базовый путь приложения (для отдачи из корня за nginx) |
| frontend | `VUE_APP_API_URL`| `""`   | базовый URL API (пусто → относительные пути через прокси) |

### Переменные окружения

- В dev-профиле фронтенд получает `VUE_APP_API_URL=http://localhost:8081`.
- Бэкенд читает секрет из файла `/run/secrets/backend_secret` (Docker Secrets).

---

## Инфраструктура (Docker Compose)

- **Сервисы:** `backend`, `frontend` — описаны полностью.
- **Зависимости:** `frontend` стартует после готовности бэкенда
  (`depends_on: condition: service_healthy`).
- **Healthchecks:** у обоих сервисов (и в Dockerfile, и в compose). Бэкенд —
  `/health`, фронтенд — локальный `/healthz` (не зависит от бэкенда).
- **Перезапуск:** `restart: unless-stopped`.
- **Тома:** именованный `backend-data` смонтирован в `/app/data` с корректными
  правами (владелец `app:10001`, запись без root); данные переживают пересоздание
  контейнера. Приложение сейчас stateless (in-memory store) — том провижится как
  штатное место под durable-данные / будущую БД.
- **Сети (изоляция групп сервисов):**
  - `frontend-net` — публичная (фронтенд смотрит наружу);
  - `backend-net` — `internal: true`: без доступа в интернет и с хоста, только
    межсервисное общение `frontend ↔ backend`.
- **Лимиты ресурсов:** CPU `0.5` и память `128M` на сервис (+ reservations).

---

## Безопасность

| Мера | Реализация |
|------|------------|
| Не root в контейнерах | backend — `app` (uid 10001), frontend — `nginx` (uid 101) |
| Минимальные финальные образы | multi-stage, `alpine`/`nginx-unprivileged`, без dev-инструментов |
| Только нужные порты | наружу открыт лишь фронтенд (80); бэкенд — только внутри сети |
| Read-only ФС | `read_only: true` + `tmpfs` для временных путей |
| Drop capabilities | `cap_drop: [ALL]` (CapBnd = `0000…0`) |
| Запрет эскалации прав | `security_opt: [no-new-privileges:true]` |
| Изоляция сети | внутренняя сеть `backend-net` (`internal: true`) |
| Нет секретов в образах | секреты не в ENV/слоях; доставка через Docker Secrets |

### Управление секретами

- Файл `secrets/backend_secret.txt` монтируется в `/run/secrets/backend_secret` больше информации в `secrets/README.md`
- В репозитории — только плейсхолдер (`CHANGE_ME`), чтобы стек поднимался
  из коробки
- CI/CD: доступы к DockerHub берутся из GitHub Actions Secrets (`DOCKER_USER`, `DOCKER_PASSWORD`), а не из кода.

### Сканирование на уязвимости (Trivy)

В CI добавлен отдельный job `scan_images_with_trivy` (`.github/workflows/deploy.yaml`): собирает оба образа и сканирует их Trivy по уровням `CRITICAL,HIGH`.

Локально:

```bash
# образ
trivy image momo-backend:latest
trivy image momo-frontend:latest

# Dockerfile / конфиги
trivy config .
```

Базовые образы зафиксированы по версиям (`alpine:3.20`, `node:16-alpine`, `nginx-unprivileged:1.27-alpine`) и регулярно обновляются (бамп тега + пересборка + повторный скан).
