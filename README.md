# Flink SQL Playground

[![Smoke Test](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/smoke-test.yml/badge.svg)](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/smoke-test.yml)
[![Java 21](https://img.shields.io/badge/Java-21-orange?logo=openjdk)](https://adoptium.net/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.0.3-green?logo=springboot)](https://spring.io/projects/spring-boot)
[![Apache Flink](https://img.shields.io/badge/Apache%20Flink-2.2.0-blue?logo=apacheflink)](https://flink.apache.org/)
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

- **Java 21** — required to build and run locally ([Eclipse Temurin](https://adoptium.net/) recommended)
- **Docker** (optional) — for running the app in a container

## Local Java Build

Build the project:

```bash
./gradlew build
```

Run the application:

```bash
./gradlew bootRun
```

Open [http://localhost:9090](http://localhost:9090) in your browser.

## Docker

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
