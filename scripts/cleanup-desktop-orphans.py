#!/usr/bin/env python3
"""Preview orphaned desktop watchers; pass --kill to stop them and their children."""

import argparse
import os
from pathlib import Path
import shlex
import signal
import subprocess
import time

DESKTOP = Path(__file__).resolve().parents[1] / "apps/desktop"


def snapshot():
    output = subprocess.check_output(
        ["ps", "-axo", "pid=,ppid=,lstart=,command="], text=True
    )
    processes = {}
    for line in output.splitlines():
        fields = line.split(None, 7)
        if len(fields) == 8:
            pid, parent, *rest = fields
            processes[int(pid)] = (int(parent), " ".join(rest[:5]), rest[5])
    return processes


def cwd(pid):
    if Path("/proc").is_dir():
        try:
            return Path(os.readlink(f"/proc/{pid}/cwd")).resolve()
        except OSError:
            return None
    result = subprocess.run(
        ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
        capture_output=True, text=True, check=False,
    )
    return next((Path(line[1:]).resolve() for line in result.stdout.splitlines()
                 if line.startswith("n")), None)


def is_watcher(process):
    parent, _, command = process
    try:
        args = shlex.split(command)
    except ValueError:
        return False
    return (parent == 1 and len(args) == 2
            and Path(args[0]).name in {"node", "bun"}
            and args[1] in {"scripts/dev-electron.mjs", str(DESKTOP / "scripts/dev-electron.mjs")})


def descendants(processes, root):
    found = []
    pending = [root]
    while pending:
        parent = pending.pop()
        children = [pid for pid, info in processes.items() if info[0] == parent]
        found.extend(children)
        pending.extend(children)
    return found


def same_process(before, after):
    # Parent may become PID 1 after the watcher exits. Start time and command
    # must still match before sending a signal to a previously captured PID.
    return after is not None and before[1:] == after[1:]


def send(pid, original, sig):
    if same_process(original, snapshot().get(pid)):
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--kill", action="store_true", help="perform cleanup")
    mode.add_argument("--dry-run", action="store_true", help="preview only (default)")
    args = parser.parse_args()
    processes = snapshot()
    roots = [pid for pid, info in processes.items()
             if is_watcher(info) and cwd(pid) == DESKTOP]
    if not roots:
        print(f"No orphaned desktop watchers for {DESKTOP}.")
        return
    for root in roots:
        children = descendants(processes, root)
        print(f"Orphaned watcher {root}; captured descendants: {children}")
        for pid in [root, *children]:
            print(f"  {pid}: {processes[pid][2]}")
        if not args.kill:
            continue
        if snapshot().get(root) != processes[root] or cwd(root) != DESKTOP:
            print(f"Skipping {root}: identity or ownership changed.")
            continue
        # SIGTERM invokes this watcher's broad pkill cleanup, which can stop
        # the healthy app too. Kill only the verified orphan watcher first.
        send(root, processes[root], signal.SIGKILL)
        for pid in children:
            send(pid, processes[pid], signal.SIGTERM)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            current = snapshot()
            if not any(same_process(processes[pid], current.get(pid)) for pid in children):
                break
            time.sleep(0.1)
        for pid in children:
            send(pid, processes[pid], signal.SIGKILL)
        print(f"Stopped orphaned watcher {root} and its captured descendants.")
    if not args.kill:
        print("Dry run only. Rerun with --kill to perform cleanup.")


if __name__ == "__main__":
    main()
