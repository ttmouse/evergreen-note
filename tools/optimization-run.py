#!/usr/bin/env python3
"""Serialize optimization rounds and preserve their half-hour idempotency keys."""
import argparse
import fcntl
import json
from pathlib import Path
import subprocess
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["begin", "finish", "status"])
    parser.add_argument("--run-id")
    parser.add_argument("--status", choices=["completed", "failed", "noop"])
    parser.add_argument("--commit")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]

    def git(*command):
        return subprocess.check_output(["git", "-C", str(root), *command], text=True).strip()

    common = Path(git("rev-parse", "--git-common-dir"))
    if not common.is_absolute():
        common = root / common
    state_path = common / "evergreen-optimization-state.json"
    with (common / "evergreen-optimization.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads(state_path.read_text()) if state_path.exists() else {"history": []}
        if args.action == "status":
            print(json.dumps(state, ensure_ascii=False))
            return 0
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        bucket = now.replace(minute=(now.minute // 30) * 30, second=0, microsecond=0).isoformat()
        if args.action == "begin":
            if state.get("active") or any(row["bucket"] == bucket for row in state["history"]):
                print(json.dumps({"status": "skip", "reason": "active-or-already-run", "active": state.get("active")}))
                return 2
            state["active"] = {
                "run_id": str(uuid.uuid4()), "bucket": bucket,
                "started_at": now.isoformat(), "head": git("rev-parse", "HEAD"),
                "baseline_status": git("status", "--porcelain=v1", "--untracked-files=all"),
            }
            result = state["active"]
        else:
            active = state.get("active")
            if not active or active["run_id"] != args.run_id or not args.status:
                parser.error("finish requires the active --run-id and --status")
            if args.commit:
                args.commit = git("rev-parse", "--verify", args.commit + "^{commit}")
            result = {**active, "finished_at": now.isoformat(), "status": args.status, "commit": args.commit}
            state["history"] = (state["history"] + [result])[-100:]
            state["active"] = None
        # The separate flock remains held across the write. Corrupt state fails closed.
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
