"""Persistent audit records for single-link and batch image extraction."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


UTC = timezone.utc
METHODS = {"single_link", "batch"}
STATUSES = {"processing", "success", "partial_success", "failed"}


def utc_now() -> datetime:
    return datetime.now(UTC)


def to_utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="microseconds").replace(
        "+00:00",
        "Z",
    )


class ExtractionRecordStore:
    """SQLite-backed extraction history retained for a limited period."""

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
        connection.execute("PRAGMA busy_timeout=30000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS extraction_records (
                    id TEXT PRIMARY KEY,
                    owner_username TEXT NOT NULL DEFAULT '',
                    owner_display_name TEXT NOT NULL DEFAULT '',
                    method TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'processing',
                    image_count INTEGER NOT NULL DEFAULT 0,
                    terminal_count INTEGER NOT NULL DEFAULT 0,
                    error_information TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    completed_at TEXT NOT NULL DEFAULT '',
                    expires_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_extraction_records_created_at
                ON extraction_records(created_at DESC)
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_extraction_records_expires_at
                ON extraction_records(expires_at)
                """
            )

    def start_record(
        self,
        *,
        record_id: str,
        owner_username: str,
        owner_display_name: str,
        method: str,
        created_at: datetime | None = None,
        retention_days: int = 30,
    ) -> dict[str, Any]:
        if method not in METHODS:
            raise ValueError("新增方式无效")
        created = created_at or utc_now()
        expires = created + timedelta(days=retention_days)
        self.prune_expired(now=created)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO extraction_records (
                    id, owner_username, owner_display_name, method,
                    created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    owner_username.strip(),
                    owner_display_name.strip(),
                    method,
                    to_utc_iso(created),
                    to_utc_iso(expires),
                ),
            )
        return self.get_record(record_id)

    def complete_record(
        self,
        record_id: str,
        *,
        status: str,
        image_count: int = 0,
        terminal_count: int = 0,
        error_information: str = "",
        completed_at: datetime | None = None,
    ) -> dict[str, Any]:
        if status not in STATUSES - {"processing"}:
            raise ValueError("新增记录状态无效")
        timestamp = to_utc_iso(completed_at or utc_now())
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE extraction_records
                SET status = ?, image_count = ?, terminal_count = ?,
                    error_information = ?, completed_at = ?
                WHERE id = ?
                """,
                (
                    status,
                    max(0, int(image_count)),
                    max(0, int(terminal_count)),
                    error_information.strip(),
                    timestamp,
                    record_id,
                ),
            )
            if cursor.rowcount == 0:
                raise ValueError("新增记录不存在")
        return self.get_record(record_id)

    def list_records(self, *, now: datetime | None = None) -> list[dict[str, Any]]:
        self.prune_expired(now=now)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM extraction_records
                ORDER BY created_at DESC, id DESC
                """
            ).fetchall()
        return [self._public_record(row) for row in rows]

    def get_record(self, record_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM extraction_records WHERE id = ?",
                (record_id,),
            ).fetchone()
        if row is None:
            raise ValueError("新增记录不存在")
        return self._public_record(row)

    def prune_expired(self, *, now: datetime | None = None) -> int:
        current_iso = to_utc_iso(now or utc_now())
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM extraction_records WHERE expires_at <= ?",
                (current_iso,),
            )
        return max(0, int(cursor.rowcount))

    @staticmethod
    def _public_record(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "owner_username": row["owner_username"],
            "owner_display_name": row["owner_display_name"],
            "method": row["method"],
            "status": row["status"],
            "image_count": int(row["image_count"] or 0),
            "terminal_count": int(row["terminal_count"] or 0),
            "error_information": row["error_information"],
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
            "expires_at": row["expires_at"],
        }
