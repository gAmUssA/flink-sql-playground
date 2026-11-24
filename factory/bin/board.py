#!/usr/bin/env python3
"""The only way the orchestrator writes factory/board.json.

  board.py init   <job> bean=<id> title="..." branch=factory/<job>
  board.py set    <job> stage=review round=2 note="..." pr.number=89   (values parse as JSON if they can)
  board.py round  <job> <n> security=copilot ux=bob ui=bob code=copilot   (adds round n, all pending)
  board.py review <job> <n> <role> PASS|CHANGES
  board.py show   [<job>]

Writes are atomic (temp file + rename), so the dashboard never reads half a file, and each
command holds board.json.lock from load to save, so two writers can't lose each other's update.
"""
import fcntl, json, os, sys, tempfile
from datetime import datetime, timezone

BOARD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "board.json")
STAGES = ["spec", "build", "review", "approve", "pr", "merged", "needs-human"]


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load():
    if not os.path.exists(BOARD):
        return {"maxRounds": 3, "jobs": []}
    with open(BOARD) as f:
        return json.load(f)


def save(board):
    board["updated"] = now()
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(BOARD), suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(board, f, indent=2)
        f.write("\n")
    os.replace(tmp, BOARD)


def job(board, job_id, create=False):
    for j in board["jobs"]:
        if j["id"] == job_id:
            return j
    if not create:
        sys.exit(f"board.py: no job {job_id}")
    j = {"id": job_id, "stage": "spec", "round": 0, "rounds": [], "decision": None,
         "pr": None, "note": "", "started": now(), "history": [{"at": now(), "stage": "spec"}]}
    board["jobs"].append(j)
    return j


def value(text):
    try:
        return json.loads(text)
    except ValueError:
        return text


def assign(target, key, val):
    *path, last = key.split(".")
    for part in path:
        if not isinstance(target.get(part), dict):
            target[part] = {}
        target = target[part]
    target[last] = val


def pairs(args):
    for arg in args:
        key, sep, val = arg.partition("=")
        if not sep:
            sys.exit(f"board.py: expected key=value, got {arg}")
        yield key, value(val)


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    cmd = argv[1]
    lock = open(BOARD + ".lock", "w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    board = load()
    if cmd == "show":
        jobs = [job(board, argv[2])] if len(argv) > 2 else board["jobs"]
        print(json.dumps(jobs, indent=2))
        return
    j = job(board, argv[2], create=(cmd == "init"))
    if cmd in ("init", "set"):
        for key, val in pairs(argv[3:]):
            if key == "stage":
                if val not in STAGES:
                    sys.exit(f"board.py: stage must be one of {STAGES}")
                if val != j.get("stage"):
                    j["history"].append({"at": now(), "stage": val})
            assign(j, key, val)
    elif cmd == "round":
        n = int(argv[3])
        reviewers = dict(pairs(argv[4:]))
        j["rounds"] = [r for r in j["rounds"] if r["n"] != n] + [
            {"n": n, "reviewers": reviewers, "reviews": {role: "pending" for role in reviewers}}]
        j["round"], j["stage"] = n, "review"
        j["history"].append({"at": now(), "stage": "review", "note": f"round {n}"})
    elif cmd == "review":
        n, role, verdict = int(argv[3]), argv[4], argv[5]
        if verdict not in ("PASS", "CHANGES", "pending"):
            sys.exit("board.py: verdict must be PASS or CHANGES")
        rnd = next((r for r in j["rounds"] if r["n"] == n), None)
        if rnd is None or role not in rnd["reviews"]:
            sys.exit(f"board.py: no reviewer {role} in round {n}")
        rnd["reviews"][role] = verdict
    else:
        sys.exit(__doc__)
    save(board)


if __name__ == "__main__":
    main(sys.argv)
