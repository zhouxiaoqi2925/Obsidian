#!/usr/bin/env python3
"""
Single-process daemon launcher.
Spawns ONE child process running the target script, then exits immediately.
The child continues running detached.
Usage: python launcher.py <script.py> [args...]
"""
import subprocess
import sys
import os

if len(sys.argv) < 2:
    print("usage: launcher.py <script.py> [args...]")
    sys.exit(1)

script = sys.argv[1]
args = sys.argv[2:]

# Use CREATE_NO_WINDOW + DETACHED_PROCESS on Windows
if sys.platform == "win32":
    DETACHED_PROCESS = 0x00000008
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    CREATE_NO_WINDOW = 0x08000000
    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
    creationflags = flags
else:
    creationflags = 0

cmd = [sys.executable, script] + args
p = subprocess.Popen(
    cmd,
    creationflags=creationflags,
    close_fds=True,
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
print(f"launched {p.pid}: {' '.join(cmd)}")
# Exit immediately so PowerShell doesn't try to manage us
sys.exit(0)