# Тут было пусто

FROM golang:1.17-alpine

WORKDIR /app

COPY . .
RUN go build -o server ./cmd/api

EXPOSE 8081

CMD ["./server"]
