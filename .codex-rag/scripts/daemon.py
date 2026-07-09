#!/usr/bin/env python3
"""
Launch a Python script as a TRUE single-process daemon.
Uses subprocess.Popen with DETACHED_PROCESS + CREATE_NEW_PROCESS_GROUP
on Windows, which guarantees ONE child process (no PowerShell spawn duplication).
"""
import subprocess
import sys

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000

if len(sys.argv) < 3:
    print("usage: daemon.py <python.exe> <script.py> [args...]")
    sys.exit(1)

py = sys.argv[1]
script = sys.argv[2]
args = sys.argv[3:]

cmd = [py, script] + args
flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

# On Windows, close_fds + DETACHED_PROCESS detaches from parent
p = subprocess.Popen(
    cmd,
    creationflags=flags,
    close_fds=True,
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
print(f"spawned PID {p.pid}: {cmd}")