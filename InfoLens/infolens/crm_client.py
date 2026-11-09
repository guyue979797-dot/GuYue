"""华润 CRM 拜访详情 API 客户端。"""

from __future__ import annotations

import hashlib
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

BASE_URL = os.environ.get(
    "INFOLENS_CRM_BASE_URL",
    "https://crm.crb.cn/kan-appserver",
).rstrip("/")
COS_BASE = os.environ.get(
    "INFOLENS_COS_BASE_URL",
    "https://sfa-prd-1259627966.cos.ap-chengdu.myqcloud.com/",
)

VISIT_DETAIL_PATH = "/h5/report/getWorkCircleTerminalVisitAndSupervisorDetail"
WORK_CIRCLE_DETAIL_PATH = "/h5/report/getVisitWorkCircleDetail"
PIC_URL_PATH = "/heineKen/getPicUrlByPhotoIds"
TIMESTAMP_PATH = "/heineKen/getTimestamp"


class CrmApiError(Exception):
    """CRM API 调用失败。"""


def _crm_ssl_context() -> ssl.SSLContext:
    """兼容 CRM 网关的旧式 TLS 重协商，同时保留证书校验。"""
    context = ssl.create_default_context()
    allow_legacy = os.environ.get(
        "INFOLENS_CRM_ALLOW_LEGACY_RENEGOTIATION",
        "true",
    ).strip().lower() in {"1", "true", "yes", "on"}
    if allow_legacy:
        context.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    return context


def _post(path: str, form_data: dict[str, str], timeout: float = 30) -> dict[str, Any]:
    body = urllib.parse.urlencode(form_data).encode()
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(
            req,
            timeout=timeout,
            context=_crm_ssl_context(),
        ) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise CrmApiError(f"HTTP {exc.code}: {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise CrmApiError(f"网络错误: {exc.reason}") from exc

    if payload.get("errcode") != 200:
        raise CrmApiError(payload.get("msg") or "未知错误")
    return payload


def _get_timestamp() -> dict[str, Any]:
    req = urllib.request.Request(
        f"{BASE_URL}{TIMESTAMP_PATH}",
        data=b"",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(
        req,
        timeout=15,
        context=_crm_ssl_context(),
    ) as resp:
        payload = json.loads(resp.read())
    if payload.get("msg") != "success":
        raise CrmApiError("获取时间戳失败")
    return payload["data"]


def _sign(params: dict[str, Any], timestamp: int) -> str:
    secret_key = os.environ.get("INFOLENS_CRM_SECRET_KEY", "")
    if not secret_key:
        raise CrmApiError("服务端未配置 INFOLENS_CRM_SECRET_KEY")
    signed = dict(params)
    signed["timestamp"] = timestamp
    parts = [f"{key}={signed[key]}" for key in sorted(signed)]
    raw = "&".join(parts) + f"&key={secret_key}"
    return hashlib.md5(raw.encode()).hexdigest().upper()


def share_request(path: str, params: dict[str, Any]) -> Any:
    ts = _get_timestamp()
    appserver_time = ts["appserver_time"]
    payload = _post(
        path,
        {
            "data": json.dumps(params, separators=(",", ":"), ensure_ascii=False),
            "sign": _sign(params, appserver_time),
            "timestamp": str(appserver_time),
        },
    )
    return payload["data"]


def get_visit_detail(appuser: str, visit_id: str, process_type: str) -> dict[str, Any]:
    data = share_request(
        VISIT_DETAIL_PATH,
        {"appuser": appuser, "id": visit_id, "process_type": process_type},
    )
    if not data:
        raise CrmApiError("未找到拜访记录")
    return data[0] if isinstance(data, list) else data


def get_work_circle_detail(appuser: str, visit_id: str) -> dict[str, Any]:
    data = share_request(
        WORK_CIRCLE_DETAIL_PATH,
        {"appuser": appuser, "id": visit_id},
    )
    if not data:
        raise CrmApiError("未找到工作圈拜访记录")
    return data[0] if isinstance(data, list) else data


def resolve_photo_url(photoid: str) -> str:
    if "TCOS" in photoid:
        return COS_BASE + photoid
    data = share_request(PIC_URL_PATH, {"objectIds": [photoid]})
    if not data:
        raise CrmApiError(f"无法解析图片: {photoid}")
    return data[0]["value"].replace("http://", "https://")
