#!/usr/bin/env python3
"""InfoLens Web 应用。

本地开发:
    INFOLENS_AUTH_MODE=off python web.py

生产环境:
    gunicorn --bind 0.0.0.0:8000 --workers 1 --threads 8 web:app
"""

from __future__ import annotations

import hmac
import io
import json
import mimetypes
import os
import queue
import re
import secrets
import threading
import time
import urllib.parse
import zipfile
from collections import defaultdict, deque
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Callable

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from flask import (
    Flask,
    Response,
    abort,
    jsonify,
    redirect,
    request,
    send_file,
    send_from_directory,
    session,
    url_for,
)
from authlib.integrations.flask_client import OAuth
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash

from infolens.crm_client import CrmApiError
from infolens.distribution import DistributionStore
from infolens.export_records import (
    ExportArchiveMissingError,
    ExportExpiredError,
    ExportRecordError,
    ExportRecordStore,
    to_utc_iso,
)
from infolens.extractor import (
    ExtractResult,
    build_image_filename,
    extract_images,
    parse_visit_url,
    photoid_name_field,
)
from infolens.image_library import ImageLibraryStore, LibraryImage
from infolens.users import UserStore
from infolens.wecom_bot import (
    MessageDeduplicator,
    WecomBotCrypto,
    WecomBotError,
    extract_crm_urls,
    message_text,
    send_response_url,
    stream_reply,
    text_reply,
    validate_callback_timestamp,
)


ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
OUTPUT_ROOT = Path(os.environ.get("INFOLENS_OUTPUT_ROOT", ROOT / "output")).resolve()
AUTH_MODE = os.environ.get("INFOLENS_AUTH_MODE", "off").strip().lower()
EXTRACT_LOCK = threading.Lock()
RATE_LOCK = threading.Lock()
RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
BATCH_JOBS_LOCK = threading.Lock()
BATCH_JOBS: dict[str, dict] = {}
BATCH_QUEUE: queue.Queue[str] = queue.Queue()
BATCH_WORKER_LOCK = threading.Lock()
BATCH_WORKER_STARTED = False
BATCH_JOB_TTL_SECONDS = 6 * 60 * 60
MAX_BATCH_LINKS = int(os.environ.get("INFOLENS_MAX_BATCH_LINKS", "500"))
BATCH_CHUNK_SIZE = max(1, int(os.environ.get("INFOLENS_BATCH_CHUNK_SIZE", "50")))
BATCH_LINK_ATTEMPTS = max(1, int(os.environ.get("INFOLENS_BATCH_LINK_ATTEMPTS", "3")))
MAX_UPLOAD_BYTES = int(os.environ.get("INFOLENS_MAX_UPLOAD_BYTES", str(4 * 1024 * 1024)))
IMAGE_LIBRARY_PAGE_SIZE = max(
    1,
    min(50, int(os.environ.get("INFOLENS_IMAGE_LIBRARY_PAGE_SIZE", "12"))),
)
IMAGE_CACHE_SECONDS = 30 * 24 * 60 * 60
X_ACCEL_ENABLED = os.environ.get("INFOLENS_X_ACCEL_ENABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
X_ACCEL_PREFIX = "/_protected_media"
WECOM_BOT_ENABLED = os.environ.get("WECOM_BOT_ENABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
WECOM_BOT_MODE = os.environ.get("WECOM_BOT_MODE", "callback").strip().lower()
WECOM_BOT_CALLBACK_ENABLED = WECOM_BOT_ENABLED and WECOM_BOT_MODE == "callback"
WECOM_BOT_MAX_LINKS = int(os.environ.get("WECOM_BOT_MAX_LINKS", "10"))
WECOM_DEDUPLICATOR = MessageDeduplicator()
DISTRIBUTION_STORE = DistributionStore(
    OUTPUT_ROOT / "_system" / "distributions.sqlite3"
)
IMAGE_LIBRARY = ImageLibraryStore(
    OUTPUT_ROOT / "_system" / "image_library.sqlite3",
    OUTPUT_ROOT,
)
USER_STORE = UserStore(OUTPUT_ROOT / "_system" / "users.sqlite3")
EXPORT_RECORD_STORE = ExportRecordStore(
    OUTPUT_ROOT / "_system" / "export_records.sqlite3",
    OUTPUT_ROOT,
)


def _require_production_config() -> None:
    if AUTH_MODE not in {"off", "password", "oidc", "proxy"}:
        raise RuntimeError("INFOLENS_AUTH_MODE 必须为 off、password、oidc 或 proxy")
    if os.environ.get("INFOLENS_ENV") == "production" and AUTH_MODE == "off":
        raise RuntimeError("生产环境禁止关闭鉴权")
    if AUTH_MODE == "password":
        has_super_admin_secret = bool(
            os.environ.get("INFOLENS_SUPER_ADMIN_PASSWORD_HASH")
            or os.environ.get("INFOLENS_SUPER_ADMIN_PASSWORD")
            or (
                os.environ.get("INFOLENS_USERNAME")
                and os.environ.get("INFOLENS_PASSWORD_HASH")
            )
        )
        required = ("INFOLENS_SESSION_SECRET",)
        missing = [name for name in required if not os.environ.get(name)]
        if not has_super_admin_secret:
            missing.append("INFOLENS_SUPER_ADMIN_PASSWORD_HASH")
        if missing:
            raise RuntimeError(f"密码登录缺少环境变量: {', '.join(missing)}")
    if AUTH_MODE == "oidc":
        required = (
            "INFOLENS_OIDC_METADATA_URL",
            "INFOLENS_OIDC_CLIENT_ID",
            "INFOLENS_OIDC_CLIENT_SECRET",
            "INFOLENS_SESSION_SECRET",
        )
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RuntimeError(f"OIDC 登录缺少环境变量: {', '.join(missing)}")
    if WECOM_BOT_MODE not in {"callback", "long_connection"}:
        raise RuntimeError("WECOM_BOT_MODE 必须为 callback 或 long_connection")
    if WECOM_BOT_CALLBACK_ENABLED:
        required = (
            "WECOM_BOT_TOKEN",
            "WECOM_BOT_ENCODING_AES_KEY",
            "WECOM_BOT_ID",
        )
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RuntimeError(f"企业微信机器人缺少环境变量: {', '.join(missing)}")


def _image_url(folder: str, filename: str) -> str:
    return "/output/" + "/".join(
        urllib.parse.quote(part) for part in (folder, filename)
    )


def _serialize_result(result: ExtractResult) -> dict:
    try:
        folder = str(Path(result.output_dir).relative_to(OUTPUT_ROOT))
    except ValueError:
        folder = Path(result.output_dir).name
    return {
        "visit_id": result.visit_id,
        "terminal_name": result.terminal_name,
        "partner_name": result.partner_name,
        "images": [
            {
                "filename": image.filename,
                "size_bytes": image.size_bytes,
                "url": _image_url(folder, image.filename),
            }
            for image in result.images
        ],
    }


def _parse_excel_links(file_stream) -> tuple[list[tuple[int, str]], dict[str, int]]:
    """读取首个工作表中唯一的“链接”列。"""
    try:
        payload = file_stream.read(MAX_UPLOAD_BYTES + 1)
        if len(payload) > MAX_UPLOAD_BYTES:
            raise ValueError("Excel 文件超过上传大小限制")
        excel_buffer = io.BytesIO(payload)
        with zipfile.ZipFile(excel_buffer) as archive:
            expanded_size = sum(item.file_size for item in archive.infolist())
            if expanded_size > 32 * 1024 * 1024:
                raise ValueError("Excel 文件解压后的内容过大")
        excel_buffer.seek(0)
        workbook = load_workbook(excel_buffer, read_only=True, data_only=True)
    except (InvalidFileException, OSError, ValueError, zipfile.BadZipFile) as exc:
        if isinstance(exc, ValueError) and str(exc).startswith("Excel 文件"):
            raise
        raise ValueError("无法读取 Excel 文件，请确认文件为有效的 .xlsx 格式") from exc

    try:
        worksheet = workbook.active
        rows = worksheet.iter_rows(values_only=True)
        header = next(rows, None)
        if header is None:
            raise ValueError("Excel 文件为空")

        populated_headers = [
            str(value).strip() for value in header if value is not None and str(value).strip()
        ]
        if populated_headers != ["链接"]:
            raise ValueError('Excel 第一行必须只有一个字段，字段名为“链接”')

        links: list[tuple[int, str]] = []
        seen: set[str] = set()
        duplicate_count = 0
        invalid_count = 0
        input_count = 0
        for row_number, row in enumerate(rows, start=2):
            populated = [
                value for value in row[1:] if value is not None and str(value).strip()
            ]
            if populated:
                raise ValueError(f"Excel 第 {row_number} 行包含“链接”列之外的数据")

            value = row[0] if row else None
            if value is None or not str(value).strip():
                continue
            input_count += 1
            if input_count > MAX_BATCH_LINKS:
                raise ValueError(f"单次最多处理 {MAX_BATCH_LINKS} 条链接")
            link = str(value).strip()
            if link in seen:
                duplicate_count += 1
                continue
            seen.add(link)
            try:
                parse_visit_url(link)
            except ValueError:
                invalid_count += 1
                continue
            links.append((row_number, link))

        if not links:
            raise ValueError("Excel 中没有格式有效且可处理的 CRM 链接")
        return links, {
            "input_count": input_count,
            "duplicate_count": duplicate_count,
            "invalid_count": invalid_count,
            "rejected_count": duplicate_count + invalid_count,
        }
    finally:
        workbook.close()


def _build_batch_archive(
    completed_records: list[dict],
    errors: list[dict],
    total: int,
    input_stats: dict[str, int] | None = None,
    retry_count: int = 0,
) -> dict:
    input_stats = input_stats or {}
    batch_dir = OUTPUT_ROOT / "_batches"
    batch_dir.mkdir(parents=True, exist_ok=True)
    batch_key = f"{datetime.now():%Y%m%d_%H%M%S}_{secrets.token_hex(4)}"
    archive_path = batch_dir / f".batch_{batch_key}.zip"
    completed: list[dict] = []
    field_rows: list[dict] = []
    seen_fields: set[str] = set()
    image_groups: dict[tuple[str, str], dict[str, str | int]] = {}
    image_count = 0

    with zipfile.ZipFile(
        archive_path,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as archive:
        for record in completed_records:
            archived_for_visit = 0
            row_number = int(record["row"])
            terminal_name = str(record["terminal_name"])
            for image in record.get("images", []):
                field = str(image["field"])
                image_key = (field, terminal_name)
                group = image_groups.get(image_key)
                if group is None:
                    safe_field = re.sub(r'[\\/:*?"<>|]', "_", field)
                    safe_terminal = re.sub(
                        r'[\\/:*?"<>|]',
                        "_",
                        terminal_name.strip(),
                    ) or "未知终端"
                    group = {
                        "folder": (
                            f"{len(image_groups) + 1:02d}_"
                            f"{safe_field}_{safe_terminal}"
                        ),
                        "image_count": 0,
                    }
                    image_groups[image_key] = group

                source = Path(str(image["source"]))
                if not source.is_file():
                    raise ValueError(f"第 {row_number} 行的已提取图片不存在，无法恢复归档")
                extension = source.suffix.lower() or ".jpg"
                group["image_count"] = int(group["image_count"]) + 1
                archive_filename = (
                    f"{group['folder']}/"
                    f"{int(group['image_count']):02d}{extension}"
                )
                archive.write(source, archive_filename)
                image_count += 1
                archived_for_visit += 1
                if field not in seen_fields:
                    seen_fields.add(field)
                    field_rows.append({"row": row_number, "field": field})
            completed.append(
                {
                    "row": row_number,
                    "terminal_name": terminal_name,
                    "partner_name": record["partner_name"],
                    "image_count": archived_for_visit,
                }
            )

        report = {
            "total": total,
            "input_count": input_stats.get("input_count", total),
            "duplicate_count": input_stats.get("duplicate_count", 0),
            "invalid_count": input_stats.get("invalid_count", 0),
            "rejected_count": input_stats.get("rejected_count", 0),
            "retry_count": retry_count,
            "succeeded": len(completed),
            "failed": len(errors),
            "image_count": image_count,
            "field_rows": field_rows,
            "completed": completed,
            "errors": errors,
        }
        archive.writestr(
            "提取结果.json",
            json.dumps(report, ensure_ascii=False, indent=2),
        )

    if not completed:
        archive_path.unlink(missing_ok=True)
        first_error = errors[0]["error"] if errors else "没有成功提取任何图片"
        raise ValueError(f"批量提取失败：{first_error}")

    safe_partner = re.sub(
        r'[\\/:*?"<>|]',
        "_",
        str(completed[0]["partner_name"]).strip(),
    ) or "未知业务员"
    archive_stem = f"{datetime.now():%Y%m%d}_{safe_partner}_{len(seen_fields)}"
    archive_name = f"{archive_stem}.zip"
    final_archive_path = batch_dir / archive_name
    sequence = 2
    while final_archive_path.exists():
        archive_name = f"{archive_stem}_{sequence:02d}.zip"
        final_archive_path = batch_dir / archive_name
        sequence += 1
    archive_path.replace(final_archive_path)
    return {
        **report,
        "archive_name": archive_name,
        "archive_url": _image_url("_batches", archive_name),
    }


def _batch_checkpoint_dir() -> Path:
    path = OUTPUT_ROOT / "_system" / "batch_jobs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _batch_checkpoint_path(job_id: str) -> Path:
    return _batch_checkpoint_dir() / f"{job_id}.json"


def _write_batch_checkpoint(job_id: str, job: dict) -> None:
    path = _batch_checkpoint_path(job_id)
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(
        json.dumps(job, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temp_path.replace(path)


def _update_batch_job(job_id: str, **values) -> None:
    with BATCH_JOBS_LOCK:
        job = BATCH_JOBS.get(job_id)
        if job is None:
            return
        job.update(values)
        job["updated_at"] = time.time()
        checkpoint = dict(job)
    _write_batch_checkpoint(job_id, checkpoint)


def _register_batch_job(job_id: str, job: dict) -> None:
    with BATCH_JOBS_LOCK:
        BATCH_JOBS[job_id] = job
        checkpoint = dict(job)
    _write_batch_checkpoint(job_id, checkpoint)


def _extract_batch_record(row_number: int, link: str) -> dict:
    result = extract_images(link, OUTPUT_ROOT)
    IMAGE_LIBRARY.add_result(result, source_url=link)
    images: list[dict] = []
    for image in result.images:
        try:
            field = photoid_name_field(image.photoid)
        except ValueError:
            continue
        images.append(
            {
                "field": field,
                "source": str(Path(result.output_dir) / image.filename),
            }
        )
    return {
        "row": row_number,
        "terminal_name": result.terminal_name,
        "partner_name": result.partner_name,
        "images": images,
    }


def _run_batch_job_chunk(application: Flask, job_id: str) -> bool:
    with BATCH_JOBS_LOCK:
        current = BATCH_JOBS.get(job_id)
        if current is None:
            return False
        job = dict(current)
    links = [(int(row), str(link)) for row, link in job.get("links", [])]
    total = len(links)
    start = int(job.get("processed", 0))
    end = min(start + BATCH_CHUNK_SIZE, total)
    chunk_count = max(1, (total + BATCH_CHUNK_SIZE - 1) // BATCH_CHUNK_SIZE)
    _update_batch_job(
        job_id,
        status="running",
        chunk_index=min(start // BATCH_CHUNK_SIZE + 1, chunk_count),
        chunk_count=chunk_count,
    )
    try:
        for index in range(start, end):
            row_number, link = links[index]
            record = None
            error_message = "处理失败，请联系管理员"
            attempts_used = 0
            for attempt in range(1, BATCH_LINK_ATTEMPTS + 1):
                attempts_used = attempt
                try:
                    with EXTRACT_LOCK:
                        record = _extract_batch_record(row_number, link)
                    break
                except (ValueError, CrmApiError) as exc:
                    error_message = str(exc)
                except Exception:
                    application.logger.exception(
                        "批量任务 %s 第 %s 行第 %s 次提取失败",
                        job_id,
                        row_number,
                        attempt,
                    )
                    error_message = "处理失败，请联系管理员"
                if attempt < BATCH_LINK_ATTEMPTS:
                    time.sleep(min(0.5 * attempt, 1.5))

            with BATCH_JOBS_LOCK:
                live_job = BATCH_JOBS[job_id]
                completed_records = list(live_job.get("completed_records", []))
                errors = list(live_job.get("errors", []))
                retry_count = int(live_job.get("retry_count", 0)) + max(
                    attempts_used - 1,
                    0,
                )
            if record is not None:
                completed_records.append(record)
            else:
                errors.append(
                    {
                        "row": row_number,
                        "error": error_message,
                        "attempts": attempts_used,
                    }
                )
            _update_batch_job(
                job_id,
                processed=index + 1,
                current_row=row_number,
                succeeded=len(completed_records),
                failed=len(errors),
                image_count=sum(
                    len(item.get("images", [])) for item in completed_records
                ),
                completed_records=completed_records,
                errors=errors,
                retry_count=retry_count,
            )

        if end < total:
            _update_batch_job(job_id, status="queued")
            return True

        with BATCH_JOBS_LOCK:
            finished_job = dict(BATCH_JOBS[job_id])
        input_stats = {
            key: int(finished_job.get(key, 0))
            for key in (
                "input_count",
                "duplicate_count",
                "invalid_count",
                "rejected_count",
            )
        }
        result = _build_batch_archive(
            list(finished_job.get("completed_records", [])),
            list(finished_job.get("errors", [])),
            total,
            input_stats,
            int(finished_job.get("retry_count", 0)),
        )
        _update_batch_job(
            job_id,
            status="completed",
            processed=total,
            result=result,
        )
        return False
    except ValueError as exc:
        _update_batch_job(job_id, status="failed", error=str(exc))
        return False
    except Exception:
        application.logger.exception("批量提取图片失败")
        _update_batch_job(
            job_id,
            status="failed",
            error="批量提取失败，请联系管理员查看服务日志",
        )
        return False


def _batch_worker(application: Flask) -> None:
    while True:
        job_id = BATCH_QUEUE.get()
        try:
            if _run_batch_job_chunk(application, job_id):
                BATCH_QUEUE.put(job_id)
        finally:
            BATCH_QUEUE.task_done()


def _restore_batch_jobs() -> None:
    for path in _batch_checkpoint_dir().glob("*.json"):
        try:
            job = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if str(job.get("status", "")) not in {"queued", "running"}:
            continue
        job_id = path.stem
        job["status"] = "queued"
        job["resumed"] = True
        with BATCH_JOBS_LOCK:
            BATCH_JOBS[job_id] = job
        _write_batch_checkpoint(job_id, job)
        BATCH_QUEUE.put(job_id)


def _start_batch_worker(application: Flask) -> None:
    global BATCH_WORKER_STARTED
    with BATCH_WORKER_LOCK:
        if BATCH_WORKER_STARTED:
            return
        _restore_batch_jobs()
        threading.Thread(
            target=_batch_worker,
            args=(application,),
            daemon=True,
            name="batch-worker",
        ).start()
        BATCH_WORKER_STARTED = True


def _prune_batch_jobs() -> None:
    cutoff = time.time() - BATCH_JOB_TTL_SECONDS
    with BATCH_JOBS_LOCK:
        expired = [
            job_id
            for job_id, job in BATCH_JOBS.items()
            if job.get("status") in {"completed", "failed"}
            and job.get("updated_at", 0) < cutoff
        ]
        for job_id in expired:
            BATCH_JOBS.pop(job_id, None)
            _batch_checkpoint_path(job_id).unlink(missing_ok=True)


def _public_batch_job(job: dict) -> dict:
    fields = (
        "status",
        "processed",
        "total",
        "current_row",
        "succeeded",
        "failed",
        "image_count",
        "input_count",
        "duplicate_count",
        "invalid_count",
        "rejected_count",
        "retry_count",
        "chunk_index",
        "chunk_count",
        "resumed",
        "result",
        "error",
    )
    return {field: job[field] for field in fields if field in job}


def _load_saved_results() -> list[dict]:
    results: list[dict] = []
    if not OUTPUT_ROOT.exists():
        return results

    metadata_files = sorted(
        OUTPUT_ROOT.glob("**/metadata.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for metadata_file in metadata_files:
        try:
            data = json.loads(metadata_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        folder = str(metadata_file.parent.relative_to(OUTPUT_ROOT))
        images = []
        private_images = [
            item
            for item in data.get("images", [])
            if str(item.get("photoid") or "").startswith("private")
        ]
        for index, item in enumerate(private_images, start=1):
            filename = item.get("filename", "")
            image_file = metadata_file.parent / filename
            if filename and image_file.is_file():
                try:
                    display_filename = build_image_filename(
                        item["photoid"],
                        data.get("terminal_name") or "未知终端",
                        data.get("partner_name") or "未知业务员",
                        index,
                        image_file.suffix,
                    )
                except (KeyError, ValueError):
                    display_filename = filename
                images.append(
                    {
                        "filename": filename,
                        "display_filename": display_filename,
                        "size_bytes": item.get("size_bytes", image_file.stat().st_size),
                        "url": _image_url(folder, filename),
                    }
                )

        results.append(
            {
                "visit_id": data.get("visit_id", ""),
                "terminal_name": data.get("terminal_name", "未知终端"),
                "partner_name": data.get("partner_name", "未知业务员"),
                "extracted_at": data.get("extracted_at", ""),
                "images": images,
            }
        )
    return results


def _current_user() -> str | None:
    if AUTH_MODE == "off":
        return "本地用户"
    if AUTH_MODE in {"password", "oidc"}:
        return session.get("user")

    header = os.environ.get(
        "INFOLENS_PROXY_USER_HEADER",
        "Cf-Access-Authenticated-User-Email",
    )
    user = request.headers.get(header, "").strip().lower()
    if not user:
        return None

    allowed_domain = os.environ.get("INFOLENS_ALLOWED_EMAIL_DOMAIN", "").lower()
    allowed_emails = {
        email.strip().lower()
        for email in os.environ.get("INFOLENS_ALLOWED_EMAILS", "").split(",")
        if email.strip()
    }
    if allowed_domain and not user.endswith(f"@{allowed_domain}"):
        return None
    if allowed_emails and user not in allowed_emails:
        return None
    return user


def _current_role() -> str:
    if AUTH_MODE == "off":
        return "admin"
    return str(session.get("role") or "user")


def _is_admin() -> bool:
    return _current_role() == "admin"


def _identity_allowed(user: str) -> bool:
    normalized = user.strip().lower()
    allowed_domain = os.environ.get("INFOLENS_ALLOWED_EMAIL_DOMAIN", "").lower()
    allowed_emails = {
        email.strip().lower()
        for email in os.environ.get("INFOLENS_ALLOWED_EMAILS", "").split(",")
        if email.strip()
    }
    if allowed_domain and not normalized.endswith(f"@{allowed_domain}"):
        return False
    if allowed_emails and normalized not in allowed_emails:
        return False
    return True


def _login_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _current_user():
            return view(*args, **kwargs)
        if request.path.startswith("/api/") or request.path.startswith("/output/"):
            return jsonify({"error": "请先登录"}), 401
        return redirect(url_for("login", next=request.path))

    return wrapped


def _admin_required(view: Callable):
    @wraps(view)
    @_login_required
    def wrapped(*args, **kwargs):
        if _is_admin():
            return view(*args, **kwargs)
        return jsonify({"error": "没有权限访问用户管理"}), 403

    return wrapped


def _super_admin_config() -> tuple[str, str, str]:
    username = (
        os.environ.get("INFOLENS_SUPER_ADMIN_USERNAME")
        or os.environ.get("INFOLENS_USERNAME")
        or "admin"
    )
    display_name = os.environ.get("INFOLENS_SUPER_ADMIN_DISPLAY_NAME", "超级管理员")
    password_hash = os.environ.get("INFOLENS_SUPER_ADMIN_PASSWORD_HASH")
    if not password_hash:
        password = os.environ.get("INFOLENS_SUPER_ADMIN_PASSWORD")
        if password:
            password_hash = generate_password_hash(password, method="pbkdf2:sha256")
        else:
            password_hash = os.environ.get("INFOLENS_PASSWORD_HASH", "")
    return username, password_hash, display_name


def _ensure_super_admin() -> None:
    if AUTH_MODE != "password":
        return
    username, password_hash, display_name = _super_admin_config()
    if not password_hash:
        return
    USER_STORE.ensure_super_admin(
        username=username,
        password_hash=password_hash,
        display_name=display_name,
    )


def _csrf_token() -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def _check_csrf() -> None:
    expected = session.get("csrf_token", "")
    supplied = request.headers.get("X-CSRF-Token", "")
    if not supplied and request.is_json:
        payload = request.get_json(silent=True) or {}
        supplied = str(payload.get("csrf_token") or "")
    if not supplied:
        supplied = str(request.form.get("csrf_token") or "")
    if not expected or not hmac.compare_digest(expected, supplied):
        abort(403, description="安全令牌无效，请刷新页面后重试")


def _check_rate_limit() -> None:
    limit = int(os.environ.get("INFOLENS_RATE_LIMIT", "10"))
    window = int(os.environ.get("INFOLENS_RATE_WINDOW_SECONDS", "600"))
    identity = _current_user() or request.remote_addr or "unknown"
    now = time.monotonic()
    with RATE_LOCK:
        bucket = RATE_BUCKETS[identity]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            abort(429, description="请求过于频繁，请稍后再试")
        bucket.append(now)


def _run_wecom_extract_job(
    application: Flask,
    crypto: WecomBotCrypto,
    task_id: str,
    message: dict,
    links: list[str],
) -> None:
    succeeded: list[ExtractResult] = []
    errors: list[str] = []
    response_url = str(message.get("response_url") or "")

    with EXTRACT_LOCK:
        for position, link in enumerate(links, start=1):
            try:
                result = extract_images(
                    link,
                    OUTPUT_ROOT,
                    group_by_partner=True,
                )
                IMAGE_LIBRARY.add_result(result, source_url=link)
                succeeded.append(result)
                audit = {
                    "task_id": task_id,
                    "wecom_message_id": message.get("msgid"),
                    "wecom_user_id": (message.get("from") or {}).get("userid"),
                    "wecom_chat_id": message.get("chatid"),
                    "received_at": datetime.now().isoformat(timespec="seconds"),
                }
                (Path(result.output_dir) / "wecom_submission.json").write_text(
                    json.dumps(audit, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            except (ValueError, CrmApiError) as exc:
                errors.append(f"第 {position} 条：{exc}")
            except Exception:
                application.logger.exception(
                    "企业微信任务 %s 的第 %s 条链接处理失败",
                    task_id,
                    position,
                )
                errors.append(f"第 {position} 条：处理失败，请联系管理员")

    lines = [
        f"**任务 {task_id} 处理完成**",
        f"> 成功：{len(succeeded)} 条",
        f"> 失败：{len(errors)} 条",
    ]
    for result in succeeded:
        lines.append(
            f"- {result.partner_name}｜{result.terminal_name}｜{len(result.images)} 张图片"
        )
    if errors:
        lines.append("\n**失败明细**")
        lines.extend(f"- {error}" for error in errors[:5])
        if len(errors) > 5:
            lines.append(f"- 另有 {len(errors) - 5} 条失败")

    allowed_hosts = {
        item.strip().lower()
        for item in os.environ.get(
            "WECOM_BOT_RESPONSE_HOSTS",
            "qyapi.weixin.qq.com",
        ).split(",")
        if item.strip()
    }
    try:
        send_response_url(
            response_url,
            stream_reply(f"{task_id}-result", "\n".join(lines)),
            crypto,
            allowed_hosts=allowed_hosts,
        )
    except WecomBotError:
        application.logger.exception("企业微信任务 %s 的结果通知失败", task_id)


def _create_distribution_archive(business: str) -> dict:
    jobs = DISTRIBUTION_STORE.completed_for_business(business)
    if not jobs:
        raise ValueError("该业务暂无可下载的提取内容")

    archive_root = OUTPUT_ROOT / "_distribution_downloads"
    archive_root.mkdir(parents=True, exist_ok=True)
    safe_business = re.sub(r'[\\/:*?"<>|]', "_", business.strip()) or "未知业务"
    archive_key = f"{datetime.now():%Y%m%d_%H%M%S}_{secrets.token_hex(3)}"
    temp_path = archive_root / f".{archive_key}.zip"
    groups: dict[tuple[str, str], dict[str, str | int]] = {}
    archived_images = 0
    fields: set[str] = set()

    with zipfile.ZipFile(
        temp_path,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as archive:
        for job in jobs:
            output_dir = Path(job.output_dir).resolve()
            try:
                output_dir.relative_to(OUTPUT_ROOT)
            except ValueError:
                continue
            metadata_file = output_dir / "metadata.json"
            try:
                metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue

            for item in metadata.get("images") or []:
                filename = str(item.get("filename") or "")
                image_file = (output_dir / filename).resolve()
                if not filename or not image_file.is_file():
                    continue
                try:
                    image_file.relative_to(output_dir)
                    field = photoid_name_field(str(item.get("photoid") or ""))
                except ValueError:
                    continue
                terminal = str(
                    metadata.get("terminal_name")
                    or job.terminal_name
                    or "未知终端"
                )
                group_key = (field, terminal)
                group = groups.get(group_key)
                if group is None:
                    safe_field = re.sub(r'[\\/:*?"<>|]', "_", field)
                    safe_terminal = re.sub(r'[\\/:*?"<>|]', "_", terminal)
                    group = {
                        "folder": (
                            f"{len(groups) + 1:02d}_{safe_field}_{safe_terminal}"
                        ),
                        "image_count": 0,
                    }
                    groups[group_key] = group
                group["image_count"] = int(group["image_count"]) + 1
                extension = image_file.suffix.lower() or ".jpg"
                archive.write(
                    image_file,
                    (
                        f"{group['folder']}/"
                        f"{int(group['image_count']):02d}{extension}"
                    ),
                )
                fields.add(field)
                archived_images += 1

        report = {
            "business": business,
            "field_count": len(fields),
            "fields": sorted(fields),
            "distributed_count": len(jobs),
            "image_count": archived_images,
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        archive.writestr(
            "分发提取结果.json",
            json.dumps(report, ensure_ascii=False, indent=2),
        )

    if not archived_images:
        temp_path.unlink(missing_ok=True)
        raise ValueError("该业务没有可打包的图片文件")

    archive_name = (
        f"{datetime.now():%Y%m%d}_{safe_business}_{len(fields)}个字段.zip"
    )
    archive_path = archive_root / archive_name
    sequence = 2
    while archive_path.exists():
        archive_name = (
            f"{datetime.now():%Y%m%d}_{safe_business}_"
            f"{len(fields)}个字段_{sequence:02d}.zip"
        )
        archive_path = archive_root / archive_name
        sequence += 1
    temp_path.replace(archive_path)
    DISTRIBUTION_STORE.mark_downloaded(business)
    return {
        "archive_name": archive_name,
        "archive_url": _image_url("_distribution_downloads", archive_name),
        **report,
    }


def _parse_field_lines(value: str) -> list[str]:
    fields: list[str] = []
    seen: set[str] = set()
    for item in re.split(r"[\s,，;；]+", value):
        field = item.strip()
        if not field or field in seen:
            continue
        seen.add(field)
        fields.append(field)
    return fields


def _parse_pagination(page_value, page_size_value) -> tuple[int, int]:
    try:
        page = int(page_value or 1)
        page_size = int(page_size_value or IMAGE_LIBRARY_PAGE_SIZE)
    except (TypeError, ValueError) as exc:
        raise ValueError("分页参数必须是整数") from exc
    if page < 1 or page_size < 1:
        raise ValueError("分页参数必须大于 0")
    return page, min(page_size, 50)


def _private_image_cache(response):
    response.cache_control.public = False
    response.cache_control.private = True
    response.cache_control.max_age = IMAGE_CACHE_SECONDS
    response.cache_control.immutable = True
    return response


def _serve_output_file(
    path: Path,
    *,
    cache: bool = False,
    as_attachment: bool = False,
    download_name: str | None = None,
    mimetype: str | None = None,
):
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(OUTPUT_ROOT)
    except ValueError:
        abort(404)
    if not resolved.is_file():
        abort(404)

    guessed_type = mimetype or mimetypes.guess_type(resolved.name)[0]
    if X_ACCEL_ENABLED:
        response = Response(status=200, mimetype=guessed_type or "application/octet-stream")
        encoded_path = "/".join(
            urllib.parse.quote(part, safe="") for part in relative.parts
        )
        response.headers["X-Accel-Redirect"] = f"{X_ACCEL_PREFIX}/{encoded_path}"
        response.headers["X-Accel-Expires"] = (
            str(IMAGE_CACHE_SECONDS) if cache else "0"
        )
        if as_attachment:
            safe_download_name = download_name or resolved.name
            response.headers.set(
                "Content-Disposition",
                "attachment",
                filename=safe_download_name,
            )
    else:
        response = send_file(
            resolved,
            conditional=True,
            max_age=IMAGE_CACHE_SECONDS if cache else None,
            as_attachment=as_attachment,
            download_name=download_name,
            mimetype=guessed_type,
        )
    return _private_image_cache(response) if cache else response


def _valid_export_images(image_ids: list[str]) -> list[tuple[LibraryImage, Path]]:
    images = IMAGE_LIBRARY.get_images(image_ids)
    valid_images: list[tuple[LibraryImage, Path]] = []
    for image in images:
        source = (OUTPUT_ROOT / image.file_path).resolve()
        try:
            source.relative_to(OUTPUT_ROOT)
        except ValueError:
            continue
        if source.is_file():
            valid_images.append((image, source))
    if not valid_images:
        raise ValueError("选中的照片文件不存在，无法导出")
    return valid_images


def _preview_image_library_archive(image_ids: list[str]) -> dict:
    valid_images = _valid_export_images(image_ids)
    fields = sorted({image.field for image, _source in valid_images})
    return {
        "image_count": len(valid_images),
        "field_count": len(fields),
        "fields": fields,
        "export_time": to_utc_iso(datetime.now(timezone.utc)),
    }


def _create_image_library_archive(
    image_ids: list[str],
    *,
    description: str,
    owner_username: str,
    owner_display_name: str,
) -> dict:
    description = description.strip()
    if not description:
        raise ValueError("请填写导出说明")
    if len(description) > 30:
        raise ValueError("导出说明不能超过30个字")

    valid_images = _valid_export_images(image_ids)
    exported_at = datetime.now(timezone.utc)
    record_id = secrets.token_hex(16)

    export_root = OUTPUT_ROOT / "_image_exports"
    export_root.mkdir(parents=True, exist_ok=True)
    archive_name = (
        f"{datetime.now():%Y%m%d_%H%M%S}_选中照片_"
        f"{len(valid_images)}张_{record_id[:6]}.zip"
    )
    archive_path = export_root / archive_name
    temp_path = export_root / f".{record_id}.zip"
    groups: dict[tuple[str, str, str], int] = {}
    fields: set[str] = set()
    archived_images = 0
    image_items: list[tuple[str, str]] = []

    with zipfile.ZipFile(
        temp_path,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as archive:
        for image, source in valid_images:
            group_key = (image.field, image.customer_name, image.business)
            groups[group_key] = groups.get(group_key, 0) + 1
            sequence = groups[group_key]
            safe_field = re.sub(r'[\\/:*?"<>|]', "_", image.field)
            safe_customer = re.sub(r'[\\/:*?"<>|]', "_", image.customer_name)
            safe_business = re.sub(r'[\\/:*?"<>|]', "_", image.business)
            folder = f"{safe_field}_{safe_customer}_{safe_business}"
            extension = source.suffix.lower() or ".jpg"
            archive.write(source, f"{folder}/{sequence:02d}{extension}")
            fields.add(image.field)
            image_items.append((image.id, image.field))
            archived_images += 1

        report = {
            "record_id": record_id,
            "description": description,
            "field_count": len(fields),
            "fields": sorted(fields),
            "image_count": archived_images,
            "created_at": to_utc_iso(exported_at),
        }
        archive.writestr(
            "图片库导出结果.json",
            json.dumps(report, ensure_ascii=False, indent=2),
        )

    if not archived_images:
        temp_path.unlink(missing_ok=True)
        raise ValueError("选中的照片文件不存在，无法导出")

    temp_path.replace(archive_path)
    try:
        return EXPORT_RECORD_STORE.create_record(
            record_id=record_id,
            description=description,
            owner_username=owner_username,
            owner_display_name=owner_display_name,
            archive_name=archive_name,
            archive_path=archive_path.relative_to(OUTPUT_ROOT).as_posix(),
            image_items=image_items,
            archive_size_bytes=archive_path.stat().st_size,
            created_at=exported_at,
        )
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise


def create_app() -> Flask:
    _require_production_config()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    EXPORT_RECORD_STORE.expire_records()
    _ensure_super_admin()
    if os.environ.get("INFOLENS_DISTRIBUTION_IMPORT_EXISTING", "").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        DISTRIBUTION_STORE.import_existing_outputs(OUTPUT_ROOT)
    if os.environ.get("INFOLENS_IMAGE_LIBRARY_IMPORT_EXISTING", "").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        IMAGE_LIBRARY.import_existing_outputs()

    application = Flask(__name__, static_folder=None)
    application.wsgi_app = ProxyFix(
        application.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
    )
    application.config.update(
        MAX_CONTENT_LENGTH=MAX_UPLOAD_BYTES,
        SECRET_KEY=os.environ.get("INFOLENS_SESSION_SECRET") or secrets.token_hex(32),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("INFOLENS_ENV") == "production",
        PERMANENT_SESSION_LIFETIME=8 * 60 * 60,
    )
    oauth = OAuth(application)
    wecom_crypto = None
    if WECOM_BOT_CALLBACK_ENABLED:
        wecom_crypto = WecomBotCrypto(
            os.environ["WECOM_BOT_TOKEN"],
            os.environ["WECOM_BOT_ENCODING_AES_KEY"],
        )
    if AUTH_MODE == "oidc":
        oauth.register(
            name="company",
            server_metadata_url=os.environ["INFOLENS_OIDC_METADATA_URL"],
            client_id=os.environ["INFOLENS_OIDC_CLIENT_ID"],
            client_secret=os.environ["INFOLENS_OIDC_CLIENT_SECRET"],
            client_kwargs={"scope": "openid email profile"},
        )

    @application.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https://www.crbeer.com.hk; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'none'; "
            "form-action 'self'"
        )
        if not (
            response.cache_control.private
            and response.cache_control.max_age == IMAGE_CACHE_SECONDS
        ):
            response.headers["Cache-Control"] = "no-store"
        return response

    @application.get("/healthz")
    def healthz():
        return jsonify({"status": "ok"})

    @application.route("/api/wecom/bot/callback", methods=["GET", "POST"])
    def wecom_bot_callback():
        if not WECOM_BOT_CALLBACK_ENABLED or wecom_crypto is None:
            return jsonify({"error": "企业微信智能机器人未启用"}), 503

        msg_signature = request.args.get("msg_signature", "")
        timestamp = request.args.get("timestamp", "")
        nonce = request.args.get("nonce", "")
        if not msg_signature or not timestamp or not nonce:
            return jsonify({"error": "企业微信回调参数不完整"}), 400

        try:
            validate_callback_timestamp(
                timestamp,
                int(os.environ.get("WECOM_BOT_CALLBACK_MAX_AGE_SECONDS", "600")),
            )
            if request.method == "GET":
                echo_str = request.args.get("echostr", "")
                if not echo_str:
                    return jsonify({"error": "企业微信回调缺少 echostr"}), 400
                return wecom_crypto.verify_url(
                    msg_signature,
                    timestamp,
                    nonce,
                    echo_str,
                )

            if request.content_length and request.content_length > 1024 * 1024:
                return jsonify({"error": "企业微信回调正文过大"}), 413
            message = wecom_crypto.decrypt(
                request.get_data(cache=False),
                msg_signature,
                timestamp,
                nonce,
            )
            if message.get("aibotid") != os.environ["WECOM_BOT_ID"]:
                raise WecomBotError("企业微信机器人 ID 不匹配")

            if message.get("msgtype") == "event":
                event_type = (message.get("event") or {}).get("eventtype")
                payload = (
                    text_reply(
                        "发送 CRM 拜访详情链接，我会自动提取图片并按业务员归档。"
                    )
                    if event_type == "enter_chat"
                    else {}
                )
                return wecom_crypto.encrypt(payload, nonce)

            if message.get("msgtype") == "stream":
                return wecom_crypto.encrypt({}, nonce)

            links = extract_crm_urls(
                message_text(message),
                max_links=WECOM_BOT_MAX_LINKS,
            )
            if not links:
                return wecom_crypto.encrypt(
                    stream_reply(
                        f"help-{secrets.token_hex(6)}",
                        "没有识别到 CRM 拜访链接。\n"
                        "请发送包含 `visitDetail` 或 `workCirclevisit` 的链接。",
                    ),
                    nonce,
                )
            if not message.get("response_url"):
                return wecom_crypto.encrypt(
                    stream_reply(
                        f"error-{secrets.token_hex(6)}",
                        "消息缺少结果回传地址，请重新发送链接。",
                    ),
                    nonce,
                )

            proposed_task_id = (
                f"IL{datetime.now():%Y%m%d%H%M%S}{secrets.token_hex(2).upper()}"
            )
            duplicate, task_id = WECOM_DEDUPLICATOR.remember(
                str(message.get("msgid") or ""),
                proposed_task_id,
            )
            if not duplicate:
                threading.Thread(
                    target=_run_wecom_extract_job,
                    args=(application, wecom_crypto, task_id, message, links),
                    daemon=True,
                    name=f"wecom-{task_id}",
                ).start()

            duplicate_note = "（重复消息，未再次执行）" if duplicate else ""
            return wecom_crypto.encrypt(
                stream_reply(
                    f"{task_id}-accepted",
                    f"已接收 {len(links)} 条链接，任务号：`{task_id}`{duplicate_note}\n"
                    "图片正在后台提取，完成后会自动回复。",
                ),
                nonce,
            )
        except WecomBotError as exc:
            application.logger.warning("企业微信回调被拒绝：%s", exc)
            return jsonify({"error": "企业微信回调验证失败"}), 403
        except Exception:
            application.logger.exception("企业微信智能机器人回调处理失败")
            return jsonify({"error": "企业微信回调处理失败"}), 500

    @application.route("/login", methods=["GET", "POST"])
    def login():
        if AUTH_MODE == "off":
            return redirect(url_for("index"))
        if AUTH_MODE == "proxy":
            if _current_user():
                return redirect(url_for("index"))
            return "身份验证失败，请通过公司的登录入口访问。", 401
        if AUTH_MODE == "oidc":
            callback = url_for("oidc_callback", _external=True)
            return oauth.company.authorize_redirect(callback)

        error = ""
        if request.method == "POST":
            username = request.form.get("username", "")
            password = request.form.get("password", "")
            user = USER_STORE.authenticate(username, password)
            if user:
                session.clear()
                session["user"] = user["username"]
                session["user_id"] = user["id"]
                session["role"] = user["role"]
                session["display_name"] = user["display_name"]
                session["is_super_admin"] = user["is_super_admin"]
                session.permanent = True
                destination = request.args.get("next", "/")
                if not destination.startswith("/") or destination.startswith("//"):
                    destination = "/"
                return redirect(destination)
            error = "账号或密码不正确"

        return (
            (WEB_ROOT / "login.html")
            .read_text(encoding="utf-8")
            .replace("{{ERROR}}", error)
        )

    @application.get("/auth/callback")
    def oidc_callback():
        if AUTH_MODE != "oidc":
            abort(404)
        token = oauth.company.authorize_access_token()
        userinfo = token.get("userinfo") or oauth.company.userinfo()
        user = str(userinfo.get("email") or userinfo.get("preferred_username") or "")
        if not user or not _identity_allowed(user):
            return "该公司账号没有 InfoLens 访问权限。", 403
        session.clear()
        session["user"] = user.lower()
        session["role"] = "user"
        session.permanent = True
        return redirect(url_for("index"))

    @application.get("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))

    @application.get("/")
    @_login_required
    def index():
        return send_from_directory(WEB_ROOT, "index.html")

    @application.get("/assets/<path:filename>")
    @_login_required
    def frontend_assets(filename: str):
        response = send_from_directory(WEB_ROOT / "assets", filename)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response

    @application.get("/api/session")
    @_login_required
    def session_info():
        return jsonify(
            {
                "user": _current_user(),
                "display_name": session.get("display_name") or _current_user(),
                "role": _current_role(),
                "is_admin": _is_admin(),
                "csrf_token": _csrf_token(),
            }
        )

    @application.get("/api/users")
    @_admin_required
    def list_users():
        return jsonify({"items": USER_STORE.list_users()})

    @application.post("/api/users")
    @_admin_required
    def create_user():
        _check_csrf()
        payload = request.get_json(silent=True) or {}
        try:
            return (
                jsonify(
                    USER_STORE.create_user(
                        username=str(payload.get("username") or ""),
                        display_name=str(payload.get("display_name") or ""),
                        password=str(payload.get("password") or ""),
                        role=str(payload.get("role") or "user"),
                        status=str(payload.get("status") or "enabled"),
                    )
                ),
                201,
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @application.patch("/api/users/<int:user_id>")
    @_admin_required
    def update_user(user_id: int):
        _check_csrf()
        payload = request.get_json(silent=True) or {}
        try:
            return jsonify(
                USER_STORE.update_user(
                    user_id,
                    display_name=str(payload.get("display_name") or ""),
                    role=str(payload.get("role") or "user"),
                    status=str(payload.get("status") or "enabled"),
                    password=str(payload.get("password") or ""),
                )
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @application.delete("/api/users/<int:user_id>")
    @_admin_required
    def delete_user(user_id: int):
        _check_csrf()
        try:
            USER_STORE.delete_user(user_id)
            return jsonify({"message": "用户已删除"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @application.get("/api/results")
    @_login_required
    def saved_results():
        return jsonify(_load_saved_results())

    @application.get("/api/distributions")
    @_login_required
    def distribution_summary():
        items = DISTRIBUTION_STORE.summaries()
        return jsonify(
            {
                "items": items,
                "totals": {
                    "business_count": len(
                        [
                            item
                            for item in items
                            if item["business"] != "待识别"
                        ]
                    ),
                    "quantity": sum(item["quantity"] for item in items),
                    "distributed_count": sum(
                        item["distributed_count"] for item in items
                    ),
                    "pending_download_count": sum(
                        item["pending_download_count"] for item in items
                    ),
                },
            }
        )

    @application.delete("/api/distributions")
    @_login_required
    def clear_distributions():
        _check_csrf()
        deleted_count = DISTRIBUTION_STORE.clear_all()
        return jsonify(
            {
                "deleted_count": deleted_count,
                "message": f"已清空 {deleted_count} 条分发记录",
            }
        )

    @application.post("/api/distributions/<path:business>/archive")
    @_login_required
    def distribution_archive(business: str):
        _check_csrf()
        try:
            return jsonify(_create_distribution_archive(business))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            application.logger.exception("生成业务分发压缩包失败")
            return jsonify({"error": "生成压缩包失败，请联系管理员"}), 500

    @application.get("/api/image-library")
    @_login_required
    def image_library():
        month = request.args.get("month", "").strip()
        business = request.args.get("business", "").strip()
        customer_name = request.args.get("customer_name", "").strip()
        fields = _parse_field_lines(request.args.get("fields", ""))
        try:
            page, page_size = _parse_pagination(
                request.args.get("page"),
                request.args.get("page_size"),
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify(
            {
                **IMAGE_LIBRARY.query(
                    fields=fields,
                    month=month,
                    business=business,
                    customer_name=customer_name,
                    page=page,
                    page_size=page_size,
                ),
                "months": IMAGE_LIBRARY.months(),
                "businesses": IMAGE_LIBRARY.businesses(),
                "customer_names": IMAGE_LIBRARY.customer_names(),
            }
        )

    @application.post("/api/image-library/search")
    @_login_required
    def image_library_search():
        payload = request.get_json(silent=True) or {}
        raw_fields = payload.get("fields", "")
        if isinstance(raw_fields, list):
            fields = [
                str(item).strip()
                for item in raw_fields
                if str(item).strip()
            ]
        else:
            fields = _parse_field_lines(str(raw_fields))
        try:
            page, page_size = _parse_pagination(
                payload.get("page"),
                payload.get("page_size"),
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify(
            {
                **IMAGE_LIBRARY.query(
                    fields=fields,
                    month=str(payload.get("month") or "").strip(),
                    business=str(payload.get("business") or "").strip(),
                    customer_name=str(payload.get("customer_name") or "").strip(),
                    page=page,
                    page_size=page_size,
                ),
                "months": IMAGE_LIBRARY.months(),
                "businesses": IMAGE_LIBRARY.businesses(),
                "customer_names": IMAGE_LIBRARY.customer_names(),
            }
        )

    @application.get("/api/image-library/images/<image_id>/thumbnail")
    @_login_required
    def image_library_thumbnail(image_id: str):
        thumbnail = IMAGE_LIBRARY.thumbnail_for(image_id)
        if thumbnail is None:
            abort(404)
        return _serve_output_file(thumbnail, cache=True)

    @application.post("/api/image-library/export-preview")
    @_login_required
    def preview_library_export():
        _check_csrf()
        payload = request.get_json(silent=True) or {}
        image_ids = [
            str(item)
            for item in payload.get("image_ids") or []
            if str(item).strip()
        ]
        try:
            return jsonify(_preview_image_library_archive(image_ids))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @application.post("/api/image-library/export")
    @application.post("/api/export-records")
    @_login_required
    def export_library_images():
        _check_csrf()
        payload = request.get_json(silent=True) or {}
        image_ids = [
            str(item)
            for item in payload.get("image_ids") or []
            if str(item).strip()
        ]
        try:
            return jsonify(
                _create_image_library_archive(
                    image_ids,
                    description=str(payload.get("description") or ""),
                    owner_username=_current_user() or "",
                    owner_display_name=str(
                        session.get("display_name") or _current_user() or ""
                    ),
                )
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            application.logger.exception("图片库导出失败")
            return jsonify({"error": "导出失败，请联系管理员"}), 500

    @application.get("/api/export-records")
    @_login_required
    def list_export_records():
        return jsonify({"items": EXPORT_RECORD_STORE.list_records()})

    @application.get("/api/export-records/<record_id>/download")
    @_login_required
    def download_export_record(record_id: str):
        try:
            record, archive_path = EXPORT_RECORD_STORE.archive_for_download(record_id)
        except ExportExpiredError as exc:
            return jsonify({"error": str(exc)}), 410
        except (ExportRecordError, ExportArchiveMissingError) as exc:
            return jsonify({"error": str(exc)}), 404
        EXPORT_RECORD_STORE.mark_downloaded(record_id)
        return send_file(
            archive_path,
            as_attachment=True,
            download_name=record["archive_name"],
            mimetype="application/zip",
        )

    @application.get("/output/<path:relative_path>")
    @_login_required
    def output_file(relative_path: str):
        first_part = Path(relative_path).parts[:1]
        if first_part in {
            ("_system",),
            ("_image_exports",),
            ("_image_thumbnails",),
        }:
            abort(404)
        return _serve_output_file(
            OUTPUT_ROOT / relative_path,
            cache=first_part == ("_image_library",),
        )

    @application.post("/api/extract")
    @_login_required
    def extract():
        _check_csrf()
        _check_rate_limit()
        payload = request.get_json(silent=True) or {}
        url = str(payload.get("url", "")).strip()
        if not url:
            return jsonify({"error": "请粘贴 CRM 拜访详情链接"}), 400
        if len(url) > 4096:
            return jsonify({"error": "链接过长"}), 400

        try:
            with EXTRACT_LOCK:
                result = extract_images(url, OUTPUT_ROOT)
                IMAGE_LIBRARY.add_result(result, source_url=url)
        except (ValueError, CrmApiError) as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            application.logger.exception("提取图片失败")
            return jsonify({"error": "提取失败，请联系管理员查看服务日志"}), 500
        return jsonify(_serialize_result(result))

    @application.post("/api/batch-extract")
    @_login_required
    def batch_extract():
        _check_csrf()
        _check_rate_limit()
        upload = request.files.get("file")
        if upload is None or not upload.filename:
            return jsonify({"error": "请选择 Excel 文件"}), 400
        if Path(upload.filename).suffix.lower() != ".xlsx":
            return jsonify({"error": "仅支持 .xlsx 格式的 Excel 文件"}), 400

        try:
            links, input_stats = _parse_excel_links(upload.stream)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            application.logger.exception("批量提取图片失败")
            return jsonify({"error": "批量提取失败，请联系管理员查看服务日志"}), 500

        _prune_batch_jobs()
        job_id = secrets.token_urlsafe(18)
        now = time.time()
        chunk_count = max(1, (len(links) + BATCH_CHUNK_SIZE - 1) // BATCH_CHUNK_SIZE)
        _register_batch_job(
            job_id,
            {
                "owner": _current_user(),
                "status": "queued",
                "processed": 0,
                "total": len(links),
                "current_row": None,
                "succeeded": 0,
                "failed": 0,
                "image_count": 0,
                "retry_count": 0,
                "chunk_index": 1,
                "chunk_count": chunk_count,
                "links": links,
                "completed_records": [],
                "errors": [],
                **input_stats,
                "created_at": now,
                "updated_at": now,
            },
        )
        BATCH_QUEUE.put(job_id)
        return jsonify(
            {
                "job_id": job_id,
                "status": "queued",
                "total": len(links),
                "retry_count": 0,
                "chunk_index": 1,
                "chunk_count": chunk_count,
                **input_stats,
            }
        ), 202

    @application.get("/api/batch-extract/<job_id>")
    @_login_required
    def batch_extract_status(job_id: str):
        with BATCH_JOBS_LOCK:
            job = BATCH_JOBS.get(job_id)
            if job is None or job.get("owner") != _current_user():
                return jsonify({"error": "批量任务不存在或已过期"}), 404
            payload = _public_batch_job(job)
        return jsonify(payload)

    @application.errorhandler(413)
    def upload_too_large(_error):
        size_mb = MAX_UPLOAD_BYTES / 1024 / 1024
        return jsonify({"error": f"上传文件不能超过 {size_mb:g} MB"}), 413

    @application.errorhandler(403)
    @application.errorhandler(429)
    def handled_error(error):
        return jsonify({"error": error.description}), error.code

    _start_batch_worker(application)
    return application


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.environ.get("INFOLENS_HOST", "0.0.0.0"),
        port=int(os.environ.get("INFOLENS_PORT", "8765")),
        debug=False,
        threaded=True,
    )
