# STAGE 1: YOU CAN RECONFIGURE GO VERSION WITH BUILD ARGUMENT
ARG GO_VERSION=1.17
FROM golang:${GO_VERSION}-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

# Исходники
COPY . .

ARG APP_VERSION=dev
ARG TARGETARCH

# Статический бинарник
ENV CGO_ENABLED=0 GOOS=linux
RUN GOARCH=${TARGETARCH:-amd64} \
    go build -trimpath -ldflags="-s -w -X main.version=${APP_VERSION}" \
    -o /app/server ./cmd/api

# Stage 2: для dev среды
# Запускает приложение через `go run` с исходниками
FROM golang:${GO_VERSION}-alpine AS dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
EXPOSE 8081
CMD ["go", "run", "./cmd/api"]

# Stage 3: prod
# Только бинарник и сертификаты
FROM alpine:3.20 AS prod

RUN apk add --no-cache ca-certificates \
    && addgroup -g 10001 -S app \
    && adduser  -u 10001 -S app -G app \
    && mkdir -p /app/data \
    && chown -R app:app /app

WORKDIR /app
COPY --from=builder --chown=app:app /app/server /app/server

EXPOSE 8081
USER app

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8081/health || exit 1

ENTRYPOINT ["/app/server"]
