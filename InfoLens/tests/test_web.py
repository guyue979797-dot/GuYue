import importlib
import io
import json
import os
import tempfile
import time
import unittest
import zipfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook
from werkzeug.security import generate_password_hash

from infolens.extractor import ExtractResult, SavedImage
from infolens.export_records import parse_utc_iso


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
        self.assertEqual(self.client.get("/api/extraction-records").status_code, 401)
        self.assertEqual(self.client.delete("/api/distributions").status_code, 401)
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
        self.assertEqual(session_data["role"], "admin")
        self.assertTrue(session_data["is_admin"])
        self.assertTrue(session_data["csrf_token"])

        missing_csrf = self.client.post("/api/extract", json={"url": "x"})
        self.assertEqual(missing_csrf.status_code, 403)

        empty_url = self.client.post(
            "/api/extract",
            json={"url": ""},
            headers={"X-CSRF-Token": session_data["csrf_token"]},
        )
        self.assertEqual(empty_url.status_code, 400)

    def test_admin_can_manage_users(self):
        good = self.client.post(
            "/login",
            data={"username": "team", "password": "correct horse"},
        )
        self.assertEqual(good.status_code, 302)
        session_data = self.client.get("/api/session").get_json()
        csrf_token = session_data["csrf_token"]

        users = self.client.get("/api/users")
        self.assertEqual(users.status_code, 200)
        initial_items = users.get_json()["items"]
        self.assertEqual(initial_items[0]["username"], "team")
        self.assertTrue(initial_items[0]["is_super_admin"])

        created = self.client.post(
            "/api/users",
            json={
                "username": "worker",
                "display_name": "普通用户",
                "password": "secret1",
                "role": "user",
                "status": "enabled",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(created.status_code, 201)
        worker = created.get_json()
        self.assertEqual(worker["username"], "worker")

        updated = self.client.patch(
            f"/api/users/{worker['id']}",
            json={
                "display_name": "普通用户2",
                "role": "admin",
                "status": "disabled",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(updated.status_code, 200)
        updated_data = updated.get_json()
        self.assertEqual(updated_data["role"], "admin")
        self.assertEqual(updated_data["status"], "disabled")

        forbidden_delete = self.client.delete(
            f"/api/users/{initial_items[0]['id']}",
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(forbidden_delete.status_code, 400)

        deleted = self.client.delete(
            f"/api/users/{worker['id']}",
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(deleted.status_code, 200)

    def test_single_extract_creates_success_and_failure_records(self):
        with self.client.session_transaction() as current_session:
            current_session["user"] = "team"
            current_session["display_name"] = "测试管理员"
            current_session["csrf_token"] = "test-token"

        output_dir = Path(self.output.name) / "单链接终端"
        output_dir.mkdir(parents=True, exist_ok=True)
        image_path = output_dir / "1000000001_单链接终端_业务员_01.jpg"
        image_path.write_bytes(b"image")
        result = ExtractResult(
            visit_id="SINGLE-VISIT-1",
            terminal_name="单链接终端",
            partner_name="业务员",
            output_dir=str(output_dir),
            images=[
                SavedImage(
                    index=1,
                    photoid=(
                        "private/TCOS/Z0019/O50002488/20260710/"
                        "1000000001/source.jpeg"
                    ),
                    filename=image_path.name,
                    url="",
                    size_bytes=5,
                )
            ],
            metadata_file=str(output_dir / "metadata.json"),
            visit_in_time="1783660800000",
        )
        with patch.object(
            self.web,
            "extract_images",
            return_value=result,
        ), patch.object(
            self.web.IMAGE_LIBRARY,
            "add_result",
            return_value=1,
        ):
            response = self.client.post(
                "/api/extract",
                json={"url": "https://crm.example/visit?id=1"},
                headers={"X-CSRF-Token": "test-token"},
            )
        self.assertEqual(response.status_code, 200)
        success = self.client.get("/api/extraction-records").get_json()["items"][0]
        self.assertEqual(success["owner_display_name"], "测试管理员")
        self.assertEqual(success["method"], "single_link")
        self.assertEqual(success["status"], "success")
        self.assertEqual(success["image_count"], 1)
        self.assertEqual(success["terminal_count"], 1)

        with patch.object(
            self.web,
            "extract_images",
            side_effect=self.web.CrmApiError(
                "接口失败 https://crm.example/visit?token=secret"
            ),
        ):
            failed_response = self.client.post(
                "/api/extract",
                json={"url": "https://crm.example/visit?id=2"},
                headers={"X-CSRF-Token": "test-token"},
            )
        self.assertEqual(failed_response.status_code, 400)
        failed = self.client.get("/api/extraction-records").get_json()["items"][0]
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["image_count"], 0)
        self.assertEqual(failed["terminal_count"], 0)
        self.assertNotIn("secret", failed["error_information"])
        self.assertIn("[链接已隐藏]", failed["error_information"])

    def test_user_management_requires_admin_role(self):
        with self.client.session_transaction() as current_session:
            current_session["user"] = "worker"
            current_session["role"] = "user"
            current_session["csrf_token"] = "test-token"

        self.assertEqual(self.client.get("/api/users").status_code, 403)

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
        worksheet.append(["https://example.com/not-a-crm-link"])
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
                visit_in_time="1782714405357",
            )

        with patch.object(
            self.web,
            "extract_images",
            side_effect=fake_extract,
        ) as extract_images, patch.object(
            self.web.IMAGE_LIBRARY,
            "add_result",
            side_effect=[1, 0, 1],
        ):
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
            self.assertEqual(started["input_count"], 5)
            self.assertEqual(started["duplicate_count"], 1)
            self.assertEqual(started["invalid_count"], 1)
            self.assertEqual(started["rejected_count"], 2)
            self.assertEqual(started["chunk_index"], 1)
            self.assertEqual(started["chunk_count"], 1)

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
        self.assertEqual(data["input_count"], 5)
        self.assertEqual(data["duplicate_count"], 1)
        self.assertEqual(data["invalid_count"], 1)
        self.assertEqual(data["rejected_count"], 2)
        self.assertEqual(data["retry_count"], 0)
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
        checkpoint = self.web._batch_checkpoint_path(started["job_id"])
        self.assertTrue(checkpoint.is_file())
        checkpoint_data = json.loads(checkpoint.read_text(encoding="utf-8"))
        self.assertEqual(checkpoint_data["status"], "completed")
        self.assertEqual(checkpoint_data["processed"], 3)
        extraction_record = self.client.get("/api/extraction-records").get_json()[
            "items"
        ][0]
        self.assertEqual(extraction_record["method"], "batch")
        self.assertEqual(extraction_record["status"], "partial_success")
        self.assertEqual(extraction_record["image_count"], 2)
        self.assertEqual(extraction_record["terminal_count"], 2)
        self.assertIn("无效链接 1 条", extraction_record["error_information"])

    def test_batch_excel_accepts_500_links_and_rejects_501(self):
        def build_excel(count):
            workbook = Workbook()
            worksheet = workbook.active
            worksheet.append(["链接"])
            for index in range(count):
                worksheet.append(
                    [
                        "https://crm.example/visitDetail"
                        f"?appuser=u&id={index:012d}&process_type=p"
                    ]
                )
            excel = io.BytesIO()
            workbook.save(excel)
            excel.seek(0)
            return excel

        with patch.object(self.web, "MAX_BATCH_LINKS", 500):
            links, stats = self.web._parse_excel_links(build_excel(500))
            self.assertEqual(len(links), 500)
            self.assertEqual(stats["input_count"], 500)
            with self.assertRaisesRegex(ValueError, "单次最多处理 500 条链接"):
                self.web._parse_excel_links(build_excel(501))

    def test_batch_link_retries_and_records_retry_count(self):
        image_path = Path(self.output.name) / "retry-image.jpg"
        image_path.write_bytes(b"image")
        job_id = "retry-job"
        now = time.time()
        self.web._register_batch_job(
            job_id,
            {
                "owner": "team",
                "status": "queued",
                "processed": 0,
                "total": 1,
                "succeeded": 0,
                "failed": 0,
                "image_count": 0,
                "retry_count": 0,
                "links": [[2, "https://crm.example/visitDetail?appuser=u&id=1&process_type=p"]],
                "completed_records": [],
                "errors": [],
                "input_count": 1,
                "duplicate_count": 0,
                "invalid_count": 0,
                "rejected_count": 0,
                "created_at": now,
                "updated_at": now,
            },
        )
        record = {
            "row": 2,
            "terminal_name": "重试终端",
            "partner_name": "测试业务员",
            "images": [{"field": "1000000001", "source": str(image_path)}],
        }
        with patch.object(self.web, "BATCH_LINK_ATTEMPTS", 2), patch.object(
            self.web,
            "_extract_batch_record",
            side_effect=[self.web.CrmApiError("临时失败"), record],
        ) as extract_record:
            should_continue = self.web._run_batch_job_chunk(self.web.app, job_id)

        self.assertFalse(should_continue)
        self.assertEqual(extract_record.call_count, 2)
        job = self.web.BATCH_JOBS[job_id]
        self.assertEqual(job["status"], "completed")
        self.assertEqual(job["retry_count"], 1)
        self.assertEqual(job["result"]["retry_count"], 1)

    def test_system_checkpoints_are_not_downloadable(self):
        with self.client.session_transaction() as current_session:
            current_session["user"] = "team"
        response = self.client.get("/output/_system/batch_jobs/private.json")
        self.assertEqual(response.status_code, 404)

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
        record = self.client.get("/api/extraction-records").get_json()["items"][0]
        self.assertEqual(record["status"], "failed")
        self.assertIn("字段名为“链接”", record["error_information"])

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
        self.assertEqual(item["field_values"], ["1023275022"])
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

        missing_clear_csrf = self.client.delete("/api/distributions")
        self.assertEqual(missing_clear_csrf.status_code, 403)
        clear_response = self.client.delete(
            "/api/distributions",
            headers={"X-CSRF-Token": "test-token"},
        )
        self.assertEqual(clear_response.status_code, 200)
        self.assertEqual(clear_response.get_json()["deleted_count"], 1)
        self.assertEqual(
            self.client.get("/api/distributions").get_json()["items"],
            [],
        )

    def test_image_library_search_delete_and_export(self):
        output_dir = Path(self.output.name) / "测试终端_VISITLIB"
        output_dir.mkdir(parents=True)
        photoid = (
            "private/TCOS/Z0019/O50002488/20260610/"
            "1023275022/source.jpeg"
        )
        filename = "1023275022_测试终端_测试业务员_01.jpeg"
        (output_dir / filename).write_bytes(b"image")
        self.web.IMAGE_LIBRARY.add_result(
            ExtractResult(
                visit_id="VISITLIB",
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
                visit_in_time="1782714405357",
            ),
            created_at="2026-07-07T09:00:00",
        )

        with self.client.session_transaction() as current_session:
            current_session["user"] = "team"
            current_session["csrf_token"] = "test-token"

        search = self.client.post(
            "/api/image-library/search",
            json={"fields": "1023275022\n9999999999", "month": "2026-06"},
        )
        self.assertEqual(search.status_code, 200)
        data = search.get_json()
        self.assertEqual(data["field_count"], 1)
        self.assertEqual(data["image_count"], 1)
        self.assertEqual(data["missing_fields"], ["9999999999"])
        self.assertEqual(data["pagination"]["page"], 1)
        self.assertEqual(data["pagination"]["total_groups"], 1)
        image_data = data["items"][0]["images"][0]
        image_id = image_data["id"]
        thumbnail = self.client.get(image_data["thumbnail_url"])
        self.assertEqual(thumbnail.status_code, 200)
        self.assertIn("private", thumbnail.headers["Cache-Control"])
        self.assertIn("immutable", thumbnail.headers["Cache-Control"])
        thumbnail.close()

        with patch.object(self.web, "X_ACCEL_ENABLED", True):
            accelerated_thumbnail = self.client.get(image_data["thumbnail_url"])
            self.assertEqual(accelerated_thumbnail.status_code, 200)
            self.assertTrue(
                accelerated_thumbnail.headers["X-Accel-Redirect"].startswith(
                    "/_protected_media/"
                )
            )
            self.assertEqual(
                accelerated_thumbnail.headers["X-Accel-Expires"],
                str(self.web.IMAGE_CACHE_SECONDS),
            )
            self.assertEqual(accelerated_thumbnail.get_data(), b"")

            accelerated_original = self.client.get(image_data["url"])
            self.assertEqual(accelerated_original.status_code, 200)
            self.assertTrue(
                accelerated_original.headers["X-Accel-Redirect"].startswith(
                    "/_protected_media/_image_library/"
                )
            )
            self.assertIn("private", accelerated_original.headers["Cache-Control"])

        bad_pagination = self.client.get("/api/image-library?page=invalid")
        self.assertEqual(bad_pagination.status_code, 400)

        missing_csrf = self.client.post(
            "/api/image-library/export",
            json={"image_ids": [image_id], "description": "月度照片"},
        )
        self.assertEqual(missing_csrf.status_code, 403)
        preview = self.client.post(
            "/api/image-library/export-preview",
            json={"image_ids": [image_id]},
            headers={"X-CSRF-Token": "test-token"},
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.get_json()["image_count"], 1)
        self.assertEqual(preview.get_json()["fields"], ["1023275022"])

        missing_description = self.client.post(
            "/api/export-records",
            json={"image_ids": [image_id]},
            headers={"X-CSRF-Token": "test-token"},
        )
        self.assertEqual(missing_description.status_code, 400)
        long_description = self.client.post(
            "/api/export-records",
            json={"image_ids": [image_id], "description": "超" * 31},
            headers={"X-CSRF-Token": "test-token"},
        )
        self.assertEqual(long_description.status_code, 400)

        export = self.client.post(
            "/api/export-records",
            json={"image_ids": [image_id], "description": "月度照片"},
            headers={"X-CSRF-Token": "test-token"},
        )
        self.assertEqual(export.status_code, 200)
        export_data = export.get_json()
        self.assertEqual(export_data["description"], "月度照片")
        self.assertEqual(export_data["fields"], ["1023275022"])
        self.assertEqual(export_data["download_count"], 0)
        archive_path = (
            Path(self.output.name) / "_image_exports" / export_data["archive_name"]
        )
        self.assertTrue(archive_path.is_file())
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
        self.assertIn("图片库导出结果.json", names)
        self.assertIn("1023275022_测试终端_测试业务员/01.jpeg", names)

        records = self.client.get("/api/export-records")
        self.assertEqual(records.status_code, 200)
        self.assertEqual(len(records.get_json()["items"]), 1)

        first_download = self.client.get(export_data["download_url"])
        second_download = self.client.get(export_data["download_url"])
        self.assertEqual(first_download.status_code, 200)
        self.assertEqual(second_download.status_code, 200)
        first_download.close()
        second_download.close()
        self.assertEqual(
            self.client.get("/api/export-records").get_json()["items"][0][
                "download_count"
            ],
            2,
        )
        self.assertEqual(
            self.client.get(f"/output/_image_exports/{export_data['archive_name']}").status_code,
            404,
        )

        self.web.EXPORT_RECORD_STORE.expire_records(
            now=parse_utc_iso(export_data["created_at"]) + timedelta(days=31)
        )
        expired_record = self.client.get("/api/export-records").get_json()["items"][0]
        self.assertEqual(expired_record["status"], "expired")
        self.assertEqual(expired_record["download_url"], "")
        self.assertFalse(archive_path.exists())
        self.assertEqual(self.client.get(export_data["download_url"]).status_code, 410)

        refreshed = self.client.get(
            "/api/image-library?fields=1023275022&month=2026-06"
        ).get_json()
        self.assertEqual(refreshed["image_count"], 1)


if __name__ == "__main__":
    unittest.main()
