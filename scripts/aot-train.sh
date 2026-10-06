#!/usr/bin/env bash
# Trains a JDK AOT cache (JEP 483/514/515) for the packaged app.
#
# Starts quarkus-run.jar with -XX:AOTCacheOutput, waits for HTTP, runs one BATCH and one
# STREAMING query so Flink's planner, code generation and execution classes are loaded,
# then stops the app with SIGTERM; the JVM writes the cache as it exits.
#
# The cache only loads with the same JVM build, the same jars and compatible JVM flags,
# so train inside the runtime image with the ENTRYPOINT's flags.
#
# Usage: scripts/aot-train.sh <app-dir> <cache-file> <port> [java flags...]
# Stdout: one line, "aot-train: <cache-file> <bytes>". Exit 1 with a message on stderr on failure.
set -euo pipefail

READY_TIMEOUT_SECONDS=120
EXIT_TIMEOUT_SECONDS=120

die() { echo "aot-train: $*" >&2; exit 1; }

# EXIT-trap cleanup: stop the app if it is still running.
stop_app() {
  if kill -0 "$1" 2>/dev/null; then
    kill "$1"
  fi
  return 0
}

# http <method> <path> [json-body]: prints the response body; exit status 1 unless HTTP 2xx.
http() {
  local method=$1 path=$2 body=${3:-} response status
  exec 3<>"/dev/tcp/127.0.0.1/${PORT}" || return 1
  printf '%s %s HTTP/1.0\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: %s\r\n\r\n%s' \
    "$method" "$path" "${#body}" "$body" >&3
  response=$(cat <&3)
  exec 3<&-
  status=$(printf '%s' "$response" | head -n1 | cut -d' ' -f2)
  printf '%s' "${response#*$'\r\n\r\n'}"
  [[ $status == 2* ]]
}

main() {
  [[ $# -ge 3 ]] || die "usage: scripts/aot-train.sh <app-dir> <cache-file> <port> [java flags...]"
  local app_dir=$1 cache=$2
  PORT=$3
  shift 3
  [[ -f "$app_dir/quarkus-run.jar" ]] || die "no quarkus-run.jar in $app_dir; build the fast-jar first"

  cd "$app_dir"
  rm -f "$cache"
  # The app's own output goes to stderr so stdout carries only the result line.
  java "$@" -XX:AOTCacheOutput="$cache" -Dquarkus.http.port="$PORT" -jar quarkus-run.jar >&2 &
  APP_PID=$!
  local pid=$APP_PID
  trap 'stop_app "$APP_PID"' EXIT

  local waited=0
  until http GET /api/build-info >/dev/null 2>&1; do
    kill -0 "$pid" 2>/dev/null || die "the app exited before it answered on port $PORT"
    (( waited++ < READY_TIMEOUT_SECONDS )) || die "the app did not answer on port $PORT within ${READY_TIMEOUT_SECONDS}s"
    sleep 1
  done

  local session
  session=$(http POST /api/sessions '' | sed -n 's/.*"sessionId" *: *"\([^"]*\)".*/\1/p') || die "could not create a session"
  [[ -n $session ]] || die "session response had no sessionId"
  for mode in BATCH STREAMING; do
    http POST "/api/sessions/$session/execute" "{\"mode\":\"$mode\",\"sql\":\"SELECT 1 AS x\"}" >/dev/null \
      || die "$mode training query failed"
  done
  http DELETE "/api/sessions/$session" >/dev/null || die "could not delete the training session"

  kill -TERM "$pid"
  local exited=0
  while kill -0 "$pid" 2>/dev/null; do
    (( exited++ < EXIT_TIMEOUT_SECONDS )) || die "the app did not exit within ${EXIT_TIMEOUT_SECONDS}s after SIGTERM"
    sleep 1
  done
  trap - EXIT
  local rc=0
  wait "$pid" || rc=$?
  # A SIGTERM shutdown exits 143 (128 + 15); anything else means the JVM failed.
  [[ $rc -eq 0 || $rc -eq 143 ]] || die "the app exited with status $rc after SIGTERM"

  [[ -s "$cache" ]] || die "the JVM wrote no AOT cache at $app_dir/$cache"
  echo "aot-train: $cache $(wc -c < "$cache" | tr -d ' ')"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
