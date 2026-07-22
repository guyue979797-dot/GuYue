"""提取图片资产库：按月份与 field 归档、检索和导出。"""

from __future__ import annotations

import json
import re
import shutil
import sqlite3
import secrets
import urllib.parse
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
        month: str = "",
        business: str = "",
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
        if business:
            conditions.append("business = ?")
            params.append(business)
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
                    SELECT month, field, business, customer_name
                    FROM extracted_images
                    WHERE {where}
                    GROUP BY month, field, business, customer_name
                    ORDER BY month DESC, field, customer_name, business
                    LIMIT ? OFFSET ?
                )
                SELECT image.* FROM extracted_images AS image
                JOIN selected_groups AS selected
                  ON image.month = selected.month
                 AND image.field = selected.field
                 AND image.business = selected.business
                 AND image.customer_name = selected.customer_name
                WHERE image.deleted_at = ''
                ORDER BY image.month DESC, image.field, image.customer_name,
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
