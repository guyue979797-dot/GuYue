import tempfile
import unittest
from pathlib import Path

from infolens.distribution import DistributionStore
from infolens.extractor import ExtractResult, SavedImage


def visit_link(visit_id: str) -> str:
    return (
        "https://crm.example/visitDetail"
        f"?appuser=u&id={visit_id}&process_type=p"
    )


def result(
    output: Path,
    visit_id: str,
    fields: list[str],
) -> ExtractResult:
    output.mkdir(parents=True, exist_ok=True)
    return ExtractResult(
        visit_id=visit_id,
        terminal_name="测试终端",
        partner_name="测试业务员",
        output_dir=str(output),
        images=[
            SavedImage(
                index=index,
                photoid=(
                    "private/TCOS/Z0019/O50002488/20260610/"
                    f"{field}/source-{index}.jpeg"
                ),
                filename=f"{field}_{index}.jpeg",
                url="",
                size_bytes=5,
            )
            for index, field in enumerate(fields, start=1)
        ],
        metadata_file=str(output / "metadata.json"),
    )


class DistributionStoreTests(unittest.TestCase):
    def test_summarizes_unique_fields_and_download_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            store = DistributionStore(root / "jobs.sqlite3")
            first, duplicate = store.enqueue(
                job_id="job-1",
                url=visit_link("VISIT001"),
            )
            self.assertFalse(duplicate)
            store.complete(
                first.id,
                result(root / "one", "VISIT001", ["1001", "1001", "1002"]),
            )

            second, duplicate = store.enqueue(
                job_id="job-2",
                url=visit_link("VISIT002"),
            )
            self.assertFalse(duplicate)
            store.complete(
                second.id,
                result(root / "two", "VISIT002", ["1002", "1003"]),
            )

            summary = store.summaries()[0]
            self.assertEqual(summary["quantity"], 3)
            self.assertEqual(
                summary["field_values"],
                ["1001", "1002", "1003"],
            )
            self.assertEqual(summary["distributed_count"], 2)
            self.assertEqual(summary["pending_download_count"], 3)
            self.assertEqual(summary["image_count"], 5)

            store.mark_downloaded("测试业务员")
            self.assertEqual(
                store.summaries()[0]["pending_download_count"],
                0,
            )

    def test_deduplicates_visit_and_allows_failed_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = DistributionStore(Path(temporary) / "jobs.sqlite3")
            first, duplicate = store.enqueue(
                job_id="job-1",
                url=visit_link("VISIT001"),
            )
            self.assertFalse(duplicate)
            _same, duplicate = store.enqueue(
                job_id="job-2",
                url=visit_link("VISIT001"),
            )
            self.assertTrue(duplicate)

            store.fail(first.id, "network")
            retried, duplicate = store.enqueue(
                job_id="job-3",
                url=visit_link("VISIT001"),
            )
            self.assertFalse(duplicate)
            self.assertEqual(retried.status, "queued")

    def test_clears_all_distribution_jobs(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = DistributionStore(Path(temporary) / "jobs.sqlite3")
            store.enqueue(job_id="job-1", url=visit_link("VISIT001"))
            store.enqueue(job_id="job-2", url=visit_link("VISIT002"))

            self.assertEqual(store.clear_all(), 2)
            self.assertEqual(store.summaries(), [])

            _job, duplicate = store.enqueue(
                job_id="job-3",
                url=visit_link("VISIT001"),
            )
            self.assertFalse(duplicate)


if __name__ == "__main__":
    unittest.main()
