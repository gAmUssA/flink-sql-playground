#!/usr/bin/env bash
# Runs the factory script tests. Not part of ./gradlew build or CI: the repo has no test layer for factory/.
export PYTHONDONTWRITEBYTECODE=1
set -u
here=$(cd "$(dirname "$0")" && pwd -P)
rc=0
python3 -I -m unittest discover -s "$here" -p 'test_*.py' || rc=1
bash "$here/test_agent.sh" || rc=1
bash "$here/test_bob_review.sh" || rc=1
exit $rc
