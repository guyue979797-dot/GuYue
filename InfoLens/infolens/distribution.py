"""企业微信链接分发队列与业务汇总存储。"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from infolens.extractor import ExtractResult, parse_visit_url, photoid_name_field


@dataclass
class DistributionJob:
    id: str
    visit_id: str
    url: str
    message_id: str
    user_id: str
    chat_id: str
    status: str
    partner_name: str
    terminal_name: str
    fields: list[str]
    image_count: int
    output_dir: str
    error: str
    created_at: str
    downloaded_at: str


class DistributionStore:
    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path,
            timeout=30,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=30000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS distribution_jobs (
                    id TEXT PRIMARY KEY,
                    visit_id TEXT NOT NULL UNIQUE,
                    url TEXT NOT NULL,
                    message_id TEXT NOT NULL DEFAULT '',
                    user_id TEXT NOT NULL DEFAULT '',
                    chat_id TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    partner_name TEXT NOT NULL DEFAULT '',
                    terminal_name TEXT NOT NULL DEFAULT '',
                    fields_json TEXT NOT NULL DEFAULT '[]',
                    image_count INTEGER NOT NULL DEFAULT 0,
                    output_dir TEXT NOT NULL DEFAULT '',
                    error TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    started_at TEXT NOT NULL DEFAULT '',
                    completed_at TEXT NOT NULL DEFAULT '',
                    downloaded_at TEXT NOT NULL DEFAULT ''
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_distribution_status_created
                ON distribution_jobs(status, created_at)
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_distribution_partner
                ON distribution_jobs(partner_name, status)
                """
            )
            connection.execute(
                """
                UPDATE distribution_jobs
                SET status = 'queued', started_at = ''
                WHERE status = 'processing' AND started_at < ?
                """,
                (
                    (
                        datetime.now() - timedelta(minutes=30)
                    ).isoformat(timespec="seconds"),
                ),
            )
            connection.execute(
                """
                UPDATE distribution_jobs
                SET partner_name = TRIM(partner_name),
                    terminal_name = TRIM(terminal_name)
                """
            )

    def enqueue(
        self,
        *,
        job_id: str,
        url: str,
        message_id: str = "",
        user_id: str = "",
        chat_id: str = "",
    ) -> tuple[DistributionJob, bool]:
        visit_id = parse_visit_url(url)["id"]
        now = datetime.now().isoformat(timespec="seconds")
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT * FROM distribution_jobs WHERE visit_id = ?",
                (visit_id,),
            ).fetchone()
            if existing is not None:
                if existing["status"] == "failed":
                    connection.execute(
                        """
                        UPDATE distribution_jobs
                        SET url = ?, message_id = ?, user_id = ?, chat_id = ?,
                            status = 'queued', error = '', started_at = '',
                            completed_at = '', downloaded_at = ''
                        WHERE visit_id = ?
                        """,
                        (url, message_id, user_id, chat_id, visit_id),
                    )
                    row = connection.execute(
                        "SELECT * FROM distribution_jobs WHERE visit_id = ?",
                        (visit_id,),
                    ).fetchone()
                    connection.execute("COMMIT")
                    return self._row_to_job(row), False
                connection.execute("COMMIT")
                return self._row_to_job(existing), True

            connection.execute(
                """
                INSERT INTO distribution_jobs (
                    id, visit_id, url, message_id, user_id, chat_id,
                    status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)
                """,
                (job_id, visit_id, url, message_id, user_id, chat_id, now),
            )
            row = connection.execute(
                "SELECT * FROM distribution_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
            connection.execute("COMMIT")
        return self._row_to_job(row), False

    def claim_next(self) -> DistributionJob | None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT * FROM distribution_jobs
                WHERE status = 'queued'
                ORDER BY created_at, id
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                connection.execute("COMMIT")
                return None
            started_at = datetime.now().isoformat(timespec="seconds")
            connection.execute(
                """
                UPDATE distribution_jobs
                SET status = 'processing', started_at = ?, error = ''
                WHERE id = ?
                """,
                (started_at, row["id"]),
            )
            claimed = connection.execute(
                "SELECT * FROM distribution_jobs WHERE id = ?",
                (row["id"],),
            ).fetchone()
            connection.execute("COMMIT")
        return self._row_to_job(claimed)

    def complete(self, job_id: str, result: ExtractResult) -> None:
        fields = sorted(
            {
                photoid_name_field(image.photoid)
                for image in result.images
            }
        )
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE distribution_jobs
                SET status = 'completed', partner_name = ?, terminal_name = ?,
                    fields_json = ?, image_count = ?, output_dir = ?,
                    error = '', completed_at = ?
                WHERE id = ?
                """,
                (
                    result.partner_name.strip() or "未知业务员",
                    result.terminal_name.strip() or "未知终端",
                    json.dumps(fields, ensure_ascii=False),
                    len(result.images),
                    result.output_dir,
                    datetime.now().isoformat(timespec="seconds"),
                    job_id,
                ),
            )

    def fail(self, job_id: str, error: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE distribution_jobs
                SET status = 'failed', error = ?, completed_at = ?
                WHERE id = ?
                """,
                (
                    error[:1000],
                    datetime.now().isoformat(timespec="seconds"),
                    job_id,
                ),
            )

    def summaries(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM distribution_jobs
                ORDER BY created_at DESC, id DESC
                """
            ).fetchall()

        groups: dict[str, dict[str, Any]] = {}
        for row in rows:
            job = self._row_to_job(row)
            business = job.partner_name or "待识别"
            group = groups.setdefault(
                business,
                {
                    "business": business,
                    "field_values": set(),
                    "pending_field_values": set(),
                    "distributed_count": 0,
                    "queued_count": 0,
                    "processing_count": 0,
                    "failed_count": 0,
                    "image_count": 0,
                    "latest_at": job.created_at,
                },
            )
            group["distributed_count"] += 1
            group["image_count"] += job.image_count
            if job.status == "queued":
                group["queued_count"] += 1
            elif job.status == "processing":
                group["processing_count"] += 1
            elif job.status == "failed":
                group["failed_count"] += 1
            elif job.status == "completed":
                group["field_values"].update(job.fields)
                if not job.downloaded_at:
                    group["pending_field_values"].update(job.fields)

        payload = []
        for group in groups.values():
            payload.append(
                {
                    "business": group["business"],
                    "quantity": len(group["field_values"]),
                    "field_values": sorted(group["field_values"]),
                    "distributed_count": group["distributed_count"],
                    "pending_download_count": len(
                        group["pending_field_values"]
                    ),
                    "queued_count": group["queued_count"],
                    "processing_count": group["processing_count"],
                    "failed_count": group["failed_count"],
                    "image_count": group["image_count"],
                    "latest_at": group["latest_at"],
                }
            )
        return sorted(
            payload,
            key=lambda item: (
                item["business"] == "待识别",
                item["business"],
            ),
        )

    def completed_for_business(self, business: str) -> list[DistributionJob]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM distribution_jobs
                WHERE status = 'completed' AND partner_name = ?
                ORDER BY completed_at, id
                """,
                (business,),
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def mark_downloaded(self, business: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE distribution_jobs
                SET downloaded_at = ?
                WHERE status = 'completed' AND partner_name = ?
                """,
                (datetime.now().isoformat(timespec="seconds"), business),
            )

    def clear_all(self) -> int:
        """清空全部分发任务，返回删除的记录数。"""
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT COUNT(*) AS count FROM distribution_jobs"
            ).fetchone()
            deleted_count = int(row["count"])
            connection.execute("DELETE FROM distribution_jobs")
            connection.execute("COMMIT")
        return deleted_count

    def import_existing_outputs(self, output_root: str | Path) -> int:
        imported = 0
        root = Path(output_root)
        for audit_file in root.glob("**/wecom_submission.json"):
            metadata_file = audit_file.parent / "metadata.json"
            if not metadata_file.is_file():
                continue
            try:
                audit = json.loads(audit_file.read_text(encoding="utf-8"))
                metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
                visit_id = str(metadata["visit_id"])
                fields = sorted(
                    {
                        photoid_name_field(str(image.get("photoid") or ""))
                        for image in metadata.get("images") or []
                    }
                )
            except (KeyError, OSError, ValueError, json.JSONDecodeError):
                continue
            now = str(
                audit.get("received_at")
                or metadata.get("extracted_at")
                or datetime.now().isoformat(timespec="seconds")
            )
            record_id = f"{audit.get('task_id') or 'import'}-{visit_id[:12]}"
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO distribution_jobs (
                        id, visit_id, url, message_id, user_id, chat_id,
                        status, partner_name, terminal_name, fields_json,
                        image_count, output_dir, created_at, completed_at
                    ) VALUES (?, ?, '', ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record_id,
                        visit_id,
                        str(audit.get("wecom_message_id") or ""),
                        str(audit.get("wecom_user_id") or ""),
                        str(audit.get("wecom_chat_id") or ""),
                        str(
                            metadata.get("partner_name") or "未知业务员"
                        ).strip(),
                        str(
                            metadata.get("terminal_name") or "未知终端"
                        ).strip(),
                        json.dumps(fields, ensure_ascii=False),
                        len(metadata.get("images") or []),
                        str(audit_file.parent),
                        now,
                        now,
                    ),
                )
                imported += int(cursor.rowcount > 0)
        return imported

    @staticmethod
    def _row_to_job(row: sqlite3.Row) -> DistributionJob:
        return DistributionJob(
            id=row["id"],
            visit_id=row["visit_id"],
            url=row["url"],
            message_id=row["message_id"],
            user_id=row["user_id"],
            chat_id=row["chat_id"],
            status=row["status"],
            partner_name=row["partner_name"],
            terminal_name=row["terminal_name"],
            fields=json.loads(row["fields_json"] or "[]"),
            image_count=int(row["image_count"] or 0),
            output_dir=row["output_dir"],
            error=row["error"],
            created_at=row["created_at"],
            downloaded_at=row["downloaded_at"],
        )
