import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image

from infolens.extractor import ExtractResult, SavedImage
from infolens.image_library import ImageLibraryStore


class ImageLibraryStoreTests(unittest.TestCase):
    def test_add_query_and_export_images(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output_dir = root / "测试终端_VISIT001"
            output_dir.mkdir()
            filename = "1023275022_测试终端_测试业务员_01.jpg"
            (output_dir / filename).write_bytes(b"image")
            store = ImageLibraryStore(
                root / "_system" / "image_library.sqlite3",
                root,
            )

            added = store.add_result(
                ExtractResult(
                    visit_id="VISIT001",
                    terminal_name="测试终端",
                    partner_name="测试业务员",
                    output_dir=str(output_dir),
                    images=[
                        SavedImage(
                            index=1,
                            photoid=(
                                "private/TCOS/Z0019/O50002488/20260610/"
                                "1023275022/source.jpeg"
                            ),
                            filename=filename,
                            url="",
                            size_bytes=5,
                        )
                    ],
                    metadata_file=str(output_dir / "metadata.json"),
                    visit_in_time="2026-06-30 20:21:43",
                ),
                source_url="https://crm.example/visitDetail?id=VISIT001",
                created_at="2026-07-07T09:00:00",
            )

            self.assertEqual(added, 1)
            duplicate = store.add_result(
                ExtractResult(
                    visit_id="VISIT001",
                    terminal_name="测试终端",
                    partner_name="测试业务员",
                    output_dir=str(output_dir),
                    images=[
                        SavedImage(
                            index=1,
                            photoid=(
                                "private/TCOS/Z0019/O50002488/20260610/"
                                "1023275022/source.jpeg"
                            ),
                            filename=filename,
                            url="",
                            size_bytes=5,
                        )
                    ],
                    metadata_file=str(output_dir / "metadata.json"),
                    visit_in_time="2026-06-30 20:21:43",
                ),
                created_at="2026-07-07T09:00:00",
            )
            self.assertEqual(duplicate, 0)

            self.assertEqual(store.query(month="2026-07")["image_count"], 0)
            payload = store.query(fields=["1023275022"], month="2026-06")
            self.assertEqual(payload["field_count"], 1)
            self.assertEqual(payload["image_count"], 1)
            self.assertEqual(payload["missing_fields"], [])
            group = payload["items"][0]
            self.assertEqual(group["business"], "测试业务员")
            self.assertEqual(group["customer_name"], "测试终端")
            image = group["images"][0]
            self.assertIn("/thumbnail", image["thumbnail_url"])
            self.assertTrue((root / image["url"].removeprefix("/output/")).is_file())

            images = store.get_images([image["id"]])
            self.assertEqual(len(images), 1)
            self.assertEqual(images[0].field, "1023275022")

    def test_visit_in_time_milliseconds_define_month(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output_dir = root / "测试终端_VISIT002"
            output_dir.mkdir()
            filename = "1023275022_测试终端_测试业务员_01.jpg"
            (output_dir / filename).write_bytes(b"image")
            store = ImageLibraryStore(
                root / "_system" / "image_library.sqlite3",
                root,
            )

            store.add_result(
                ExtractResult(
                    visit_id="VISIT002",
                    terminal_name="测试终端",
                    partner_name="测试业务员",
                    output_dir=str(output_dir),
                    images=[
                        SavedImage(
                            index=1,
                            photoid=(
                                "private/TCOS/Z0019/O50002488/20260610/"
                                "1023275022/source.jpeg"
                            ),
                            filename=filename,
                            url="",
                            size_bytes=5,
                        )
                    ],
                    metadata_file=str(output_dir / "metadata.json"),
                    visit_in_time="1782714405357 ",
                ),
                created_at="2026-07-11T15:40:29",
            )

            self.assertEqual(store.query(month="2026-06")["image_count"], 1)
            self.assertEqual(store.query(month="2026-07")["image_count"], 0)

    def test_paginates_terminal_groups_and_builds_thumbnails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            store = ImageLibraryStore(
                root / "_system" / "image_library.sqlite3",
                root,
            )
            for index in range(3):
                field = f"100000000{index}"
                output_dir = root / f"测试终端{index}_VISIT{index}"
                output_dir.mkdir()
                filename = f"{field}_测试终端{index}_测试业务员_01.jpg"
                Image.new("RGB", (1200, 1600), (40 * index, 80, 160)).save(
                    output_dir / filename,
                    format="JPEG",
                )
                store.add_result(
                    ExtractResult(
                        visit_id=f"VISIT{index}",
                        terminal_name=f"测试终端{index}",
                        partner_name="测试业务员",
                        output_dir=str(output_dir),
                        images=[
                            SavedImage(
                                index=1,
                                photoid=(
                                    "private/TCOS/Z0019/O50002488/20260610/"
                                    f"{field}/source.jpeg"
                                ),
                                filename=filename,
                                url="",
                                size_bytes=(output_dir / filename).stat().st_size,
                            )
                        ],
                        metadata_file=str(output_dir / "metadata.json"),
                        visit_in_time="2026-06-30 20:21:43",
                    )
                )

            first_page = store.query(month="2026-06", page=1, page_size=2)
            self.assertEqual(first_page["image_count"], 3)
            self.assertEqual(first_page["page_image_count"], 2)
            self.assertEqual(len(first_page["items"]), 2)
            self.assertEqual(first_page["pagination"]["total_groups"], 3)
            self.assertEqual(first_page["pagination"]["total_pages"], 2)
            self.assertTrue(first_page["pagination"]["has_next"])

            second_page = store.query(month="2026-06", page=2, page_size=2)
            self.assertEqual(second_page["page_image_count"], 1)
            self.assertEqual(len(second_page["items"]), 1)
            self.assertTrue(second_page["pagination"]["has_previous"])
            self.assertFalse(second_page["pagination"]["has_next"])

            image_id = first_page["items"][0]["images"][0]["id"]
            thumbnail = store.thumbnail_for(image_id)
            self.assertIsNotNone(thumbnail)
            self.assertEqual(thumbnail.suffix, ".webp")
            with Image.open(thumbnail) as generated:
                self.assertLessEqual(generated.width, 480)
                self.assertLessEqual(generated.height, 640)

            thumbnail.unlink()
            maintenance = store.ensure_thumbnails()
            self.assertEqual(maintenance["scanned"], 3)
            self.assertEqual(maintenance["generated"], 1)
            self.assertEqual(maintenance["current"], 2)
            self.assertTrue(thumbnail.is_file())

    def test_missing_visit_in_time_does_not_fallback_to_created_at(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output_dir = root / "测试终端_VISIT003"
            output_dir.mkdir()
            filename = "1023275022_测试终端_测试业务员_01.jpg"
            (output_dir / filename).write_bytes(b"image")
            store = ImageLibraryStore(
                root / "_system" / "image_library.sqlite3",
                root,
            )

            with self.assertRaises(ValueError):
                store.add_result(
                    ExtractResult(
                        visit_id="VISIT003",
                        terminal_name="测试终端",
                        partner_name="测试业务员",
                        output_dir=str(output_dir),
                        images=[
                            SavedImage(
                                index=1,
                                photoid=(
                                    "private/TCOS/Z0019/O50002488/20260610/"
                                    "1023275022/source.jpeg"
                                ),
                                filename=filename,
                                url="",
                                size_bytes=5,
                            )
                        ],
                        metadata_file=str(output_dir / "metadata.json"),
                    ),
                    created_at="2026-07-11T15:40:29",
                )

            self.assertEqual(store.query(month="2026-07")["image_count"], 0)


if __name__ == "__main__":
    unittest.main()
