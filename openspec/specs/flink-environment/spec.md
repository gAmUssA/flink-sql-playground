## ADDED Requirements

### Requirement: Factory creates batch TableEnvironment
The `FlinkEnvironmentFactory` SHALL provide a method to create a `TableEnvironment` configured for batch mode execution with tuned MiniCluster settings.

#### Scenario: Batch environment creation
- **WHEN** `createBatchEnvironment()` is called
- **THEN** a `TableEnvironment` in batch mode SHALL be returned with parallelism=1, network memory=8m, and managed memory=0

### Requirement: Factory creates streaming TableEnvironment
The `FlinkEnvironmentFactory` SHALL provide a method to create a `TableEnvironment` configured for streaming mode execution with tuned MiniCluster settings.

#### Scenario: Streaming environment creation
- **WHEN** `createStreamingEnvironment()` is called
- **THEN** a `TableEnvironment` in streaming mode SHALL be returned with parallelism=1, network memory=8m, and managed memory=0

### Requirement: Environments can execute basic SQL
Each created `TableEnvironment` SHALL be capable of executing DDL and DQL statements against in-memory connectors.

#### Scenario: DDL execution on batch environment
- **WHEN** a `CREATE TABLE` with `datagen` connector is executed on a batch environment
- **THEN** the statement SHALL succeed without error

#### Scenario: SELECT query on streaming environment
- **WHEN** a `SELECT` query is executed against a datagen table on a streaming environment
- **THEN** results SHALL be collectible via `TableResult.collect()`

### Requirement: Configuration is tuned for minimal memory
Each created environment SHALL use resource-conservative settings suitable for a playground deployment on 2-4 GB of total RAM.

#### Scenario: Memory settings are applied
- **WHEN** an environment is created
- **THEN** `taskmanager.memory.network.min` and `taskmanager.memory.network.max` SHALL be `8m` and `taskmanager.memory.managed.size` SHALL be `0`
