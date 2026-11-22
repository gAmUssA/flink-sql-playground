import { defineRailway, github, project, service } from "railway/iac";

// Railway Infrastructure as Code for the playground backend (replaces railway.json, which Railway
// stops reading on 2026-12-01). Migrated with `railway config migrate --variables unmanaged`; the
// restart policy was added by hand because the migration drops it.
//
// Variables stay unmanaged: QUARKUS_PROFILE, the Supabase credentials and the CORS origins live
// in the Railway dashboard, never in this file. See DEPLOY.md.
//
// This repository manages only its own resources in the environment. Other repositories export
// their own partial name. See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "flink-sql-playground";

export default defineRailway(() => {
  const flinkSqlPlayground = service("flink-sql-playground", {
    // Every push to main deploys; Railway does not wait for GitHub CI (checkSuites: false).
    source: github("gAmUssA/flink-sql-playground", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/api/build-info",
    healthcheckTimeout: 300,
    // Flyway migrations run once before the new container takes traffic.
    preDeploy:
      "java -Xmx512m -Dquarkus.init-and-exit=true -Dquarkus.flyway.migrate-at-start=true -Dquarkus.hibernate-orm.schema-management.strategy=validate -jar quarkus-run.jar",
    replicas: { "us-west1": 1 },
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
      limitOverride: { containers: { cpu: 4, memoryBytes: 4000000000 } },
      sleepApplication: true,
    },
    domains: [{ domain: "sql.selectstar.stream", port: 9090 }],
  });

  return project("insightful-harmony", {
    variables: { managed: false },
    resources: [flinkSqlPlayground],
  });
});
