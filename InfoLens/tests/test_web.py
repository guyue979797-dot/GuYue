import importlib
import io
import json
import os
import tempfile
import time
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
        self.assertEqual(self.client.get("/api/distributions").status_code, 401)
        self.assertEqual(self.client.post("/api/batch-extract").status_code, 401)
        self.assertEqual(
            self.client.get("/api/batch-extract/unknown").status_code,
            401,
        )
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
        worksheet.append([link.replace("954187FD1234", "B453379C1234")])
        excel = io.BytesIO()
        workbook.save(excel)
        excel.seek(0)

        with self.client.session_transaction() as current_session:
            current_session["user"] = "team"
            current_session["csrf_token"] = "test-token"

        def fake_extract(_url, output_root):
            field = (
                "2045678901"
                if "B453379C1234" in _url
                else "1023275022"
            )
            output_dir = Path(output_root) / "测试终端_954187FD"
            output_dir.mkdir(parents=True, exist_ok=True)
            filename = f"{field}_测试终端_测试业务员_01.jpg"
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
                            f"{field}/source.jpeg"
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
            self.assertEqual(response.status_code, 202)
            started = response.get_json()
            self.assertEqual(started["status"], "queued")
            self.assertEqual(started["total"], 3)

            for _attempt in range(200):
                status_response = self.client.get(
                    f"/api/batch-extract/{started['job_id']}"
                )
                self.assertEqual(status_response.status_code, 200)
                job = status_response.get_json()
                if job["status"] in {"completed", "failed"}:
                    break
                time.sleep(0.01)
            else:
                self.fail("批量任务未在预期时间内完成")

        self.assertEqual(job["status"], "completed")
        self.assertEqual(job["processed"], 3)
        data = job["result"]
        self.assertEqual(extract_images.call_count, 3)
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["duplicate_count"], 1)
        self.assertEqual(data["succeeded"], 3)
        self.assertEqual(data["image_count"], 3)
        self.assertRegex(
            data["archive_name"],
            r"^\d{8}_测试业务员_2\.zip$",
        )
        self.assertEqual(
            data["field_rows"],
            [
                {"row": 2, "field": "1023275022"},
                {"row": 5, "field": "2045678901"},
            ],
        )
        archive_path = Path(self.output.name) / "_batches" / data["archive_name"]
        self.assertTrue(archive_path.is_file())
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
        self.assertIn("提取结果.json", names)
        self.assertIn("01_1023275022_测试终端/01.jpg", names)
        self.assertIn("01_1023275022_测试终端/02.jpg", names)
        self.assertIn("02_2045678901_测试终端/01.jpg", names)
        self.assertEqual(
            {
                name.rsplit("/", 1)[0]
                for name in names
                if name.endswith(".jpg")
            },
            {
                "01_1023275022_测试终端",
                "02_2045678901_测试终端",
            },
        )

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

    def test_distribution_summary_and_business_archive(self):
        output_dir = (
            Path(self.output.name)
            / "测试业务员"
            / "测试终端_VISIT001"
        )
        output_dir.mkdir(parents=True)
        photoid = (
            "private/TCOS/Z0019/O50002488/20260610/"
            "1023275022/source.jpeg"
        )
        filename = "1023275022_测试终端_测试业务员_01.jpeg"
        (output_dir / filename).write_bytes(b"image")
        (output_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "visit_id": "VISIT001",
                    "terminal_name": "测试终端",
                    "partner_name": "测试业务员",
                    "images": [
                        {
                            "photoid": photoid,
                            "filename": filename,
                            "size_bytes": 5,
                        }
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        job, _duplicate = self.web.DISTRIBUTION_STORE.enqueue(
            job_id="job-1",
            url=(
                "https://crm.example/visitDetail"
                "?appuser=u&id=VISIT001&process_type=p"
            ),
        )
        self.web.DISTRIBUTION_STORE.complete(
            job.id,
            ExtractResult(
                visit_id="VISIT001",
                terminal_name="测试终端",
                partner_name="测试业务员",
                output_dir=str(output_dir),
                images=[
                    SavedImage(
                        index=1,
                        photoid=photoid,
                        filename=filename,
                        url="",
                        size_bytes=5,
                    )
                ],
                metadata_file=str(output_dir / "metadata.json"),
            ),
        )

        with self.client.session_transaction() as current_session:
            current_session["user"] = "team"
            current_session["csrf_token"] = "test-token"

        summary = self.client.get("/api/distributions")
        self.assertEqual(summary.status_code, 200)
        item = summary.get_json()["items"][0]
        self.assertEqual(item["business"], "测试业务员")
        self.assertEqual(item["quantity"], 1)
        self.assertEqual(item["distributed_count"], 1)
        self.assertEqual(item["pending_download_count"], 1)

        missing_csrf = self.client.post(
            "/api/distributions/测试业务员/archive"
        )
        self.assertEqual(missing_csrf.status_code, 403)
        archive_response = self.client.post(
            "/api/distributions/测试业务员/archive",
            headers={"X-CSRF-Token": "test-token"},
        )
        self.assertEqual(archive_response.status_code, 200)
        archive_data = archive_response.get_json()
        archive_path = (
            Path(self.output.name)
            / "_distribution_downloads"
            / archive_data["archive_name"]
        )
        self.assertTrue(archive_path.is_file())
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
        self.assertIn("分发提取结果.json", names)
        self.assertIn(
            "01_1023275022_测试终端/01.jpeg",
            names,
        )
        refreshed = self.client.get("/api/distributions").get_json()
        self.assertEqual(
            refreshed["items"][0]["pending_download_count"],
            0,
        )


if __name__ == "__main__":
    unittest.main()
