"""从 CRM 拜访详情链接提取并下载图片。"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

from infolens.crm_client import (
    CrmApiError,
    get_visit_detail,
    get_work_circle_detail,
    resolve_photo_url,
)

VISIT_URL_PATTERN = re.compile(
    r"(?P<page_type>visitDetail|workCirclevisit)\?(?P<query>[^#]+)",
    re.IGNORECASE,
)


@dataclass
class SavedImage:
    index: int
    photoid: str
    filename: str
    url: str
    size_bytes: int


@dataclass
class ExtractResult:
    visit_id: str
    terminal_name: str
    partner_name: str
    output_dir: str
    images: list[SavedImage]
    metadata_file: str


def parse_visit_url(url: str) -> dict[str, str]:
    match = VISIT_URL_PATTERN.search(url)
    if not match:
        raise ValueError(
            "无法识别链接，请提供 visitDetail 或 workCirclevisit 格式的 CRM 链接"
        )

    params = urllib.parse.parse_qs(match.group("query"), keep_blank_values=True)
    flat = {key: values[0] for key, values in params.items()}

    page_type = match.group("page_type").lower()
    required = ["appuser", "id"]
    if page_type == "visitdetail":
        required.append("process_type")
    missing = [key for key in required if not flat.get(key)]
    if missing:
        raise ValueError(f"链接缺少必要参数: {', '.join(missing)}")

    return {
        "page_type": page_type,
        "appuser": flat["appuser"],
        "id": flat["id"],
        "process_type": flat.get("process_type", ""),
    }


def _safe_name(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "_", name.strip())
    return cleaned or "unknown"


def photoid_name_field(photoid: str) -> str:
    """提取 photoid 中日期路径后的字段，如 1023275022。"""
    path_parts = photoid.split("?", 1)[0].strip("/").split("/")
    for position, part in enumerate(path_parts[:-1]):
        if re.fullmatch(r"\d{8}", part):
            return _safe_name(path_parts[position + 1])
    raise ValueError(f"photoid 中未找到日期后的重命名字段: {photoid}")


def build_image_filename(
    photoid: str,
    terminal_name: str,
    partner_name: str,
    index: int,
    extension: str,
) -> str:
    """按“框选字段_终端_业务员_序号”生成图片文件名。"""
    return "_".join(
        (
            photoid_name_field(photoid),
            _safe_name(terminal_name),
            _safe_name(partner_name),
            f"{index:02d}",
        )
    ) + extension


def _guess_extension(photoid: str, content_type: str | None) -> str:
    path_part = photoid.split("?", 1)[0]
    suffix = Path(path_part).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
        return suffix

    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
    }
    if content_type:
        return mapping.get(content_type.split(";", 1)[0].strip(), ".jpg")
    return ".jpg"


def _download(url: str, dest: Path, timeout: float = 60) -> tuple[int, str | None]:
    attempts = max(1, int(os.environ.get("INFOLENS_DOWNLOAD_ATTEMPTS", "4")))
    req = urllib.request.Request(url, headers={"User-Agent": "InfoLens/1.0"})

    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content_type = resp.headers.get("Content-Type")
                data = resp.read()
            dest.write_bytes(data)
            return len(data), content_type
        except urllib.error.HTTPError as exc:
            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
            error: Exception = exc
        except (urllib.error.URLError, ConnectionError, TimeoutError) as exc:
            error = exc

        if attempt == attempts:
            raise error
        time.sleep(min(0.75 * (2 ** (attempt - 1)), 4))


def extract_images(url: str, output_root: str | Path = "output") -> ExtractResult:
    parsed = parse_visit_url(url)
    if parsed["page_type"] == "workcirclevisit":
        detail = get_work_circle_detail(parsed["appuser"], parsed["id"])
    else:
        detail = get_visit_detail(
            parsed["appuser"],
            parsed["id"],
            parsed["process_type"],
        )

    terminal_name = detail.get("terminal_name") or "未知终端"
    partner_name = detail.get("partner_name") or "未知业务员"
    photo_info = detail.get("photo_info") or []
    private_photos = [
        photo
        for photo in photo_info
        if str(photo.get("photoid") or "").startswith("private")
    ]

    if not photo_info:
        raise CrmApiError("该拜访记录没有图片")
    if not private_photos:
        raise CrmApiError("该拜访记录没有 photoid 以 private 开头的图片")

    folder_name = f"{_safe_name(terminal_name)}_{parsed['id'][:8]}"
    output_dir = Path(output_root) / folder_name
    output_dir.mkdir(parents=True, exist_ok=True)

    saved: list[SavedImage] = []
    for index, photo in enumerate(private_photos, start=1):
        photoid = photo.get("photoid") or ""

        image_url = resolve_photo_url(photoid)
        temp_path = output_dir / f"_{index}.tmp"
        try:
            size, content_type = _download(image_url, temp_path)
        except (urllib.error.URLError, ConnectionError, TimeoutError) as exc:
            temp_path.unlink(missing_ok=True)
            reason = getattr(exc, "reason", exc)
            raise CrmApiError(f"下载第 {index} 张图片失败: {reason}") from exc

        ext = _guess_extension(photoid, content_type)
        try:
            filename = build_image_filename(
                photoid,
                terminal_name,
                partner_name,
                index,
                ext,
            )
        except ValueError as exc:
            temp_path.unlink(missing_ok=True)
            raise CrmApiError(str(exc)) from exc
        final_path = output_dir / filename
        temp_path.replace(final_path)

        saved.append(
            SavedImage(
                index=index,
                photoid=photoid,
                filename=filename,
                url=image_url,
                size_bytes=size,
            )
        )

    metadata = {
        "visit_id": parsed["id"],
        "process_type": parsed["process_type"],
        "terminal_name": terminal_name,
        "partner_name": partner_name,
        "visit_in_time": detail.get("visit_in_time"),
        "visit_out_time": detail.get("visit_out_time"),
        "leaving_note": detail.get("leaving_note"),
        "extracted_at": datetime.now().isoformat(timespec="seconds"),
        "images": [
            {
                **asdict(item),
                "photoid": item.photoid.split("?", 1)[0],
                "url": "",
            }
            for item in saved
        ],
    }
    metadata_file = output_dir / "metadata.json"
    metadata_file.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return ExtractResult(
        visit_id=parsed["id"],
        terminal_name=terminal_name,
        partner_name=partner_name,
        output_dir=str(output_dir),
        images=saved,
        metadata_file=str(metadata_file),
    )
