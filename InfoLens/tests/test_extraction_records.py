import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from infolens.extraction_records import ExtractionRecordStore


class ExtractionRecordStoreTests(unittest.TestCase):
    def test_record_lifecycle_and_30_day_retention(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = ExtractionRecordStore(
                Path(temporary) / "_system" / "extraction_records.sqlite3"
            )
            created_at = datetime(2026, 7, 1, 3, 0, tzinfo=timezone.utc)
            record = store.start_record(
                record_id="record-1",
                owner_username="worker",
                owner_display_name="业务员",
                method="batch",
                created_at=created_at,
            )
            self.assertEqual(record["status"], "processing")
            self.assertEqual(record["method"], "batch")

            completed = store.complete_record(
                "record-1",
                status="partial_success",
                image_count=68,
                terminal_count=22,
                error_information="第 4 行：链接无效",
                completed_at=created_at + timedelta(minutes=2),
            )
            self.assertEqual(completed["image_count"], 68)
            self.assertEqual(completed["terminal_count"], 22)
            self.assertEqual(completed["error_information"], "第 4 行：链接无效")
            self.assertEqual(
                len(store.list_records(now=created_at + timedelta(days=29))),
                1,
            )
            self.assertEqual(
                len(
                    store.list_records(
                        now=created_at + timedelta(days=30, seconds=1)
                    )
                ),
                0,
            )

    def test_rejects_invalid_method_and_status(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = ExtractionRecordStore(Path(temporary) / "records.sqlite3")
            with self.assertRaisesRegex(ValueError, "新增方式无效"):
                store.start_record(
                    record_id="record-2",
                    owner_username="worker",
                    owner_display_name="业务员",
                    method="unknown",
                )
            store.start_record(
                record_id="record-3",
                owner_username="worker",
                owner_display_name="业务员",
                method="single_link",
            )
            with self.assertRaisesRegex(ValueError, "新增记录状态无效"):
                store.complete_record("record-3", status="unknown")


if __name__ == "__main__":
    unittest.main()
