import argparse
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from infolens.maintenance import create_backup


class MaintenanceTests(unittest.TestCase):
    def test_backup_copies_media_and_uses_sqlite_backup_api(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output_root = root / "output"
            system_root = output_root / "_system"
            image_root = output_root / "_image_library" / "2026-07"
            system_root.mkdir(parents=True)
            image_root.mkdir(parents=True)
            (image_root / "photo.jpg").write_bytes(b"photo")

            database = system_root / "image_library.sqlite3"
            with sqlite3.connect(database) as connection:
                connection.execute("CREATE TABLE records (value TEXT NOT NULL)")
                connection.execute("INSERT INTO records VALUES ('ready')")

            backup_root = root / "backups"
            args = argparse.Namespace(
                output_root=str(output_root),
                backup_root=str(backup_root),
                retention_days=30,
                database_only=False,
            )
            self.assertEqual(create_backup(args), 0)

            snapshots = list(backup_root.iterdir())
            self.assertEqual(len(snapshots), 1)
            snapshot = snapshots[0]
            self.assertEqual(
                (snapshot / "_image_library" / "2026-07" / "photo.jpg").read_bytes(),
                b"photo",
            )
            with sqlite3.connect(snapshot / "_system" / database.name) as connection:
                value = connection.execute("SELECT value FROM records").fetchone()[0]
            self.assertEqual(value, "ready")
            manifest = json.loads(
                (snapshot / "backup-manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["database_count"], 1)
            self.assertEqual(manifest["copied_files"], 1)


if __name__ == "__main__":
    unittest.main()
