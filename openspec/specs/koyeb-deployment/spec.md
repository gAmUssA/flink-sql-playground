## ADDED Requirements

### Requirement: Koyeb deployment instructions in DEPLOY.md
The `DEPLOY.md` file SHALL contain a "Koyeb" section with step-by-step deployment instructions.

#### Scenario: User follows Koyeb deployment
- **WHEN** a user reads the Koyeb section of `DEPLOY.md`
- **THEN** the instructions SHALL cover installing the Koyeb CLI, creating an app, deploying from Docker, and configuring the exposed port (9090)

### Requirement: Koyeb memory configuration is documented
The instructions SHALL specify that the Koyeb instance MUST have at least 2 GB RAM to match the application memory budget.

#### Scenario: Memory requirement is clear
- **WHEN** a user reads the Koyeb deployment instructions
- **THEN** the minimum memory requirement of 2 GB SHALL be explicitly stated
- **AND** the instance type recommendation SHALL be included

### Requirement: Koyeb port configuration is documented
The instructions SHALL specify that the app listens on port 9090 and how to configure this in Koyeb.

#### Scenario: Port configuration
- **WHEN** a user deploys to Koyeb
- **THEN** the instructions SHALL include setting the exposed port to 9090
- **AND** the health check path SHALL be documented if applicable

### Requirement: Koyeb deployment uses Docker
The instructions SHALL use Docker-based deployment (building from Dockerfile or deploying a pre-built image).

#### Scenario: Docker deployment from Git
- **WHEN** a user connects their GitHub repository to Koyeb
- **THEN** the instructions SHALL describe using Koyeb's Docker builder to build from the repository's Dockerfile
