# AGENTS.md

Notes for coding agents working in this repo. Read this before you build, test, bump
dependencies or deploy. It records what earlier sessions had to figure out the hard way.

Deeper docs: `docs/ARCHITECTURE.md` (system design, packages, test layers),
`docs/STARTUP.md` (cold start), `docs/adr/` (shared MiniCluster, AOT cache, CodeMirror,
job graph from EXPLAIN, watermark timeline probe, preset event-time contract, dimension views),
`DEPLOY.md` (Railway, Supabase, Fly, VPS).

## What this is

A browser playground for Flink SQL. Quarkus 3 backend (Java 25) embeds one shared Flink
MiniCluster and runs user SQL per session. The frontend is a static SPA in
`src/main/resources/META-INF/resources/` with a CodeMirror 6 editor bundled from
`src/main/frontend/` by esbuild. A custom `faker` connector (DataFaker) lives in
`com.flinksqlfiddle.faker`.

## Toolchain

- **JDK 25 to build, not only to run.** Quarkus augmentation runs in the Gradle JVM and loads
  the compiled Java 25 classes. Gradle 9 wrapper; use `./gradlew`.
- **Node 22.19+** (Node 22 LTS line, same as CI and the Dockerfile). Run `npm ci` before any
  Gradle build: `processResources` depends on `bundleEditor`, which shells out to
  `node scripts/build-editor.js`.
- `src/main/resources/META-INF/resources/js/editor.bundle.js` is generated and gitignored.
  If the editor looks stale, rebuild it with `npm run build:editor`.
- npm 11 may warn that esbuild's postinstall was not approved. The bundle still builds;
  ignore it unless `build-editor.js` fails.

## Build and test

```bash
npm ci
./gradlew test        # fast JVM tests (excludes tag "smoke")
./gradlew smokeTest   # Flink MiniCluster tests, slow, sequential, -Xmx1g
./gradlew jsTest      # node --test on src/test/js/*.test.js
./gradlew build       # compile + test + check (check pulls in smokeTest and jsTest)

npx playwright install chromium webkit
npx playwright test   # browser tests, static server + stubbed API, no backend
```

- Browser tests serve on port 8790 and **reuse** a server already listening there unless
  `CI` is set. In a second checkout or a worktree, set `E2E_PORT=87xx`, or you will test the
  other checkout's files. Use `CI=1 npx playwright test` for a clean run.
- Playwright projects cover upright phones, sideways phones (`landscape.spec.js`), desktop and
  editor tests in Chromium and WebKit. Six WebKit safe-area skips are expected.
- **CI (Linux) is the reference for layout tests.** On macOS, three Chromium tests fail even
  on a clean `main` (checked at 2f55d51, Nov 2026): `desktop.spec.js` "column filter stays
  inside a 1280x1100 window", `mobile.spec.js` "every changelog row can be scrolled into view
  whole", `landscape.spec.js` "at 568x320, the changelog shows whole rows". Before you treat a
  local failure as a regression, run the same test on `main` (`git worktree add`). Running
  several Playwright suites at once on one machine also makes WebKit landscape tests flaky.
- The e2e suite enforces 4.5:1 text contrast (`src/test/e2e/contrast.js`). Any color change
  must keep it.
- Lighthouse (CI thresholds): `node scripts/serve-static.js 8790 &` then
  `node scripts/lighthouse-check.js http://127.0.0.1:8790/ accessibility=95 performance=85 transfer-kb=400`.
  The script runs Lighthouse 3 times per URL and scores the median; the JSON `runs` key shows each run.
  `embed.html` is checked at `performance=80`, not 85: its score sits near 82, a few points under the
  index page, and the median of 3 runs alone does not close that gap. Bean `flink-sql-playground-ztp3`
  trims what embed mode loads and then raises the embed threshold back to 85.
- `embed.html` is the compact iframe page (ADR 0008). It shares `js/app.js`, which runs in embed mode
  when `<html data-embed="1">`: no session on load, `embedPrepare()` builds the session and the schema on
  Run. Anything new in `app.js` that runs at load or touches an element must work when the topbar,
  sidebar, tour and tweaks are missing (use `on(id, …)`), and must not call the API before a Run.
  Framing is allowed only for the exact path `/embed.html` (`EmbedFraming`); keep it that way.
  Embed browser tests frame the page from a second local server (Chromium refuses a
  route-fulfilled host), and `E2E_PORT` applies to them.
- Shipped example queries (`js/examples.js`) are executed by `ExampleQueriesSmokeTest`,
  planned by `ExplainSmokeTest` (the Gradle `dumpPresets` task exports them to JSON with
  `scripts/dump-presets.mjs`; smokeTest depends on it), and their table qualifiers are
  checked by `src/test/js/preset-qualifiers.test.js`. Editor autocomplete changes and new
  presets must keep every preset working.
- The Job Graph tab is the real optimized plan (`/explain`, `PlanParser`, `js/job-graph.js`;
  ADR 0004). A Flink upgrade can change the text plan format or the internal
  `CollectModifyOperation` API it relies on: run `ExplainSmokeTest` after any Flink bump.
- Every preset with a WATERMARK must be listed in `src/test/resources/preset-watermarks.json`
  as `lossless` or `lossy` (ADR 0006). `preset-watermarks.test.js` checks the SQL and
  `PresetWatermarkSmokeTest` checks the claim on real Flink. Aggregate inside a window before
  joining, and never name a `PROCTIME()` column like an event time.
- Never declare a PRIMARY KEY on a faker table: faker repeats keys as inserts, and Flink trusts the
  key, so a join shows a fact once per dimension row. Keep the latest row per key in a view
  (`ROW_NUMBER` over `PROCTIME()`, ADR 0009); `DimensionPresetSmokeTest` checks the two presets
  that do. A view over an unbounded table exists in the streaming environment only, and BATCH
  answers `STREAMING_ONLY_VIEW` for it.
- The Timeline tab records a separate probe job (`TimelineService`, `js/watermark-timeline.js`;
  ADR 0005). It shows a sample of the stream, not the user's rows; keep that wording in the UI.
  `TimelineSmokeTest` runs the "Watermark Timeline" preset: a tight watermark must drop clicks,
  a wide one none. Changing that preset's DDL means updating the test's string replacements.

## Dependencies: where versions live

A dependency bump touches more than one file. Check all of these:

| What | Where |
|---|---|
| Quarkus | `gradle.properties` (`quarkusPluginVersion`, `quarkusPlatformVersion`) |
| Flink | `build.gradle.kts` (`flinkVersion`), plus the README badge, `docs/ARCHITECTURE.md`, the status bar in `index.html`, and the datagen comment in `src/main/frontend/sql-schema.mjs` |
| Caffeine, DataFaker, BootUI | `build.gradle.kts` |
| Gradle | `./gradlew wrapper --gradle-version X` |
| JDK image | `Dockerfile` (build + runtime stages) and `Dockerfile.runtime`: `eclipse-temurin:25.x-jdk/jre` |
| Node image | `Dockerfile` editor stage, stay on Node 22 LTS |
| npm packages | `package.json`, all pinned to exact versions; `npm install` refreshes the lockfile |

- Stay on Quarkus 3.x until 4.0 is GA. Platform micro releases (`3.40.1.2`) bump only the
  BOM; the Gradle plugin can stay on the matching core version (`3.40.1`).
- `migration-report.md` is a historical record. Do not rewrite versions in it.
- Latest versions: Maven Central `maven-metadata.xml`
  (`https://repo1.maven.org/maven2/<group path>/<artifact>/maven-metadata.xml`),
  `npm view <pkg> version`, Docker Hub tags API for images.

## Deploy

There is no manual deploy step. **Merging to `main` deploys.**

- **Railway** builds the repo `Dockerfile` on every push to `main`. Service settings (builder,
  health check `/api/build-info`, Flyway pre-deploy, restart policy, resources, domain) are
  Infrastructure as Code in `.railway/railway.ts`; `railway.json` is gone (Railway stops
  reading it on 2026-12-01; this service moved off it on 2026-11-22). A merge deploys code at
  once but never applies that file. Run `railway config plan`, review, then `railway config
  apply` from the PR branch before merging when the settings work with the code on `main`;
  stage changes tied to new code (see DEPLOY.md). Variables are unmanaged (dashboard only). The repo is not linked by default; the Railway project is
  `insightful-harmony`, environment `production`, service `flink-sql-playground`. It reports back as a GitHub deployment named
  `insightful-harmony / production`. Check it with
  `gh api repos/gAmUssA/flink-sql-playground/deployments` and the deployment's
  `statuses_url`. The app sleeps when idle, so the first request after a deploy is a cold
  start.
- **GitHub Pages** (`.github/workflows/pages.yml`) publishes the static SPA on pushes to
  `main` that touch frontend files, `package*.json` or the editor build.
- **ghcr image** (`docker-publish.yml`) builds only on `v*` tags or manual dispatch. It is for
  offline demos and is not in the deploy path.
- The `supabase` Quarkus profile must be active at **build** time (it fixes the JDBC driver).
  Railway forwards `QUARKUS_PROFILE` to the build. See `DEPLOY.md`.
- The deployed footer shows the commit from `/api/build-info`. Use it to confirm that a
  deploy is live.

## Workflow conventions

- Never commit to `main` directly. Branch (`fix/…`, `feat/…`, `chore/…`), open a PR, merge
  with a merge or squash after CI passes. CI: `Smoke Test` (Gradle build + smoke tests) and
  `Frontend (browser tests)` (Playwright + Lighthouse).
- Conventional commits: `fix(frontend): …`, `feat(editor): …`, `chore(deps): …`.
- PR body: `Fixes #N` lines, a **Summary** per issue, a **Test plan** with real numbers
  (tests passed, skipped), and a **Follow-ups** list. Advisory review findings that are not
  fixed go into a new issue and are linked, not dropped.
- Worktrees for parallel agents live under `.claude/worktrees/` (gitignored).
- **The factory** (`/factory`, `.claude/skills/factory/`, `factory/README.md`) takes a bean through
  spec, build, a four-way review (security, ux, ui, code), approval, PR, CI and merge. Claude writes the
  spec and the code; Copilot and Bob only review, alternating roles per round; every agent runs in its
  own Rex block, and Claude only on the claude.ai subscription (`factory/bin/claude-sub`). An APPROVE
  merges after green CI, which deploys; red CI or a risky path (deploy, CI, dependencies, migrations, the
  SQL guard, embed framing, the factory) waits for a human. Dashboard: `static-web-server -p 8799 -d
  factory --compression false` (not 8790, which Playwright reuses).
- Outside the factory, adversarial reviews are run by GitHub Copilot, headless in a visible Rex block, read-only. From
  the worktree, with the prompt in a file (it names the diff, `git diff origin/main...<branch>`,
  what to try to break, and asks for findings most-severe-first ending with `DONE`):

  ```bash
  rex run --focus=false --wait --interactive -- copilot -p "$(cat prompt.txt)" \
    --allow-tool 'shell(git diff:*)' --allow-tool 'shell(git log:*)' --allow-tool 'shell(git show:*)' \
    --allow-tool 'shell(node:*)' --allow-tool 'shell(rg:*)' \
    --deny-tool 'shell(git push:*)' --deny-tool 'shell(git commit:*)' --deny-tool 'shell(git reset:*)' \
    --deny-tool 'shell(rm:*)' --deny-tool 'write' \
    --share build/copilot-review-<topic>.md
  ```

  `--interactive` lets Rex read `~/.zshrc` for PATH; without Rex (`rex whoami` fails), run the
  same `copilot -p …` directly. Copilot reads files with its built-in tools; never grant `write`
  or `--allow-all`. `--share` writes the session, final answer included, when it finishes; watch
  it live with `rex capture -b <block> --trim`. Post the report on the PR with how each finding
  was resolved.
- Work is tracked as beans (`.beans/`, `beans prime` for the CLI guide). Commit bean files
  with the code they describe. Record decisions that later work depends on as an ADR in
  `docs/adr/`.
- On the maintainer's machine a git guard (Airlock) blocks plain `git push` to this
  (non-Confluent) repo. Push with `zsh -ic 'git push-external -u origin <branch>'`:
  `push-external` comes from the maintainer's zsh config, so a non-interactive shell does
  not see it. It scans every commit in the pushed history (about a minute). Never push with
  `/opt/homebrew/bin/git` or `/usr/bin/git` to skip the guard. Then `gh pr create`.
