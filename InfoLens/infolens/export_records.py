"""Persistent export history and expiring archive management."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable


UTC = timezone.utc


class ExportRecordError(ValueError):
    """Base error for export record operations."""


class ExportExpiredError(ExportRecordError):
    """Raised when an export archive is no longer downloadable."""


class ExportArchiveMissingError(ExportRecordError):
    """Raised when an export archive cannot be found on disk."""


def utc_now() -> datetime:
    return datetime.now(UTC)


def to_utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_utc_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


class ExportRecordStore:
    """SQLite export history with archives stored under the output root."""

    def __init__(self, database_path: str | Path, output_root: str | Path):
        self.database_path = Path(database_path)
        self.output_root = Path(output_root).resolve()
        self.export_root = self.output_root / "_image_exports"
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.export_root.mkdir(parents=True, exist_ok=True)
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
                CREATE TABLE IF NOT EXISTS export_records (
                    id TEXT PRIMARY KEY,
                    description TEXT NOT NULL,
                    owner_username TEXT NOT NULL DEFAULT '',
                    owner_display_name TEXT NOT NULL DEFAULT '',
                    archive_name TEXT NOT NULL,
                    archive_path TEXT NOT NULL,
                    image_count INTEGER NOT NULL DEFAULT 0,
                    field_count INTEGER NOT NULL DEFAULT 0,
                    archive_size_bytes INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'available',
                    download_count INTEGER NOT NULL DEFAULT 0,
                    last_download_at TEXT NOT NULL DEFAULT ''
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_export_records_created_at
                ON export_records(created_at DESC)
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS export_record_items (
                    record_id TEXT NOT NULL,
                    image_id TEXT NOT NULL,
                    field TEXT NOT NULL,
                    PRIMARY KEY(record_id, image_id),
                    FOREIGN KEY(record_id) REFERENCES export_records(id)
                        ON DELETE CASCADE
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_export_record_items_field
                ON export_record_items(record_id, field)
                """
            )

    def create_record(
        self,
        *,
        record_id: str,
        description: str,
        owner_username: str,
        owner_display_name: str,
        archive_name: str,
        archive_path: str,
        image_items: Iterable[tuple[str, str]],
        archive_size_bytes: int,
        created_at: datetime | None = None,
        retention_days: int = 30,
    ) -> dict[str, Any]:
        created = created_at or utc_now()
        expires = created + timedelta(days=retention_days)
        items = list(dict.fromkeys(image_items))
        fields = sorted({field for _image_id, field in items})
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                INSERT INTO export_records (
                    id, description, owner_username, owner_display_name,
                    archive_name, archive_path, image_count, field_count,
                    archive_size_bytes, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    description,
                    owner_username,
                    owner_display_name,
                    archive_name,
                    archive_path,
                    len(items),
                    len(fields),
                    int(archive_size_bytes),
                    to_utc_iso(created),
                    to_utc_iso(expires),
                ),
            )
            connection.executemany(
                """
                INSERT INTO export_record_items (record_id, image_id, field)
                VALUES (?, ?, ?)
                """,
                [(record_id, image_id, field) for image_id, field in items],
            )
        return self.get_record(record_id)

    def list_records(self, *, now: datetime | None = None) -> list[dict[str, Any]]:
        self.expire_records(now=now)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM export_records
                ORDER BY created_at DESC, id DESC
                """
            ).fetchall()
            return [self._public_record(connection, row) for row in rows]

    def get_record(
        self,
        record_id: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        self.expire_records(now=now)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM export_records WHERE id = ?",
                (record_id,),
            ).fetchone()
            if row is None:
                raise ExportRecordError("导出记录不存在")
            return self._public_record(connection, row)

    def archive_for_download(
        self,
        record_id: str,
        *,
        now: datetime | None = None,
    ) -> tuple[dict[str, Any], Path]:
        self.expire_records(now=now)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM export_records WHERE id = ?",
                (record_id,),
            ).fetchone()
            if row is None:
                raise ExportRecordError("导出记录不存在")
            record = self._public_record(connection, row)
        if record["status"] == "expired":
            raise ExportExpiredError("导出链接已过期")
        if record["status"] != "available":
            raise ExportArchiveMissingError("导出文件不存在")
        archive_path = self._resolve_archive(row["archive_path"])
        if not archive_path.is_file():
            with self._connect() as connection:
                connection.execute(
                    "UPDATE export_records SET status = 'missing' WHERE id = ?",
                    (record_id,),
                )
            raise ExportArchiveMissingError("导出文件不存在")
        return record, archive_path

    def mark_downloaded(
        self,
        record_id: str,
        *,
        downloaded_at: datetime | None = None,
    ) -> None:
        timestamp = to_utc_iso(downloaded_at or utc_now())
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE export_records
                SET download_count = download_count + 1,
                    last_download_at = ?
                WHERE id = ?
                """,
                (timestamp, record_id),
            )

    def expire_records(self, *, now: datetime | None = None) -> int:
        current = now or utc_now()
        current_iso = to_utc_iso(current)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, archive_path FROM export_records
                WHERE status = 'available' AND expires_at <= ?
                """,
                (current_iso,),
            ).fetchall()
            if not rows:
                return 0
            connection.execute("BEGIN IMMEDIATE")
            connection.executemany(
                "UPDATE export_records SET status = 'expired' WHERE id = ?",
                [(row["id"],) for row in rows],
            )
        for row in rows:
            try:
                self._resolve_archive(row["archive_path"]).unlink(missing_ok=True)
            except (OSError, ValueError):
                continue
        return len(rows)

    def _resolve_archive(self, relative_path: str) -> Path:
        archive_path = (self.output_root / relative_path).resolve()
        try:
            archive_path.relative_to(self.export_root.resolve())
        except ValueError as exc:
            raise ExportArchiveMissingError("导出文件路径无效") from exc
        return archive_path

    @staticmethod
    def _public_record(
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> dict[str, Any]:
        fields = [
            item["field"]
            for item in connection.execute(
                """
                SELECT DISTINCT field FROM export_record_items
                WHERE record_id = ? ORDER BY field
                """,
                (row["id"],),
            ).fetchall()
        ]
        status = row["status"]
        return {
            "id": row["id"],
            "description": row["description"],
            "owner_username": row["owner_username"],
            "owner_display_name": row["owner_display_name"],
            "archive_name": row["archive_name"],
            "archive_size_bytes": int(row["archive_size_bytes"] or 0),
            "image_count": int(row["image_count"] or 0),
            "field_count": int(row["field_count"] or 0),
            "fields": fields,
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
            "status": status,
            "download_count": int(row["download_count"] or 0),
            "last_download_at": row["last_download_at"],
            "download_url": (
                f"/api/export-records/{row['id']}/download"
                if status == "available"
                else ""
            ),
        }
