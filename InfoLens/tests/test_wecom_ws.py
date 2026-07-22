import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from infolens.extractor import ExtractResult, SavedImage
from infolens.wecom_ws import LongConnectionBot


CRM_LINK = (
    "https://crm.crb.cn/page/#/workCirclevisit"
    "?appuser=21483291&id=A343379C0B5443FFAE8E59FA7909C1C2"
)


class FakeClient:
    def __init__(self):
        self.handlers = {}
        self.stream_replies = []
        self.welcome_replies = []

    def on(self, event, handler):
        self.handlers[event] = handler

    async def reply_stream(self, frame, stream_id, content, finish):
        self.stream_replies.append(
            {
                "frame": frame,
                "stream_id": stream_id,
                "content": content,
                "finish": finish,
            }
        )

    async def reply_welcome(self, frame, body):
        self.welcome_replies.append({"frame": frame, "body": body})


class LongConnectionBotTests(unittest.IsolatedAsyncioTestCase):
    async def test_registers_supported_message_handlers(self):
        client = FakeClient()
        bot = LongConnectionBot(client, "/tmp/output")
        bot.register_handlers()
        self.assertEqual(
            set(client.handlers),
            {
                "message.text",
                "message.mixed",
                "message.voice",
                "event.enter_chat",
            },
        )

    async def test_distributes_link_then_worker_extracts_it(self):
        client = FakeClient()
        with tempfile.TemporaryDirectory() as output:
            calls = []

            def fake_extract(link, output_root, *, group_by_partner):
                calls.append((link, output_root, group_by_partner))
                output_dir = Path(output_root) / "测试业务员" / "测试终端_A343379C"
                output_dir.mkdir(parents=True)
                (output_dir / "image.jpg").write_bytes(b"image")
                return ExtractResult(
                    visit_id="A343379C",
                    terminal_name="测试终端",
                    partner_name="测试业务员",
                    output_dir=str(output_dir),
                    images=[
                        SavedImage(
                            index=1,
                            photoid=(
                                "private/TCOS/Z0019/O50002488/20260610/"
                                "1023275022/source.jpeg"
                            ),
                            filename="image.jpg",
                            url="",
                            size_bytes=5,
                        )
                    ],
                    metadata_file=str(output_dir / "metadata.json"),
                    visit_in_time="1782714405357",
                )

            bot = LongConnectionBot(client, output, extractor=fake_extract)
            frame = {
                "headers": {"req_id": "req-1"},
                "body": {
                    "msgid": "msg-1",
                    "msgtype": "text",
                    "from": {"userid": "zhangsan"},
                    "text": {"content": CRM_LINK},
                },
            }
            await bot.handle_message(frame)

            self.assertEqual(calls, [])
            self.assertEqual(len(client.stream_replies), 1)
            self.assertTrue(client.stream_replies[0]["finish"])
            self.assertIn("已分发 1 条链接", client.stream_replies[0]["content"])

            worker = asyncio.create_task(bot.run_worker(poll_interval=0.01))
            for _attempt in range(200):
                summaries = bot.store.summaries()
                if summaries and summaries[0]["quantity"] == 1:
                    break
                await asyncio.sleep(0.01)
            else:
                self.fail("分发任务未完成")
            bot.stop_worker()
            await worker

            self.assertEqual(len(calls), 1)
            self.assertTrue(calls[0][2])
            self.assertEqual(summaries[0]["business"], "测试业务员")
            self.assertEqual(summaries[0]["distributed_count"], 1)
            self.assertEqual(summaries[0]["pending_download_count"], 1)

            audit_file = (
                Path(output)
                / "测试业务员"
                / "测试终端_A343379C"
                / "wecom_submission.json"
            )
            audit = json.loads(audit_file.read_text(encoding="utf-8"))
            self.assertEqual(audit["wecom_user_id"], "zhangsan")
            self.assertEqual(audit["connection_mode"], "long_connection")

    async def test_replies_with_help_when_no_link_is_present(self):
        client = FakeClient()
        bot = LongConnectionBot(client, "/tmp/output")
        await bot.handle_message(
            {
                "body": {
                    "msgid": "msg-2",
                    "msgtype": "text",
                    "text": {"content": "你好"},
                }
            }
        )
        self.assertEqual(len(client.stream_replies), 1)
        self.assertTrue(client.stream_replies[0]["finish"])
        self.assertIn("没有识别到", client.stream_replies[0]["content"])


if __name__ == "__main__":
    unittest.main()
