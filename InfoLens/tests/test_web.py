import importlib
import io
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook
from werkzeug.security import generate_password_hash

from infolens.extractor import ExtractResult, SavedImage


class WebSecurityTests(unittest.TestCase):
    def setUp(self):
        self.output = tempfile.TemporaryDirectory()
        self.environment = patch.dict(
            os.environ,
            {
                "INFOLENS_AUTH_MODE": "password",
                "INFOLENS_ENV": "production",
                "INFOLENS_OUTPUT_ROOT": self.output.name,
                "INFOLENS_USERNAME": "team",
                "INFOLENS_PASSWORD_HASH": generate_password_hash(
                    "correct horse",
                    method="pbkdf2:sha256",
                ),
                "INFOLENS_SESSION_SECRET": "a" * 64,
            },
            clear=False,
        )
        self.environment.start()
        import web

        self.web = importlib.reload(web)
        self.client = self.web.app.test_client()

    def tearDown(self):
        self.environment.stop()
        self.output.cleanup()

    def test_protected_routes_require_login(self):
        self.assertEqual(self.client.get("/").status_code, 302)
        self.assertEqual(self.client.get("/api/results").status_code, 401)
        self.assertEqual(self.client.post("/api/batch-extract").status_code, 401)
        self.assertEqual(self.client.get("/output/private.jpg").status_code, 401)
        self.assertEqual(self.client.get("/healthz").status_code, 200)

    def test_login_session_and_csrf(self):
        bad = self.client.post(
            "/login",
            data={"username": "team", "password": "wrong"},
        )
        self.assertIn("账号或密码不正确", bad.get_data(as_text=True))

        good = self.client.post(
            "/login",
            data={"username": "team", "password": "correct horse"},
        )
        self.assertEqual(good.status_code, 302)

        session_response = self.client.get("/api/session")
        session_data = session_response.get_json()
        self.assertEqual(session_data["user"], "team")
        self.assertTrue(session_data["csrf_token"])

        missing_csrf = self.client.post("/api/extract", json={"url": "x"})
        self.assertEqual(missing_csrf.status_code, 403)

        empty_url = self.client.post(
            "/api/extract",
            json={"url": ""},
            headers={"X-CSRF-Token": session_data["csrf_token"]},
        )
        self.assertEqual(empty_url.status_code, 400)

    def test_security_headers(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("default-src 'self'", response.headers["Content-Security-Policy"])

    def test_batch_extract_builds_downloadable_zip(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["链接"])
        link = (
            "https://crm.example/visitDetail"
            "?appuser=u&id=954187FD1234&process_type=p"
        )
        worksheet.append([link])
        worksheet.append([link])
        worksheet.append([link.replace("954187FD1234", "A343379C1234")])
        excel = io.BytesIO()
        workbook.save(excel)
        excel.seek(0)

        with self.client.session_transaction() as current_session:
            current_session["user"] = "team"
            current_session["csrf_token"] = "test-token"

        def fake_extract(_url, output_root):
            output_dir = Path(output_root) / "测试终端_954187FD"
            output_dir.mkdir(parents=True, exist_ok=True)
            filename = "1023275022_测试终端_测试业务员_01.jpg"
            (output_dir / filename).write_bytes(b"image")
            return ExtractResult(
                visit_id="954187FD1234",
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
            )

        with patch.object(
            self.web,
            "extract_images",
            side_effect=fake_extract,
        ) as extract_images:
            response = self.client.post(
                "/api/batch-extract",
                data={"file": (excel, "links.xlsx")},
                headers={"X-CSRF-Token": "test-token"},
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(extract_images.call_count, 2)
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["duplicate_count"], 1)
        self.assertEqual(data["succeeded"], 2)
        self.assertEqual(data["image_count"], 2)
        self.assertEqual(
            data["field_rows"],
            [{"row": 2, "field": "1023275022"}],
        )
        archive_path = Path(self.output.name) / "_batches" / data["archive_name"]
        self.assertTrue(archive_path.is_file())
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
        self.assertIn("提取结果.json", names)
        self.assertTrue(any(name.endswith("_01.jpg") for name in names))

    def test_batch_extract_rejects_wrong_header(self):
        workbook = Workbook()
        workbook.active.append(["网址"])
        workbook.active.append(["https://example.com"])
        excel = io.BytesIO()
        workbook.save(excel)
        excel.seek(0)

        with self.client.session_transaction() as current_session:
            current_session["user"] = "team"
            current_session["csrf_token"] = "test-token"
        response = self.client.post(
            "/api/batch-extract",
            data={"file": (excel, "links.xlsx")},
            headers={"X-CSRF-Token": "test-token"},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("字段名为“链接”", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
