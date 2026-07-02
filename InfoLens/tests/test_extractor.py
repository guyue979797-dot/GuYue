import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from infolens.extractor import (
    build_image_filename,
    extract_images,
    photoid_name_field,
)


PRIVATE_PHOTOID = (
    "private/TCOS/Z0019/O50002488/20260610/1023275022/"
    "Z0019O500024882026061014225113010232750220.jpeg?signature=test"
)


class ExtractorTests(unittest.TestCase):
    def test_photoid_name_field(self):
        self.assertEqual(photoid_name_field(PRIVATE_PHOTOID), "1023275022")

    def test_build_image_filename(self):
        self.assertEqual(
            build_image_filename(
                PRIVATE_PHOTOID,
                "拾蕙莱智能便利店（金茂）",
                " 韦春云",
                1,
                ".jpeg",
            ),
            "1023275022_拾蕙莱智能便利店（金茂）_韦春云_01.jpeg",
        )

    def test_extracts_only_private_photos_and_renames_them(self):
        detail = {
            "terminal_name": "拾蕙莱智能便利店（金茂）",
            "partner_name": " 韦春云",
            "photo_info": [
                {"photoid": "TCOS/Z0003/O50002488/20250325/1023275022/old.jpeg"},
                {"photoid": PRIVATE_PHOTOID},
            ],
        }

        def fake_download(_url, destination, timeout=60):
            destination.write_bytes(b"fake jpeg")
            return 9, "image/jpeg"

        with tempfile.TemporaryDirectory() as output:
            with patch(
                "infolens.extractor.get_visit_detail", return_value=detail
            ), patch(
                "infolens.extractor.resolve_photo_url", return_value="https://image"
            ), patch(
                "infolens.extractor._download", side_effect=fake_download
            ):
                result = extract_images(
                    "https://crm.example/visitDetail"
                    "?appuser=u&id=954187FD1234&process_type=p",
                    output,
                )

            self.assertEqual(len(result.images), 1)
            self.assertEqual(
                result.images[0].filename,
                "1023275022_拾蕙莱智能便利店（金茂）_韦春云_01.jpeg",
            )
            self.assertTrue(
                (Path(result.output_dir) / result.images[0].filename).is_file()
            )
            metadata = json.loads(Path(result.metadata_file).read_text(encoding="utf-8"))
            self.assertEqual(len(metadata["images"]), 1)
            self.assertTrue(metadata["images"][0]["photoid"].startswith("private"))
            self.assertNotIn("source_url", metadata)
            self.assertNotIn("appuser", metadata)
            self.assertNotIn("?", metadata["images"][0]["photoid"])
            self.assertEqual(metadata["images"][0]["url"], "")


if __name__ == "__main__":
    unittest.main()
