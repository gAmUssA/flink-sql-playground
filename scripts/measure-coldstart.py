#!/usr/bin/env python3
"""Measure backend cold-start: JVM boot -> HTTP ready -> first (cold) query -> warm query.

Runs the packaged Quarkus fast-jar under the production JVM flags and times the phases
that matter for serverless cold starts. The first query is the expensive one: it lazily
spins up the Flink MiniCluster and triggers Janino runtime code generation.

Usage:
    python3 scripts/measure-coldstart.py [--runs N] [--label NAME] [--jvm "extra flags"]

Notes:
  * Build the fast-jar first:  ./gradlew quarkusBuild   (on JDK 25)
  * Uses JAVA_HOME if set, else `java` on PATH.
  * Measures JVM-level cold start on a warm disk; real serverless cold start additionally
    pays container image pull + cold page cache + slower vCPU, so treat these as a
    relative baseline for comparing optimizations (AppCDS, CRaC, ...), not absolute SLAs.
"""
import argparse, json, os, re, signal, statistics, subprocess, time, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JAR_DIR = os.path.join(REPO, "build", "quarkus-app")
JAVA = os.path.join(os.environ["JAVA_HOME"], "bin", "java") if os.environ.get("JAVA_HOME") else "java"
BASE = "http://localhost:9090"
PROD_FLAGS = ["-Xms768m", "-Xmx1536m", "-XX:+UseZGC", "-XX:+ZGenerational",
              "-XX:MetaspaceSize=128m", "-XX:MaxMetaspaceSize=384m"]

DDL = {"mode": "BATCH", "sql": "CREATE TEMPORARY TABLE orders (user_id INT, amount DOUBLE) WITH "
       "('connector'='datagen','number-of-rows'='20','fields.user_id.min'='1','fields.user_id.max'='5',"
       "'fields.amount.min'='10','fields.amount.max'='500')"}
QUERY = {"mode": "BATCH", "sql": "SELECT user_id, COUNT(*) AS c, ROUND(SUM(amount),2) AS t "
         "FROM orders GROUP BY user_id ORDER BY user_id"}


def post(path, payload, timeout=60):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode()


def get(path, timeout=5):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return r.status, r.read().decode()


def free_port():
    subprocess.run("PID=$(lsof -ti tcp:9090); [ -n \"$PID\" ] && kill -9 $PID; sleep 1", shell=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--label", default="baseline")
    ap.add_argument("--jvm", default="", help="extra JVM flags, space-separated")
    args = ap.parse_args()
    extra = args.jvm.split() if args.jvm else []

    results = []
    for run in range(1, args.runs + 1):
        free_port()
        logf = open(f"/tmp/cold_{args.label}_{run}.log", "w")
        t0 = time.monotonic()
        proc = subprocess.Popen([JAVA] + PROD_FLAGS + extra + ["-jar", "quarkus-run.jar"],
                                cwd=JAR_DIR, stdout=logf, stderr=subprocess.STDOUT)
        ready = None
        while time.monotonic() - t0 < 90:
            try:
                if get("/api/build-info")[0] == 200:
                    ready = time.monotonic() - t0
                    break
            except Exception:
                time.sleep(0.05)
        if ready is None:
            print(f"run {run}: never became ready"); proc.kill(); continue
        sid = json.loads(post("/api/sessions", {})[1])["sessionId"]
        post(f"/api/sessions/{sid}/execute", DDL)
        q0 = time.monotonic(); post(f"/api/sessions/{sid}/execute", QUERY); cold = time.monotonic() - q0
        total_cold = time.monotonic() - t0
        w0 = time.monotonic(); post(f"/api/sessions/{sid}/execute", QUERY); warm = time.monotonic() - w0
        rss = subprocess.run(f"ps -o rss= -p {proc.pid}", shell=True, capture_output=True, text=True).stdout.strip()
        rss_mb = int(rss) / 1024 if rss.isdigit() else None
        logf.flush(); logf.close()
        m = re.search(r"started in ([\d.]+)s", open(f"/tmp/cold_{args.label}_{run}.log").read())
        started = float(m.group(1)) if m else None
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        results.append(dict(run=run, boot_ready=ready, quarkus_started=started, cold_query=cold,
                            warm_query=warm, total_cold_to_first_result=total_cold, rss_mb=rss_mb))
        print(f"run {run}: ready={ready:.2f}s quarkusStarted={started}s coldQuery={cold:.2f}s "
              f"warmQuery={warm:.2f}s totalCold={total_cold:.2f}s rss={rss_mb:.0f}MB")
        free_port()

    def med(k):
        v = [r[k] for r in results if r[k] is not None]
        return statistics.median(v) if v else None

    print(f"\n=== MEDIAN [{args.label}] (n={len(results)}) ===")
    for k in ["quarkus_started", "boot_ready", "cold_query", "total_cold_to_first_result", "warm_query", "rss_mb"]:
        m = med(k)
        print(f"  {k:32s}: {m:.2f}" if m is not None else f"  {k}: n/a")


if __name__ == "__main__":
    main()
