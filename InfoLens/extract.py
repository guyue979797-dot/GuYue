#!/usr/bin/env python3
"""从 CRM 拜访详情链接提取图片。

用法:
    python extract.py                          # 运行后粘贴链接
    python extract.py "https://crm.crb.cn/..."  # 直接传入链接
"""

from __future__ import annotations

import argparse
import sys

from infolens.crm_client import CrmApiError
from infolens.extractor import extract_images


def _print_result(result) -> None:
    print(f"\n终端: {result.terminal_name}")
    print(f"业务员: {result.partner_name}")
    print(f"保存目录: {result.output_dir}")
    print(f"共下载 {len(result.images)} 张图片:")
    for image in result.images:
        size_kb = image.size_bytes / 1024
        print(f"  - {image.filename} ({size_kb:.1f} KB)")
    print(f"元数据: {result.metadata_file}\n")


def _run_once(url: str, output: str) -> bool:
    url = url.strip()
    if not url:
        return False

    try:
        result = extract_images(url, output)
    except (ValueError, CrmApiError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return False

    _print_result(result)
    return True


def _interactive_loop(output: str) -> int:
    print("CRM 拜访图片提取工具")
    print("粘贴 visitDetail 链接后回车，输入 q 退出\n")

    while True:
        try:
            url = input("链接> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not url:
            continue
        if url.lower() in {"q", "quit", "exit"}:
            break

        _run_once(url, output)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="从 CRM 拜访详情链接下载图片")
    parser.add_argument("url", nargs="?", help="visitDetail 格式的 CRM 链接（省略则进入交互模式）")
    parser.add_argument(
        "-o",
        "--output",
        default="output",
        help="图片保存目录，默认 output/",
    )
    args = parser.parse_args()

    if args.url:
        return 0 if _run_once(args.url, args.output) else 1

    return _interactive_loop(args.output)


if __name__ == "__main__":
    raise SystemExit(main())
