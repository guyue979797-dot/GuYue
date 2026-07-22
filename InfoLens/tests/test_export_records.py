import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from infolens.export_records import ExportExpiredError, ExportRecordStore


class ExportRecordStoreTests(unittest.TestCase):
    def test_records_are_shared_and_archive_expires_after_30_days(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            store = ExportRecordStore(root / "_system" / "exports.sqlite3", root)
            archive = root / "_image_exports" / "record.zip"
            archive.write_bytes(b"zip")
            created_at = datetime(2026, 7, 1, 3, 0, tzinfo=timezone.utc)

            record = store.create_record(
                record_id="record-1",
                description="七月客户照片",
                owner_username="worker-a",
                owner_display_name="业务员甲",
                archive_name=archive.name,
                archive_path="_image_exports/record.zip",
                image_items=[("image-1", "1001"), ("image-2", "1001")],
                archive_size_bytes=archive.stat().st_size,
                created_at=created_at,
            )

            self.assertEqual(record["image_count"], 2)
            self.assertEqual(record["field_count"], 1)
            self.assertEqual(record["fields"], ["1001"])
            self.assertEqual(len(store.list_records(now=created_at)), 1)

            before_expiry = created_at + timedelta(days=29, hours=23)
            _, download_path = store.archive_for_download(
                "record-1",
                now=before_expiry,
            )
            self.assertEqual(download_path, archive.resolve())
            store.mark_downloaded("record-1", downloaded_at=before_expiry)
            self.assertEqual(
                store.get_record("record-1", now=before_expiry)["download_count"],
                1,
            )

            after_expiry = created_at + timedelta(days=30, seconds=1)
            with self.assertRaises(ExportExpiredError):
                store.archive_for_download("record-1", now=after_expiry)
            expired = store.get_record("record-1", now=after_expiry)
            self.assertEqual(expired["status"], "expired")
            self.assertEqual(expired["download_url"], "")
            self.assertFalse(archive.exists())

    def test_missing_archive_is_marked_without_deleting_history(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            store = ExportRecordStore(root / "_system" / "exports.sqlite3", root)
            now = datetime.now(timezone.utc)
            store.create_record(
                record_id="record-2",
                description="缺失文件",
                owner_username="worker-b",
                owner_display_name="业务员乙",
                archive_name="missing.zip",
                archive_path="_image_exports/missing.zip",
                image_items=[("image-1", "1002")],
                archive_size_bytes=0,
                created_at=now,
            )

            with self.assertRaises(ValueError):
                store.archive_for_download("record-2", now=now)
            with sqlite3.connect(store.database_path) as connection:
                status = connection.execute(
                    "SELECT status FROM export_records WHERE id = 'record-2'"
                ).fetchone()[0]
            self.assertEqual(status, "missing")
            self.assertEqual(len(store.list_records(now=now)), 1)


if __name__ == "__main__":
    unittest.main()
