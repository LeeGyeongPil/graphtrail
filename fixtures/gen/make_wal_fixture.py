"""Build fixtures/wal-agent.sqlite and fixtures/wal-agent.sqlite-wal from py-agent.sqlite.

Imitates a LangGraph app that is still running: the database is in WAL mode, the first
6 checkpoints were already copied into the main file by a checkpoint, and the remaining
rows are committed but live only in the -wal file. The files are copied while the writer
connection is still open (closing it would checkpoint the WAL away).

Standard library only. Usage: python3 -I make_wal_fixture.py ../py-agent.sqlite ../wal-agent.sqlite
"""
import os
import shutil
import sqlite3
import sys
import tempfile

src, out = sys.argv[1:3]
with tempfile.TemporaryDirectory() as tmp:
    live_path = os.path.join(tmp, "live.sqlite")
    fixture = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    schema = [r[0] for r in fixture.execute("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL")]
    tables = [r[0] for r in fixture.execute("SELECT name FROM sqlite_master WHERE type='table'")]

    live = sqlite3.connect(live_path)
    live.execute("PRAGMA journal_mode=WAL")
    live.execute("PRAGMA wal_autocheckpoint=0")
    for stmt in schema:
        live.execute(stmt)
    live.commit()
    live.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    for t in tables:
        rows = fixture.execute(f"SELECT * FROM {t}").fetchall()
        if not rows:
            continue
        marks = ",".join("?" * len(rows[0]))
        if t == "checkpoints":
            live.executemany(f"INSERT INTO {t} VALUES ({marks})", rows[:6])
            live.commit()
            live.execute("PRAGMA wal_checkpoint(TRUNCATE)")  # first 6 rows reach the main file
            rows = rows[6:]
        live.executemany(f"INSERT INTO {t} VALUES ({marks})", rows)
    live.commit()  # committed, but only in -wal while this connection stays open

    for suffix in ("", "-wal"):
        if os.path.exists(out + suffix):
            os.remove(out + suffix)
        shutil.copyfile(live_path + suffix, out + suffix)
    print("main", os.path.getsize(out), "wal", os.path.getsize(out + "-wal"))
    live.close()
    fixture.close()
