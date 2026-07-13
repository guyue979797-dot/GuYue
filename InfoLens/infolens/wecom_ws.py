"""企业微信 API 模式智能机器人 WebSocket 长连接服务。"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from infolens.crm_client import CrmApiError
from infolens.distribution import DistributionJob, DistributionStore
from infolens.extractor import ExtractResult, extract_images
from infolens.image_library import ImageLibraryStore
from infolens.wecom_bot import extract_crm_urls, message_text


LOGGER = logging.getLogger("infolens.wecom_ws")


def _task_id() -> str:
    return f"IL{datetime.now():%Y%m%d%H%M%S}{secrets.token_hex(2).upper()}"


class LongConnectionBot:
    """处理长连接消息，并复用 InfoLens 图片提取能力。"""

    def __init__(
        self,
        client: Any,
        output_root: str | Path,
        *,
        max_links: int = 10,
        extractor: Callable[..., ExtractResult] = extract_images,
        store: DistributionStore | None = None,
        image_library: ImageLibraryStore | None = None,
    ):
        self.client = client
        self.output_root = Path(output_root)
        self.max_links = max_links
        self.extractor = extractor
        self.store = store or DistributionStore(
            self.output_root / "_system" / "distributions.sqlite3"
        )
        self.image_library = image_library or ImageLibraryStore(
            self.output_root / "_system" / "image_library.sqlite3",
            self.output_root,
        )
        if os.environ.get("INFOLENS_DISTRIBUTION_IMPORT_EXISTING", "").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }:
            self.store.import_existing_outputs(self.output_root)
        if os.environ.get("INFOLENS_IMAGE_LIBRARY_IMPORT_EXISTING", "").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }:
            self.image_library.import_existing_outputs()
        self._stop_worker = asyncio.Event()

    def register_handlers(self) -> None:
        for event_name in ("message.text", "message.mixed", "message.voice"):
            self.client.on(event_name, self.handle_message)
        self.client.on("event.enter_chat", self.handle_enter_chat)

    async def handle_enter_chat(self, frame: dict[str, Any]) -> None:
        await self.client.reply_welcome(
            frame,
            {
                "msgtype": "text",
                "text": {
                    "content": (
                        "发送 CRM 拜访详情链接，我会自动提取图片并按业务员归档。"
                    )
                },
            },
        )

    async def handle_message(self, frame: dict[str, Any]) -> None:
        body = frame.get("body") or {}
        links = extract_crm_urls(
            message_text(body),
            max_links=self.max_links,
        )
        if not links:
            await self.client.reply_stream(
                frame,
                f"help-{secrets.token_hex(6)}",
                "没有识别到 CRM 拜访链接。\n"
                "请发送包含 `visitDetail` 或 `workCirclevisit` 的链接。",
                True,
            )
            return

        task_id = _task_id()
        distributed = 0
        duplicates = 0
        for position, link in enumerate(links, start=1):
            _job, duplicate = self.store.enqueue(
                job_id=f"{task_id}-{position:02d}",
                url=link,
                message_id=str(body.get("msgid") or ""),
                user_id=str((body.get("from") or {}).get("userid") or ""),
                chat_id=str(body.get("chatid") or ""),
            )
            if duplicate:
                duplicates += 1
            else:
                distributed += 1

        await self.client.reply_stream(
            frame,
            f"{task_id}-distributed",
            f"已分发 {distributed} 条链接到系统"
            + (f"，跳过 {duplicates} 条重复链接" if duplicates else "")
            + f"。\n分发批次：`{task_id}`",
            True,
        )

    async def run_worker(self, poll_interval: float = 0.8) -> None:
        """持续消费 SQLite 队列；消息处理器本身只负责链接入库。"""
        while not self._stop_worker.is_set():
            job = await asyncio.to_thread(self.store.claim_next)
            if job is None:
                try:
                    await asyncio.wait_for(
                        self._stop_worker.wait(),
                        timeout=poll_interval,
                    )
                except TimeoutError:
                    pass
                continue
            try:
                result = await asyncio.to_thread(
                    self.extractor,
                    job.url,
                    self.output_root,
                    group_by_partner=True,
                )
                await asyncio.to_thread(
                    self._complete_job,
                    job,
                    result,
                )
            except (ValueError, CrmApiError) as exc:
                await asyncio.to_thread(self.store.fail, job.id, str(exc))
            except Exception:
                LOGGER.exception("分发任务 %s 处理失败", job.id)
                await asyncio.to_thread(
                    self.store.fail,
                    job.id,
                    "处理失败，请联系管理员",
                )

    def stop_worker(self) -> None:
        self._stop_worker.set()

    def _complete_job(
        self,
        job: DistributionJob,
        result: ExtractResult,
    ) -> None:
        audit = {
            "task_id": job.id.rsplit("-", 1)[0],
            "distribution_job_id": job.id,
            "wecom_message_id": job.message_id,
            "wecom_user_id": job.user_id,
            "wecom_chat_id": job.chat_id or None,
            "received_at": job.created_at,
            "completed_at": datetime.now().isoformat(timespec="seconds"),
            "connection_mode": "long_connection",
        }
        (Path(result.output_dir) / "wecom_submission.json").write_text(
            json.dumps(audit, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.image_library.add_result(result, source_url=job.url)
        self.store.complete(job.id, result)


async def run() -> None:
    from wecom_aibot_sdk import WSClient

    enabled = os.environ.get("WECOM_BOT_ENABLED", "false").strip().lower()
    mode = os.environ.get("WECOM_BOT_MODE", "").strip().lower()
    if enabled not in {"1", "true", "yes", "on"} or mode != "long_connection":
        raise RuntimeError(
            "启动长连接需要 WECOM_BOT_ENABLED=true 且 "
            "WECOM_BOT_MODE=long_connection"
        )

    bot_id = os.environ.get("WECOM_BOT_ID", "").strip()
    secret = os.environ.get("WECOM_BOT_SECRET", "").strip()
    if not bot_id or not secret:
        raise RuntimeError("长连接模式需要 WECOM_BOT_ID 和 WECOM_BOT_SECRET")

    output_root = Path(
        os.environ.get(
            "INFOLENS_OUTPUT_ROOT",
            Path(__file__).resolve().parents[1] / "output",
        )
    ).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    client = WSClient(
        bot_id=bot_id,
        secret=secret,
        max_reconnect_attempts=-1,
        plug_version="InfoLens/1.0",
        ws_options={
            "proxy": os.environ.get("WECOM_BOT_PROXY") or None,
        },
    )
    bot = LongConnectionBot(
        client,
        output_root,
        max_links=int(os.environ.get("WECOM_BOT_MAX_LINKS", "10")),
    )
    bot.register_handlers()
    client.on("authenticated", lambda: LOGGER.info("企业微信长连接认证成功"))
    client.on("reconnecting", lambda attempt: LOGGER.warning("正在进行第 %s 次重连", attempt))
    client.on("error", lambda error: LOGGER.error("企业微信长连接错误：%s", error))

    worker_task = asyncio.create_task(bot.run_worker())
    await client.connect()
    try:
        await asyncio.Event().wait()
    finally:
        bot.stop_worker()
        await worker_task
        await client.disconnect()


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("INFOLENS_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        LOGGER.info("企业微信长连接服务已停止")


if __name__ == "__main__":
    main()
