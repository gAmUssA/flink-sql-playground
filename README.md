# Flink SQL Playground

[![Smoke Test](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/smoke-test.yml/badge.svg)](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/smoke-test.yml)
[![Docker Build](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/docker-publish.yml)
[![Java 25](https://img.shields.io/badge/Java-25-orange?logo=openjdk)](https://adoptium.net/)
[![Quarkus](https://img.shields.io/badge/Quarkus-3.36-blue?logo=quarkus)](https://quarkus.io/)
[![Apache Flink](https://img.shields.io/badge/Apache%20Flink-2.2.1-blue?logo=apacheflink)](https://flink.apache.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An interactive web-based SQL editor for Apache Flink. Write and execute Flink SQL queries in your browser against an embedded Flink runtime — no external cluster or infrastructure required.

## Features

- **Browser-based SQL editor** — Monaco Editor with SQL syntax highlighting and autocompletion
- **Embedded Flink runtime** — single-JVM execution, no cluster setup needed
- **Batch and streaming modes** — switch between execution modes per query
- **Built-in data generators** — `datagen` and custom `faker` connectors for realistic test data
- **Shareable fiddles** — save and share SQL snippets via short URLs
- **Example queries** — 9 preloaded examples covering windows, joins, pattern matching, and more
- **Security sandbox** — blocked UDF injection, connector whitelist, execution timeouts

## Prerequisites

- **Java 25** — required to build and run locally ([Eclipse Temurin](https://adoptium.net/) recommended). Quarkus augmentation runs in the Gradle JVM and loads the compiled Java 25 classes, so the build itself must run on JDK 25.
- **Docker** (optional) — for running the app in a container

## Local Java Build

Build the project:

```bash
./gradlew build
```

Run in development mode (live reload):

```bash
./gradlew quarkusDev
```

Open [http://localhost:9090](http://localhost:9090) in your browser.

## Docker

### Quick start (no build required)

Pull and run the pre-built image from GitHub Container Registry:

```bash
docker run -p 9090:9090 ghcr.io/gamussa/flink-sql-playground:latest
```

The image supports both `amd64` and `arm64` architectures — works on Intel, AMD, and Apple Silicon.

### Build locally

Build and run with Docker Compose:

```bash
docker compose up --build
```

Open [http://localhost:9090](http://localhost:9090) in your browser.

To stop: press `Ctrl+C` or run `docker compose down`.

## Running Tests

```bash
./gradlew test
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed overview of the system design, request flow, session management, security model, and test structure.
