"""提取图片资产库：按月份与 field 归档、检索和导出。"""

from __future__ import annotations

import json
import re
import shutil
import sqlite3
import secrets
import urllib.parse
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

from infolens.extractor import ExtractResult, SavedImage, photoid_name_field


THUMBNAIL_SIZE = (480, 640)
THUMBNAIL_QUALITY = 76


def _safe_name(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "_", value.strip())
    return cleaned or "未知"


def _clean_photoid(photoid: str) -> str:
    return photoid.split("?", 1)[0]


def _month_from_time(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if re.fullmatch(r"\d{10,13}", raw):
        timestamp = int(raw)
        if len(raw) >= 13:
            timestamp = timestamp / 1000
        try:
            return datetime.fromtimestamp(timestamp).strftime("%Y-%m")
        except (OSError, OverflowError, ValueError):
            return ""
    normalized = raw.replace("/", "-")
    match = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", normalized)
    if match:
        return f"{match.group(1)}-{int(match.group(2)):02d}"
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return parsed.strftime("%Y-%m")


@dataclass
class LibraryImage:
    id: str
    field: str
    business: str
    customer_name: str
    month: str
    source_url: str
    visit_id: str
    photoid: str
    filename: str
    file_path: str
    size_bytes: int
    content_type: str
    created_at: str
    deleted_at: str


class ImageLibraryStore:
    """SQLite 图片库，图片文件统一复制到 _image_library 下保存。"""

    def __init__(self, database_path: str | Path, output_root: str | Path):
        self.database_path = Path(database_path)
        self.output_root = Path(output_root)
        self.library_root = self.output_root / "_image_library"
        self.thumbnail_root = self.output_root / "_image_thumbnails"
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.library_root.mkdir(parents=True, exist_ok=True)
        self.thumbnail_root.mkdir(parents=True, exist_ok=True)
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
                CREATE TABLE IF NOT EXISTS extracted_images (
                    id TEXT PRIMARY KEY,
                    field TEXT NOT NULL,
                    business TEXT NOT NULL DEFAULT '',
                    customer_name TEXT NOT NULL DEFAULT '',
                    month TEXT NOT NULL,
                    source_url TEXT NOT NULL DEFAULT '',
                    visit_id TEXT NOT NULL DEFAULT '',
                    photoid TEXT NOT NULL DEFAULT '',
                    filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    content_type TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    deleted_at TEXT NOT NULL DEFAULT '',
                    UNIQUE(visit_id, photoid)
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_extracted_images_month_field
                ON extracted_images(month, field, deleted_at)
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_extracted_images_business
                ON extracted_images(business, deleted_at)
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_extracted_images_library_query
                ON extracted_images(
                    deleted_at, month, business, field, customer_name,
                    created_at, id
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS image_library_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL DEFAULT ''
                )
                """
            )
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS image_policy_tags (
                    image_id TEXT NOT NULL,
                    policy_id TEXT NOT NULL,
                    terminal_code TEXT NOT NULL,
                    archived_by TEXT NOT NULL DEFAULT '',
                    archived_by_name TEXT NOT NULL DEFAULT '',
                    archived_at TEXT NOT NULL,
                    PRIMARY KEY(image_id, policy_id),
                    FOREIGN KEY(image_id) REFERENCES extracted_images(id)
                );
                CREATE INDEX IF NOT EXISTS idx_image_policy_tags_policy
                    ON image_policy_tags(policy_id, terminal_code, archived_at);

                CREATE TABLE IF NOT EXISTS photo_archive_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    policy_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    actor TEXT NOT NULL DEFAULT '',
                    actor_name TEXT NOT NULL DEFAULT '',
                    photo_count INTEGER NOT NULL DEFAULT 0,
                    terminal_count INTEGER NOT NULL DEFAULT 0,
                    skipped_count INTEGER NOT NULL DEFAULT 0,
                    operated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_photo_archive_logs_policy
                    ON photo_archive_logs(policy_id, operated_at DESC, id DESC);
                """
            )

    def _thumbnail_path(self, month: str, image_id: str) -> Path:
        return self.thumbnail_root / month / f"{image_id}.webp"

    def _source_path(self, image: LibraryImage) -> Path | None:
        source = Path(image.file_path)
        if not source.is_absolute():
            source = self.output_root / source
        source = source.resolve()
        try:
            source.relative_to(self.output_root.resolve())
        except ValueError:
            return None
        return source if source.is_file() else None

    @staticmethod
    def _build_thumbnail(source: Path, target: Path) -> bool:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.stem}.{secrets.token_hex(4)}.tmp")
        try:
            with Image.open(source) as opened:
                prepared = ImageOps.exif_transpose(opened)
                if prepared.mode in {"RGBA", "LA"} or (
                    prepared.mode == "P" and "transparency" in prepared.info
                ):
                    rgba = prepared.convert("RGBA")
                    background = Image.new("RGB", rgba.size, "white")
                    background.paste(rgba, mask=rgba.getchannel("A"))
                    prepared = background
                elif prepared.mode != "RGB":
                    prepared = prepared.convert("RGB")
                prepared.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                prepared.save(
                    temporary,
                    format="WEBP",
                    quality=THUMBNAIL_QUALITY,
                    method=4,
                )
            temporary.replace(target)
            return True
        except (OSError, ValueError, UnidentifiedImageError):
            temporary.unlink(missing_ok=True)
            return False

    def thumbnail_for(self, image_id: str) -> Path | None:
        image = self.get_image(image_id)
        if image is None:
            return None
        source = self._source_path(image)
        if source is None:
            return None
        thumbnail = self._thumbnail_path(image.month, image.id)
        if thumbnail.is_file() and thumbnail.stat().st_mtime >= source.stat().st_mtime:
            return thumbnail
        return thumbnail if self._build_thumbnail(source, thumbnail) else source

    def ensure_thumbnails(self, *, limit: int = 0) -> dict[str, int]:
        """补全缺失或过期缩略图，供服务器定时维护任务调用。"""
        normalized_limit = max(int(limit), 0)
        sql = """
            SELECT * FROM extracted_images
            WHERE deleted_at = ''
            ORDER BY created_at, id
        """
        params: tuple[int, ...] = ()
        if normalized_limit:
            sql += " LIMIT ?"
            params = (normalized_limit,)
        with self._connect() as connection:
            rows = connection.execute(sql, params).fetchall()

        stats = {
            "scanned": 0,
            "current": 0,
            "generated": 0,
            "missing_source": 0,
            "failed": 0,
        }
        for row in rows:
            stats["scanned"] += 1
            image = self._row_to_image(row)
            source = self._source_path(image)
            if source is None:
                stats["missing_source"] += 1
                continue
            thumbnail = self._thumbnail_path(image.month, image.id)
            if (
                thumbnail.is_file()
                and thumbnail.stat().st_mtime >= source.stat().st_mtime
            ):
                stats["current"] += 1
                continue
            if self._build_thumbnail(source, thumbnail):
                stats["generated"] += 1
            else:
                stats["failed"] += 1
        return stats

    def add_result(
        self,
        result: ExtractResult,
        *,
        source_url: str = "",
        created_at: str | None = None,
        copy_files: bool = True,
    ) -> int:
        """把一次提取结果复制进图片库，返回新增图片数。"""
        timestamp = created_at or datetime.now().isoformat(timespec="seconds")
        month = _month_from_time(result.visit_in_time)
        if not month:
            raise ValueError("无法识别 visit_in_time，图片未入库，避免按提取时间错误归类")
        added = 0
        pending_thumbnails: list[tuple[Path, Path]] = []
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            for image in result.images:
                try:
                    field = photoid_name_field(image.photoid)
                except ValueError:
                    continue
                source = Path(result.output_dir) / image.filename
                if not source.is_file():
                    continue
                photoid = _clean_photoid(image.photoid)
                existing = connection.execute(
                    """
                    SELECT id FROM extracted_images
                    WHERE visit_id = ? AND photoid = ?
                    """,
                    (result.visit_id, photoid),
                ).fetchone()
                if existing is not None:
                    continue

                image_id = secrets.token_hex(12)
                extension = source.suffix.lower() or ".jpg"
                filename = (
                    f"{_safe_name(result.visit_id[:8])}_"
                    f"{image.index:02d}_{image_id}{extension}"
                )
                if copy_files:
                    target_dir = self.library_root / month / _safe_name(field)
                    target_dir.mkdir(parents=True, exist_ok=True)
                    target = target_dir / filename
                    shutil.copy2(source, target)
                    stored_filename = filename
                else:
                    target = source
                    stored_filename = source.name
                try:
                    relative_path = str(target.relative_to(self.output_root))
                except ValueError:
                    relative_path = str(target)
                connection.execute(
                    """
                    INSERT INTO extracted_images (
                        id, field, business, customer_name, month, source_url,
                        visit_id, photoid, filename, file_path, size_bytes,
                        content_type, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        image_id,
                        field,
                        result.partner_name.strip() or "未知业务员",
                        result.terminal_name.strip() or "未知客户",
                        month,
                        source_url,
                        result.visit_id,
                        photoid,
                        stored_filename,
                        relative_path,
                        int(image.size_bytes or source.stat().st_size),
                        "",
                        timestamp,
                    ),
                )
                pending_thumbnails.append(
                    (target, self._thumbnail_path(month, image_id))
                )
                added += 1
            connection.execute("COMMIT")
        for source, thumbnail in pending_thumbnails:
            self._build_thumbnail(source, thumbnail)
        return added

    def import_existing_outputs(self) -> int:
        """把旧 metadata.json 同步进图片库；已同步过的图片会自动跳过。"""
        imported = 0
        if not self.output_root.exists():
            return 0
        for metadata_file in self.output_root.glob("**/metadata.json"):
            try:
                metadata_file.relative_to(self.library_root)
                continue
            except ValueError:
                pass
            try:
                data = json.loads(metadata_file.read_text(encoding="utf-8"))
                result = ExtractResult(
                    visit_id=str(data.get("visit_id") or ""),
                    terminal_name=str(data.get("terminal_name") or "未知客户"),
                    partner_name=str(data.get("partner_name") or "未知业务员"),
                    output_dir=str(metadata_file.parent),
                    metadata_file=str(metadata_file),
                    visit_in_time=str(data.get("visit_in_time") or ""),
                    images=[],
                )
                for index, item in enumerate(data.get("images") or [], start=1):
                    filename = str(item.get("filename") or "")
                    if not filename:
                        continue
                    result.images.append(
                        SavedImage(
                            index=int(item.get("index") or index),
                            photoid=str(item.get("photoid") or ""),
                            filename=filename,
                            url="",
                            size_bytes=int(item.get("size_bytes") or 0),
                        )
                    )
            except Exception:
                continue
            try:
                imported += self.add_result(
                    result,
                    created_at=str(
                        data.get("extracted_at")
                        or datetime.fromtimestamp(
                            metadata_file.stat().st_mtime
                        ).isoformat(timespec="seconds")
                    ),
                    copy_files=False,
                )
            except ValueError:
                continue
        return imported

    def query(
        self,
        *,
        fields: list[str] | None = None,
        terminal_codes: list[str] | None = None,
        terminal_code_match: str = "include",
        archive_policy_ids: list[str] | None = None,
        archive_policy_match: str = "archived",
        month: str = "",
        business: str = "",
        businesses: list[str] | None = None,
        customer_name: str = "",
        page: int = 1,
        page_size: int = 12,
    ) -> dict[str, Any]:
        conditions = ["deleted_at = ''"]
        params: list[Any] = []
        normalized_fields = [
            item.strip()
            for item in fields or []
            if item and item.strip()
        ]
        if normalized_fields:
            placeholders = ",".join("?" for _ in normalized_fields)
            conditions.append(f"field IN ({placeholders})")
            params.extend(normalized_fields)
        if month:
            conditions.append("month = ?")
            params.append(month)
        normalized_businesses = list(
            dict.fromkeys(
                item.strip()
                for item in [*(businesses or []), business]
                if item and item.strip()
            )
        )
        if normalized_businesses:
            placeholders = ",".join("?" for _ in normalized_businesses)
            conditions.append(f"business IN ({placeholders})")
            params.extend(normalized_businesses)
        if terminal_codes is not None:
            normalized_terminal_codes = list(
                dict.fromkeys(
                    str(item).strip()
                    for item in terminal_codes
                    if str(item).strip()
                )
            )
            if terminal_code_match not in {"include", "exclude"}:
                raise ValueError("终端政策条件必须为包含或不包含")
            if normalized_terminal_codes:
                placeholders = ",".join("?" for _ in normalized_terminal_codes)
                operator = "IN" if terminal_code_match == "include" else "NOT IN"
                conditions.append(f"field {operator} ({placeholders})")
                params.extend(normalized_terminal_codes)
            else:
                conditions.append(
                    "1 = 0" if terminal_code_match == "include" else "1 = 1"
                )
        normalized_archive_policy_ids = list(
            dict.fromkeys(
                str(item).strip()
                for item in archive_policy_ids or []
                if str(item).strip()
            )
        )
        if normalized_archive_policy_ids:
            if archive_policy_match not in {"archived", "unarchived"}:
                raise ValueError("归档条件必须为已归档或未归档")
            placeholders = ",".join("?" for _ in normalized_archive_policy_ids)
            exists_operator = (
                "EXISTS"
                if archive_policy_match == "archived"
                else "NOT EXISTS"
            )
            conditions.append(
                f"""
                {exists_operator} (
                    SELECT 1
                    FROM image_policy_tags AS archive_tag
                    JOIN extracted_images AS archived_image
                      ON archived_image.id = archive_tag.image_id
                    WHERE archived_image.deleted_at = ''
                      AND archived_image.month = extracted_images.month
                      AND archived_image.field = extracted_images.field
                      AND archive_tag.policy_id IN ({placeholders})
                )
                """
            )
            params.extend(normalized_archive_policy_ids)
        if customer_name:
            conditions.append("customer_name LIKE ?")
            params.append(f"%{customer_name}%")
        where = " AND ".join(conditions)
        normalized_page_size = min(max(int(page_size), 1), 50)
        with self._connect() as connection:
            summary = connection.execute(
                f"""
                SELECT
                    COUNT(*) AS image_count,
                    COUNT(DISTINCT field) AS field_count
                FROM extracted_images
                WHERE {where}
                """,
                params,
            ).fetchone()
            total_groups = int(
                connection.execute(
                    f"""
                    SELECT COUNT(*) AS count FROM (
                        SELECT 1 FROM extracted_images
                        WHERE {where}
                        GROUP BY month, field, business, customer_name
                    )
                    """,
                    params,
                ).fetchone()["count"]
            )
            total_pages = max(
                1,
                (total_groups + normalized_page_size - 1)
                // normalized_page_size,
            )
            normalized_page = min(max(int(page), 1), total_pages)
            offset = (normalized_page - 1) * normalized_page_size
            rows = connection.execute(
                f"""
                WITH selected_groups AS (
                    SELECT month, field, business, customer_name,
                           MAX(created_at) AS latest_created_at
                    FROM extracted_images
                    WHERE {where}
                    GROUP BY month, field, business, customer_name
                    ORDER BY latest_created_at DESC, field, customer_name, business
                    LIMIT ? OFFSET ?
                )
                SELECT image.* FROM extracted_images AS image
                JOIN selected_groups AS selected
                  ON image.month = selected.month
                 AND image.field = selected.field
                 AND image.business = selected.business
                 AND image.customer_name = selected.customer_name
                WHERE image.deleted_at = ''
                ORDER BY selected.latest_created_at DESC,
                         image.field, image.customer_name,
                         image.business, image.created_at, image.id
                """,
                [*params, normalized_page_size, offset],
            ).fetchall()
            matched_rows = connection.execute(
                f"""
                SELECT DISTINCT field FROM extracted_images
                WHERE {where}
                ORDER BY field
                """,
                params,
            ).fetchall()
        images = [self._row_to_image(row) for row in rows]
        groups: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        for image in images:
            key = (
                image.month,
                image.field,
                image.business,
                image.customer_name,
            )
            group = groups.setdefault(
                key,
                {
                    "month": image.month,
                    "field": image.field,
                    "business": image.business,
                    "customer_name": image.customer_name,
                    "images": [],
                },
            )
            group["images"].append(self._public_image(image))

        matched_fields = [row["field"] for row in matched_rows]
        requested = sorted(set(normalized_fields))
        return {
            "items": list(groups.values()),
            "image_count": int(summary["image_count"] or 0),
            "page_image_count": len(images),
            "field_count": int(summary["field_count"] or 0),
            "matched_fields": matched_fields,
            "missing_fields": [
                field for field in requested if field not in matched_fields
            ],
            "pagination": {
                "page": normalized_page,
                "page_size": normalized_page_size,
                "total_groups": total_groups,
                "total_pages": total_pages,
                "has_previous": normalized_page > 1,
                "has_next": normalized_page < total_pages,
            },
        }

    def months(self) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT month FROM extracted_images
                WHERE deleted_at = ''
                ORDER BY month DESC
                """
            ).fetchall()
        return [row["month"] for row in rows]

    def businesses(self) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT business FROM extracted_images
                WHERE deleted_at = '' AND business != ''
                ORDER BY business
                """
            ).fetchall()
        return [row["business"] for row in rows]

    def customer_names(self) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT customer_name FROM extracted_images
                WHERE deleted_at = '' AND customer_name != ''
                ORDER BY customer_name
                """
            ).fetchall()
        return [row["customer_name"] for row in rows]

    def get_images(self, image_ids: list[str]) -> list[LibraryImage]:
        ids = [image_id.strip() for image_id in image_ids if image_id.strip()]
        if not ids:
            return []
        placeholders = ",".join("?" for _ in ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT * FROM extracted_images
                WHERE deleted_at = '' AND id IN ({placeholders})
                ORDER BY field, customer_name, business, created_at, id
                """,
                ids,
            ).fetchall()
        return [self._row_to_image(row) for row in rows]

    def get_image(self, image_id: str) -> LibraryImage | None:
        normalized = image_id.strip()
        if not normalized:
            return None
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM extracted_images
                WHERE deleted_at = '' AND id = ?
                """,
                (normalized,),
            ).fetchone()
        return self._row_to_image(row) if row is not None else None

    def archive_images(
        self,
        image_ids: list[str],
        *,
        policy_id: str,
        month: str,
        actor: str,
        actor_name: str,
    ) -> dict[str, int]:
        normalized_ids = list(
            dict.fromkeys(
                image_id.strip() for image_id in image_ids if image_id.strip()
            )
        )
        if not normalized_ids:
            raise ValueError("请先选择需要归档的照片")
        if len(normalized_ids) > 5000:
            raise ValueError("单次最多归档5000张照片")
        placeholders = ",".join("?" for _ in normalized_ids)
        operated_at = datetime.now().isoformat(timespec="seconds")
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT id, field, month
                FROM extracted_images
                WHERE deleted_at = '' AND id IN ({placeholders})
                """,
                normalized_ids,
            ).fetchall()
            if len(rows) != len(normalized_ids):
                raise ValueError("部分照片不存在或已被删除，请刷新页面后重试")
            image_months = {row["month"] for row in rows}
            if image_months != {month}:
                raise ValueError("所选照片与当前月份不一致，请刷新页面后重新选择")

            connection.execute("BEGIN IMMEDIATE")
            inserted_count = 0
            terminal_codes: set[str] = set()
            for row in rows:
                terminal_codes.add(row["field"])
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO image_policy_tags (
                        image_id, policy_id, terminal_code,
                        archived_by, archived_by_name, archived_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["id"],
                        policy_id,
                        row["field"],
                        actor,
                        actor_name,
                        operated_at,
                    ),
                )
                inserted_count += max(int(cursor.rowcount or 0), 0)
            skipped_count = len(rows) - inserted_count
            connection.execute(
                """
                INSERT INTO photo_archive_logs (
                    policy_id, action_type, actor, actor_name,
                    photo_count, terminal_count, skipped_count, operated_at
                ) VALUES (?, 'archive', ?, ?, ?, ?, ?, ?)
                """,
                (
                    policy_id,
                    actor,
                    actor_name,
                    inserted_count,
                    len(terminal_codes),
                    skipped_count,
                    operated_at,
                ),
            )
            connection.execute("COMMIT")
        return {
            "selected_count": len(rows),
            "archived_count": inserted_count,
            "skipped_count": skipped_count,
            "terminal_count": len(terminal_codes),
        }

    def remove_archive_tag(
        self,
        image_id: str,
        *,
        policy_id: str,
        actor: str,
        actor_name: str,
    ) -> dict[str, Any] | None:
        normalized_image_id = image_id.strip()
        normalized_policy_id = policy_id.strip()
        if not normalized_image_id or not normalized_policy_id:
            return None
        operated_at = datetime.now().isoformat(timespec="seconds")
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT terminal_code
                FROM image_policy_tags
                WHERE image_id = ? AND policy_id = ?
                """,
                (normalized_image_id, normalized_policy_id),
            ).fetchone()
            if row is None:
                connection.execute("ROLLBACK")
                return None
            connection.execute(
                """
                DELETE FROM image_policy_tags
                WHERE image_id = ? AND policy_id = ?
                """,
                (normalized_image_id, normalized_policy_id),
            )
            connection.execute(
                """
                INSERT INTO photo_archive_logs (
                    policy_id, action_type, actor, actor_name,
                    photo_count, terminal_count, skipped_count, operated_at
                ) VALUES (?, 'unarchive', ?, ?, 1, 1, 0, ?)
                """,
                (
                    normalized_policy_id,
                    actor,
                    actor_name,
                    operated_at,
                ),
            )
            connection.execute("COMMIT")
        return {
            "image_id": normalized_image_id,
            "policy_id": normalized_policy_id,
            "terminal_code": row["terminal_code"],
            "removed_count": 1,
        }

    def policy_archive_stats(
        self, policy_ids: list[str]
    ) -> dict[str, dict[str, int]]:
        normalized_ids = list(
            dict.fromkeys(policy_id.strip() for policy_id in policy_ids if policy_id.strip())
        )
        if not normalized_ids:
            return {}
        placeholders = ",".join("?" for _ in normalized_ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT tags.policy_id,
                       COUNT(*) AS photo_count,
                       COUNT(DISTINCT tags.terminal_code) AS photographed_count
                FROM image_policy_tags AS tags
                JOIN extracted_images AS image ON image.id = tags.image_id
                WHERE image.deleted_at = ''
                  AND tags.policy_id IN ({placeholders})
                GROUP BY tags.policy_id
                """,
                normalized_ids,
            ).fetchall()
        return {
            row["policy_id"]: {
                "photo_count": int(row["photo_count"] or 0),
                "photographed_count": int(row["photographed_count"] or 0),
            }
            for row in rows
        }

    def archived_terminal_codes(self, policy_id: str) -> set[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT tags.terminal_code
                FROM image_policy_tags AS tags
                JOIN extracted_images AS image ON image.id = tags.image_id
                WHERE tags.policy_id = ? AND image.deleted_at = ''
                ORDER BY tags.terminal_code
                """,
                (policy_id.strip(),),
            ).fetchall()
        return {row["terminal_code"] for row in rows}

    def archived_policy_ids(self, month: str) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT tags.policy_id
                FROM image_policy_tags AS tags
                JOIN extracted_images AS image ON image.id = tags.image_id
                WHERE image.deleted_at = '' AND image.month = ?
                ORDER BY tags.policy_id
                """,
                (month.strip(),),
            ).fetchall()
        return [row["policy_id"] for row in rows]

    def archived_policy_ids_by_image(
        self,
        image_ids: list[str],
    ) -> dict[str, list[str]]:
        normalized_ids = list(
            dict.fromkeys(
                image_id.strip()
                for image_id in image_ids
                if image_id.strip()
            )
        )
        if not normalized_ids:
            return {}
        placeholders = ",".join("?" for _ in normalized_ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT tags.image_id, tags.policy_id
                FROM image_policy_tags AS tags
                JOIN extracted_images AS image ON image.id = tags.image_id
                WHERE image.deleted_at = ''
                  AND tags.image_id IN ({placeholders})
                ORDER BY tags.image_id, tags.archived_at, tags.policy_id
                """,
                normalized_ids,
            ).fetchall()
        result: dict[str, list[str]] = defaultdict(list)
        for row in rows:
            result[row["image_id"]].append(row["policy_id"])
        return dict(result)

    def archived_terminal_codes_by_policy(
        self,
        policy_ids: list[str],
    ) -> dict[str, set[str]]:
        normalized_ids = list(
            dict.fromkeys(
                policy_id.strip()
                for policy_id in policy_ids
                if policy_id.strip()
            )
        )
        if not normalized_ids:
            return {}
        placeholders = ",".join("?" for _ in normalized_ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT tags.policy_id, tags.terminal_code
                FROM image_policy_tags AS tags
                JOIN extracted_images AS image ON image.id = tags.image_id
                WHERE image.deleted_at = ''
                  AND tags.policy_id IN ({placeholders})
                GROUP BY tags.policy_id, tags.terminal_code
                """,
                normalized_ids,
            ).fetchall()
        result: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            result[row["policy_id"]].add(row["terminal_code"])
        return dict(result)

    def archived_terminals(self, policy_id: str) -> list[dict[str, str]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT tags.terminal_code,
                       MAX(image.customer_name) AS customer_name,
                       MAX(image.business) AS salesperson
                FROM image_policy_tags AS tags
                JOIN extracted_images AS image ON image.id = tags.image_id
                WHERE tags.policy_id = ? AND image.deleted_at = ''
                GROUP BY tags.terminal_code
                ORDER BY tags.terminal_code
                """,
                (policy_id.strip(),),
            ).fetchall()
        return [
            {
                "terminal_code": row["terminal_code"],
                "customer_name": row["customer_name"] or "",
                "salesperson": row["salesperson"] or "",
            }
            for row in rows
        ]

    def archived_images(self, policy_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT image.*, tags.archived_by, tags.archived_by_name,
                       tags.archived_at
                FROM image_policy_tags AS tags
                JOIN extracted_images AS image ON image.id = tags.image_id
                WHERE tags.policy_id = ? AND image.deleted_at = ''
                ORDER BY tags.terminal_code, image.customer_name,
                         tags.archived_at, image.created_at, image.id
                """,
                (policy_id.strip(),),
            ).fetchall()
        return [
            {
                "image": self._row_to_image(row),
                "archived_by": row["archived_by"],
                "archived_by_name": row["archived_by_name"],
                "archived_at": row["archived_at"],
            }
            for row in rows
        ]

    def latest_photo_archive_logs(
        self, policy_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        normalized_ids = list(
            dict.fromkeys(policy_id.strip() for policy_id in policy_ids if policy_id.strip())
        )
        if not normalized_ids:
            return {}
        placeholders = ",".join("?" for _ in normalized_ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT log.*
                FROM photo_archive_logs AS log
                JOIN (
                    SELECT policy_id, MAX(id) AS latest_id
                    FROM photo_archive_logs
                    WHERE policy_id IN ({placeholders})
                    GROUP BY policy_id
                ) AS latest ON latest.latest_id = log.id
                """,
                normalized_ids,
            ).fetchall()
        return {row["policy_id"]: dict(row) for row in rows}

    def record_photo_archive_export(
        self,
        policy_id: str,
        *,
        actor: str,
        actor_name: str,
        photo_count: int,
        terminal_count: int,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO photo_archive_logs (
                    policy_id, action_type, actor, actor_name,
                    photo_count, terminal_count, skipped_count, operated_at
                ) VALUES (?, 'export', ?, ?, ?, ?, 0, ?)
                """,
                (
                    policy_id.strip(),
                    actor,
                    actor_name,
                    max(int(photo_count), 0),
                    max(int(terminal_count), 0),
                    datetime.now().isoformat(timespec="seconds"),
                ),
            )

    def _public_image(self, image: LibraryImage) -> dict[str, Any]:
        return {
            "id": image.id,
            "field": image.field,
            "business": image.business,
            "customer_name": image.customer_name,
            "month": image.month,
            "filename": image.filename,
            "size_bytes": image.size_bytes,
            "thumbnail_url": f"/api/image-library/images/{image.id}/thumbnail",
            "url": "/output/" + "/".join(
                urllib.parse.quote(part) for part in image.file_path.split("/")
            ),
        }

    @staticmethod
    def _row_to_image(row: sqlite3.Row) -> LibraryImage:
        return LibraryImage(
            id=row["id"],
            field=row["field"],
            business=row["business"],
            customer_name=row["customer_name"],
            month=row["month"],
            source_url=row["source_url"],
            visit_id=row["visit_id"],
            photoid=row["photoid"],
            filename=row["filename"],
            file_path=row["file_path"],
            size_bytes=int(row["size_bytes"] or 0),
            content_type=row["content_type"],
            created_at=row["created_at"],
            deleted_at=row["deleted_at"],
        )
