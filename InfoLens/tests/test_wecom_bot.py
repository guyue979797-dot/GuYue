import importlib
import json
import os
import tempfile
import time
import unittest
from unittest.mock import patch

from werkzeug.security import generate_password_hash

from infolens.wecom_bot import (
    WecomBotCrypto,
    WecomBotError,
    extract_crm_urls,
    message_text,
    send_response_url,
)


CRM_LINK = (
    "https://crm.crb.cn/page/#/workCirclevisit"
    "?appuser=21483291&id=A343379C0B5443FFAE8E59FA7909C1C2"
)
AES_KEY = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"


class WecomBotHelpersTests(unittest.TestCase):
    def test_extracts_supported_links_and_removes_duplicates(self):
        text = f"请处理：{CRM_LINK}。\n重复一次 {CRM_LINK}"
        self.assertEqual(extract_crm_urls(text), [CRM_LINK])

    def test_reads_text_from_mixed_message(self):
        message = {
            "msgtype": "mixed",
            "mixed": {
                "msg_item": [
                    {"msgtype": "image", "image": {"url": "https://image"}},
                    {"msgtype": "text", "text": {"content": CRM_LINK}},
                ]
            },
        }
        self.assertEqual(message_text(message), CRM_LINK)

    def test_crypto_round_trip_uses_json_protocol(self):
        crypto = WecomBotCrypto("test-token", AES_KEY)
        encrypted = json.loads(
            crypto.encrypt(
                {"msgtype": "text", "text": {"content": "hello"}},
                nonce="1234567890123456",
            )
        )
        plain = crypto.decrypt(
            json.dumps({"encrypt": encrypted["encrypt"]}).encode(),
            encrypted["msgsignature"],
            str(encrypted["timestamp"]),
            encrypted["nonce"],
        )
        self.assertEqual(plain["text"]["content"], "hello")

    def test_rejects_untrusted_response_url(self):
        crypto = WecomBotCrypto("test-token", AES_KEY)
        with self.assertRaises(WecomBotError):
            send_response_url(
                "https://example.com/callback",
                {"msgtype": "stream", "stream": {"finish": True}},
                crypto,
            )


class WecomBotCallbackTests(unittest.TestCase):
    def setUp(self):
        self.output = tempfile.TemporaryDirectory()
        self.environment = patch.dict(
            os.environ,
            {
                "INFOLENS_AUTH_MODE": "password",
                "INFOLENS_ENV": "production",
                "INFOLENS_OUTPUT_ROOT": self.output.name,
                "INFOLENS_USERNAME": "team",
                "INFOLENS_PASSWORD_HASH": generate_password_hash(
                    "correct horse",
                    method="pbkdf2:sha256",
                ),
                "INFOLENS_SESSION_SECRET": "a" * 64,
                "WECOM_BOT_ENABLED": "true",
                "WECOM_BOT_ID": "bot-123",
                "WECOM_BOT_TOKEN": "test-token",
                "WECOM_BOT_ENCODING_AES_KEY": AES_KEY,
            },
            clear=False,
        )
        self.environment.start()
        import web

        self.web = importlib.reload(web)
        self.client = self.web.app.test_client()
        self.crypto = WecomBotCrypto("test-token", AES_KEY)

    def tearDown(self):
        self.environment.stop()
        self.output.cleanup()

    def _encrypted_request(self, message):
        wrapper = json.loads(
            self.crypto.encrypt(message, nonce="1234567890123456")
        )
        query = (
            f"?msg_signature={wrapper['msgsignature']}"
            f"&timestamp={wrapper['timestamp']}"
            f"&nonce={wrapper['nonce']}"
        )
        body = json.dumps({"encrypt": wrapper["encrypt"]}).encode()
        return query, body

    def test_accepts_link_and_starts_background_job(self):
        message = {
            "msgid": "msg-001",
            "aibotid": "bot-123",
            "chattype": "single",
            "from": {"userid": "zhangsan"},
            "response_url": "https://qyapi.weixin.qq.com/cgi-bin/aibot/response",
            "create_time": int(time.time()),
            "msgtype": "text",
            "text": {"content": CRM_LINK},
        }
        query, body = self._encrypted_request(message)

        with patch.object(self.web.threading, "Thread") as thread:
            response = self.client.post(
                "/api/wecom/bot/callback" + query,
                data=body,
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 200)
        thread.assert_called_once()
        thread.return_value.start.assert_called_once()

        encrypted_reply = json.loads(response.get_data(as_text=True))
        reply = self.crypto.decrypt(
            json.dumps({"encrypt": encrypted_reply["encrypt"]}).encode(),
            encrypted_reply["msgsignature"],
            str(encrypted_reply["timestamp"]),
            encrypted_reply["nonce"],
        )
        self.assertEqual(reply["msgtype"], "stream")
        self.assertTrue(reply["stream"]["finish"])
        self.assertIn("已接收 1 条链接", reply["stream"]["content"])

    def test_verifies_callback_url(self):
        timestamp = str(int(time.time()))
        nonce = "1234567890123456"
        echo = self.crypto._encrypt_bytes(b"wecom-callback-ok")
        signature = self.crypto._signature(timestamp, nonce, echo)
        response = self.client.get(
            "/api/wecom/bot/callback",
            query_string={
                "msg_signature": signature,
                "timestamp": timestamp,
                "nonce": nonce,
                "echostr": echo,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), "wecom-callback-ok")

    def test_rejects_wrong_bot_id(self):
        message = {
            "msgid": "msg-002",
            "aibotid": "another-bot",
            "msgtype": "text",
            "text": {"content": CRM_LINK},
        }
        query, body = self._encrypted_request(message)
        response = self.client.post(
            "/api/wecom/bot/callback" + query,
            data=body,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
