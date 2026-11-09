"""服务器图片库维护命令：缩略图补全与本地数据备份。"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from infolens.image_library import ImageLibraryStore


def _configured_path(value: str | None, environment_name: str, fallback: Path) -> Path:
    configured = value or os.environ.get(environment_name)
    return Path(configured).expanduser().resolve() if configured else fallback.resolve()


def _backup_sqlite(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as source_connection:
        with sqlite3.connect(destination) as destination_connection:
            source_connection.backup(destination_connection)


def _copy_non_database_files(source_root: Path, destination_root: Path) -> int:
    copied = 0
    for source in source_root.rglob("*"):
        relative = source.relative_to(source_root)
        if source.is_dir():
            (destination_root / relative).mkdir(parents=True, exist_ok=True)
            continue
        if relative.parts[:1] == ("_system",) and (
            source.suffix in {".sqlite3", ".sqlite3-wal", ".sqlite3-shm"}
            or source.name.endswith((".sqlite3-wal", ".sqlite3-shm"))
        ):
            continue
        target = destination_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied += 1
    return copied


def _prune_backups(backup_root: Path, retention_days: int, current: Path) -> int:
    if retention_days <= 0:
        return 0
    cutoff = datetime.now() - timedelta(days=retention_days)
    removed = 0
    for candidate in backup_root.iterdir():
        if candidate == current or not candidate.is_dir():
            continue
        try:
            created_at = datetime.strptime(candidate.name, "%Y%m%d_%H%M%S")
        except ValueError:
            continue
        if created_at < cutoff:
            shutil.rmtree(candidate)
            removed += 1
    return removed


def generate_thumbnails(args: argparse.Namespace) -> int:
    output_root = _configured_path(args.output_root, "INFOLENS_OUTPUT_ROOT", Path("output"))
    store = ImageLibraryStore(
        output_root / "_system" / "image_library.sqlite3",
        output_root,
    )
    result = store.ensure_thumbnails(limit=args.limit)
    print(json.dumps(result, ensure_ascii=False))
    return 1 if result["failed"] else 0


def create_backup(args: argparse.Namespace) -> int:
    output_root = _configured_path(args.output_root, "INFOLENS_OUTPUT_ROOT", Path("output"))
    backup_root = _configured_path(args.backup_root, "INFOLENS_BACKUP_ROOT", Path("backups"))
    if not output_root.is_dir():
        raise SystemExit(f"输出目录不存在: {output_root}")
    try:
        backup_root.relative_to(output_root)
    except ValueError:
        pass
    else:
        raise SystemExit("备份目录不能放在输出目录内部")

    backup_root.mkdir(parents=True, exist_ok=True)
    snapshot = backup_root / datetime.now().strftime("%Y%m%d_%H%M%S")
    snapshot.mkdir()

    copied_files = 0
    if not args.database_only:
        copied_files = _copy_non_database_files(output_root, snapshot)

    database_count = 0
    system_root = output_root / "_system"
    if system_root.is_dir():
        for database in sorted(system_root.glob("*.sqlite3")):
            _backup_sqlite(database, snapshot / "_system" / database.name)
            database_count += 1

    manifest = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "source": str(output_root),
        "database_count": database_count,
        "copied_files": copied_files,
        "database_only": bool(args.database_only),
    }
    (snapshot / "backup-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    manifest["pruned_backups"] = _prune_backups(
        backup_root,
        args.retention_days,
        snapshot,
    )
    manifest["backup_path"] = str(snapshot)
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="InfoLens 图片库维护")
    subparsers = parser.add_subparsers(dest="command", required=True)

    thumbnail_parser = subparsers.add_parser("thumbnails", help="补全缩略图")
    thumbnail_parser.add_argument("--output-root")
    thumbnail_parser.add_argument("--limit", type=int, default=0)
    thumbnail_parser.set_defaults(handler=generate_thumbnails)

    backup_parser = subparsers.add_parser("backup", help="备份图片和 SQLite")
    backup_parser.add_argument("--output-root")
    backup_parser.add_argument("--backup-root")
    backup_parser.add_argument("--retention-days", type=int, default=30)
    backup_parser.add_argument("--database-only", action="store_true")
    backup_parser.set_defaults(handler=create_backup)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
