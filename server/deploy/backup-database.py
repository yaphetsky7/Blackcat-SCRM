#!/usr/bin/env python3
"""Consistent SQLite snapshots, including changes still in the WAL."""
import datetime
import os
import pathlib
import sqlite3

os.umask(0o077)
source = pathlib.Path("/var/lib/blackcat-server/blackcat.db")
folder = pathlib.Path("/var/backups/blackcat-server")
folder.mkdir(mode=0o700, parents=True, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
destination = folder / ("blackcat-" + stamp + ".db")
with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=30) as live:
    with sqlite3.connect(destination) as backup:
        live.backup(backup, pages=256, sleep=0.05)
with sqlite3.connect(destination.as_uri() + "?mode=ro", uri=True) as backup:
    if backup.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise RuntimeError("Database backup verification failed")
cutoff = datetime.datetime.now(datetime.timezone.utc).timestamp() - 14 * 86400
for previous in folder.glob("blackcat-*.db"):
    if previous != destination and previous.stat().st_mtime < cutoff:
        previous.unlink()
print("Database backup verified: " + destination.name)
