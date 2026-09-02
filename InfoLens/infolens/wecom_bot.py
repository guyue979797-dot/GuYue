"""企业微信 API 模式智能机器人的 JSON 回调辅助函数。"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import secrets
import struct
import time
import urllib.parse
from collections import OrderedDict
from threading import Lock
from typing import Any

import requests
from Crypto.Cipher import AES

from infolens.extractor import parse_visit_url


URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
TRAILING_PUNCTUATION = ".,;:!?，。；：！？、）)]}》】"


class WecomBotError(Exception):
    """企业微信回调验证、解密或发送失败。"""


class MessageDeduplicator:
    """单进程消息去重；避免企业微信重试导致同一任务重复执行。"""

    def __init__(self, max_size: int = 2000, ttl_seconds: int = 3600):
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds
        self._items: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._lock = Lock()

    def remember(self, message_id: str, task_id: str) -> tuple[bool, str]:
        if not message_id:
            return False, task_id
        now = time.time()
        with self._lock:
            while self._items:
                oldest_id, (expires_at, _task_id) = next(iter(self._items.items()))
                if expires_at >= now:
                    break
                self._items.pop(oldest_id, None)
            existing = self._items.get(message_id)
            if existing:
                return True, existing[1]
            while len(self._items) >= self._max_size:
                self._items.popitem(last=False)
            self._items[message_id] = (now + self._ttl_seconds, task_id)
        return False, task_id


class WecomBotCrypto:
    """封装企业微信智能机器人要求的 JSON 加解密协议。"""

    def __init__(self, token: str, encoding_aes_key: str):
        if not token:
            raise ValueError("WECOM_BOT_TOKEN 不能为空")
        if len(encoding_aes_key) != 43:
            raise ValueError("WECOM_BOT_ENCODING_AES_KEY 必须为 43 个字符")
        try:
            self._key = base64.b64decode(encoding_aes_key + "=", validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("WECOM_BOT_ENCODING_AES_KEY 不是有效 Base64") from exc
        if len(self._key) != 32:
            raise ValueError("WECOM_BOT_ENCODING_AES_KEY 解码后必须为 32 字节")
        self._token = token

    def _signature(
        self,
        timestamp: str,
        nonce: str,
        encrypted: str,
    ) -> str:
        values = sorted((self._token, str(timestamp), str(nonce), encrypted))
        return hashlib.sha1("".join(values).encode("utf-8")).hexdigest()

    def _decrypt_bytes(self, encrypted: str) -> bytes:
        try:
            ciphertext = base64.b64decode(encrypted, validate=True)
            plain = AES.new(
                self._key,
                AES.MODE_CBC,
                iv=self._key[:16],
            ).decrypt(ciphertext)
        except (binascii.Error, ValueError, TypeError) as exc:
            raise WecomBotError("企业微信 AES 消息解密失败") from exc

        if not plain:
            raise WecomBotError("企业微信 AES 消息为空")
        padding = plain[-1]
        if padding < 1 or padding > 32 or plain[-padding:] != bytes([padding]) * padding:
            raise WecomBotError("企业微信 AES 消息填充无效")
        plain = plain[:-padding]
        if len(plain) < 20:
            raise WecomBotError("企业微信 AES 消息长度无效")

        message_length = struct.unpack("!I", plain[16:20])[0]
        message_end = 20 + message_length
        if message_end > len(plain):
            raise WecomBotError("企业微信 AES 消息正文长度无效")
        if plain[message_end:] != b"":
            raise WecomBotError("企业微信智能机器人 ReceiveId 不匹配")
        return plain[20:message_end]

    def _encrypt_bytes(self, plain: bytes) -> str:
        packed = os.urandom(16) + struct.pack("!I", len(plain)) + plain
        padding = 32 - (len(packed) % 32)
        packed += bytes([padding]) * padding
        ciphertext = AES.new(
            self._key,
            AES.MODE_CBC,
            iv=self._key[:16],
        ).encrypt(packed)
        return base64.b64encode(ciphertext).decode("ascii")

    def verify_url(
        self,
        msg_signature: str,
        timestamp: str,
        nonce: str,
        echo_str: str,
    ) -> str:
        expected = self._signature(timestamp, nonce, echo_str)
        if not hmac.compare_digest(expected, msg_signature):
            raise WecomBotError("企业微信回调 URL 签名无效")
        try:
            return self._decrypt_bytes(echo_str).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise WecomBotError("企业微信回调 echostr 不是 UTF-8") from exc

    def decrypt(
        self,
        body: bytes,
        msg_signature: str,
        timestamp: str,
        nonce: str,
    ) -> dict[str, Any]:
        try:
            wrapper = json.loads(body)
            encrypted = str(wrapper["encrypt"])
        except (TypeError, KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WecomBotError("企业微信加密消息格式无效") from exc
        expected = self._signature(timestamp, nonce, encrypted)
        if not hmac.compare_digest(expected, msg_signature):
            raise WecomBotError("企业微信消息签名无效")
        try:
            return json.loads(self._decrypt_bytes(encrypted))
        except (TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WecomBotError("企业微信消息正文不是有效 JSON") from exc

    def encrypt(self, payload: dict[str, Any], nonce: str | None = None) -> str:
        reply_nonce = nonce or "".join(
            secrets.choice("0123456789") for _ in range(16)
        )
        plain = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        timestamp = str(int(time.time()))
        encrypted = self._encrypt_bytes(plain.encode("utf-8"))
        return json.dumps(
            {
                "encrypt": encrypted,
                "msgsignature": self._signature(
                    timestamp,
                    reply_nonce,
                    encrypted,
                ),
                "timestamp": int(timestamp),
                "nonce": reply_nonce,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )


def validate_callback_timestamp(timestamp: str, max_age_seconds: int = 600) -> None:
    try:
        request_time = int(timestamp)
    except (TypeError, ValueError) as exc:
        raise WecomBotError("企业微信回调缺少有效时间戳") from exc
    if abs(int(time.time()) - request_time) > max_age_seconds:
        raise WecomBotError("企业微信回调时间戳已过期")


def message_text(message: dict[str, Any]) -> str:
    """从 text、mixed 或 voice 消息中提取可搜索链接的文字。"""
    msg_type = message.get("msgtype")
    if msg_type == "text":
        return str((message.get("text") or {}).get("content") or "")
    if msg_type == "voice":
        return str((message.get("voice") or {}).get("content") or "")
    if msg_type == "mixed":
        parts = []
        for item in (message.get("mixed") or {}).get("msg_item") or []:
            if item.get("msgtype") == "text":
                parts.append(str((item.get("text") or {}).get("content") or ""))
        return "\n".join(parts)
    return ""


def extract_crm_urls(text: str, max_links: int = 10) -> list[str]:
    """提取并校验 InfoLens 支持的 CRM 链接，保持原始顺序并去重。"""
    links: list[str] = []
    seen: set[str] = set()
    for match in URL_PATTERN.findall(text):
        candidate = match.rstrip(TRAILING_PUNCTUATION)
        try:
            parse_visit_url(candidate)
        except ValueError:
            continue
        if candidate not in seen:
            seen.add(candidate)
            links.append(candidate)
        if len(links) >= max_links:
            break
    return links


def stream_reply(stream_id: str, content: str) -> dict[str, Any]:
    return {
        "msgtype": "stream",
        "stream": {
            "id": stream_id,
            "finish": True,
            "content": content,
        },
    }


def text_reply(content: str) -> dict[str, Any]:
    return {"msgtype": "text", "text": {"content": content}}


def send_response_url(
    response_url: str,
    payload: dict[str, Any],
    crypto: WecomBotCrypto,
    *,
    allowed_hosts: set[str] | None = None,
    timeout: float = 10,
) -> None:
    """通过消息携带的临时 response_url 发送延迟处理结果。"""
    parsed = urllib.parse.urlsplit(response_url)
    hosts = allowed_hosts or {"qyapi.weixin.qq.com"}
    if parsed.scheme != "https" or parsed.hostname not in hosts:
        raise WecomBotError("企业微信 response_url 地址不在允许范围内")

    try:
        response = requests.post(
            response_url,
            data=crypto.encrypt(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise WecomBotError(f"企业微信结果通知发送失败：{exc}") from exc
    try:
        result = response.json()
    except ValueError:
        return
    if result.get("errcode", 0) != 0:
        raise WecomBotError(
            f"企业微信结果通知失败：{result.get('errmsg') or result.get('errcode')}"
        )
