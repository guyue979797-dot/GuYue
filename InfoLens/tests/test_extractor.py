import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from infolens.extractor import (
    _download,
    build_image_filename,
    extract_images,
    parse_visit_url,
    photoid_name_field,
)


PRIVATE_PHOTOID = (
    "private/TCOS/Z0019/O50002488/20260610/1023275022/"
    "Z0019O500024882026061014225113010232750220.jpeg?signature=test"
)
NEW_TERMINAL_PHOTOID = (
    "private/TCOS/Z0019/O50002488/20260610/newterminal/"
    "Z0019O500024882026061014225113010000000000.jpeg"
)
WORK_CIRCLE_URL = (
    "https://crm.crb.cn/page/#/workCirclevisit"
    "?appuser=21483291&id=A343379C0B5443FFAE8E59FA7909C1C2"
)


class ExtractorTests(unittest.TestCase):
    def test_download_retries_connection_reset(self):
        class FakeResponse(io.BytesIO):
            headers = {"Content-Type": "image/jpeg"}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        reset = urllib.error.URLError(
            ConnectionResetError(54, "Connection reset by peer")
        )
        with tempfile.TemporaryDirectory() as output:
            destination = Path(output) / "image.tmp"
            with patch(
                "infolens.extractor.urllib.request.urlopen",
                side_effect=[reset, FakeResponse(b"retried image")],
            ) as urlopen, patch("infolens.extractor.time.sleep") as sleep:
                size, content_type = _download("https://image.example/a.jpg", destination)

            self.assertEqual(urlopen.call_count, 2)
            sleep.assert_called_once()
            self.assertEqual(size, 13)
            self.assertEqual(content_type, "image/jpeg")
            self.assertEqual(destination.read_bytes(), b"retried image")

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

    def test_parses_work_circle_visit_without_process_type(self):
        parsed = parse_visit_url(WORK_CIRCLE_URL)
        self.assertEqual(parsed["page_type"], "workcirclevisit")
        self.assertEqual(parsed["appuser"], "21483291")
        self.assertEqual(parsed["id"], "A343379C0B5443FFAE8E59FA7909C1C2")
        self.assertEqual(parsed["process_type"], "")

    def test_extracts_only_private_photos_and_renames_them(self):
        detail = {
            "terminal_name": "拾蕙莱智能便利店（金茂）",
            "partner_name": " 韦春云",
            "photo_info": [
                {"photoid": "TCOS/Z0003/O50002488/20250325/1023275022/old.jpeg"},
                {"photoid": NEW_TERMINAL_PHOTOID},
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
            self.assertEqual(result.images[0].index, 1)
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

    def test_work_circle_visit_uses_its_own_detail_api(self):
        detail = {
            "terminal_name": "工作圈终端",
            "partner_name": "测试业务员",
            "photo_info": [{"photoid": PRIVATE_PHOTOID}],
        }

        def fake_download(_url, destination, timeout=60):
            destination.write_bytes(b"fake jpeg")
            return 9, "image/jpeg"

        with tempfile.TemporaryDirectory() as output:
            with patch(
                "infolens.extractor.get_work_circle_detail",
                return_value=detail,
            ) as get_work_circle, patch(
                "infolens.extractor.get_visit_detail"
            ) as get_visit, patch(
                "infolens.extractor.resolve_photo_url",
                return_value="https://image",
            ), patch(
                "infolens.extractor._download",
                side_effect=fake_download,
            ):
                result = extract_images(WORK_CIRCLE_URL, output)

        get_work_circle.assert_called_once_with(
            "21483291",
            "A343379C0B5443FFAE8E59FA7909C1C2",
        )
        get_visit.assert_not_called()
        self.assertEqual(len(result.images), 1)


if __name__ == "__main__":
    unittest.main()
