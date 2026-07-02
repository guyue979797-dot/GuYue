#!/usr/bin/env python3
"""InfoLens Web 应用。

本地开发:
    INFOLENS_AUTH_MODE=off python web.py

生产环境:
    gunicorn --bind 0.0.0.0:8000 --workers 1 --threads 8 web:app
"""

from __future__ import annotations

import hmac
import json
import os
import secrets
import threading
import time
import urllib.parse
from collections import defaultdict, deque
from functools import wraps
from pathlib import Path
from typing import Callable

from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    request,
    send_from_directory,
    session,
    url_for,
)
from authlib.integrations.flask_client import OAuth
from werkzeug.security import check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix

from infolens.crm_client import CrmApiError
from infolens.extractor import (
    ExtractResult,
    build_image_filename,
    extract_images,
)


ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
OUTPUT_ROOT = Path(os.environ.get("INFOLENS_OUTPUT_ROOT", ROOT / "output")).resolve()
AUTH_MODE = os.environ.get("INFOLENS_AUTH_MODE", "off").strip().lower()
EXTRACT_LOCK = threading.Lock()
RATE_LOCK = threading.Lock()
RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def _require_production_config() -> None:
    if AUTH_MODE not in {"off", "password", "oidc", "proxy"}:
        raise RuntimeError("INFOLENS_AUTH_MODE 必须为 off、password、oidc 或 proxy")
    if os.environ.get("INFOLENS_ENV") == "production" and AUTH_MODE == "off":
        raise RuntimeError("生产环境禁止关闭鉴权")
    if AUTH_MODE == "password":
        required = (
            "INFOLENS_USERNAME",
            "INFOLENS_PASSWORD_HASH",
            "INFOLENS_SESSION_SECRET",
        )
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RuntimeError(f"密码登录缺少环境变量: {', '.join(missing)}")
    if AUTH_MODE == "oidc":
        required = (
            "INFOLENS_OIDC_METADATA_URL",
            "INFOLENS_OIDC_CLIENT_ID",
            "INFOLENS_OIDC_CLIENT_SECRET",
            "INFOLENS_SESSION_SECRET",
        )
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RuntimeError(f"OIDC 登录缺少环境变量: {', '.join(missing)}")


def _image_url(folder: str, filename: str) -> str:
    return "/output/" + "/".join(
        urllib.parse.quote(part) for part in (folder, filename)
    )


def _serialize_result(result: ExtractResult) -> dict:
    folder = Path(result.output_dir).name
    return {
        "visit_id": result.visit_id,
        "terminal_name": result.terminal_name,
        "partner_name": result.partner_name,
        "images": [
            {
                "filename": image.filename,
                "size_bytes": image.size_bytes,
                "url": _image_url(folder, image.filename),
            }
            for image in result.images
        ],
    }


def _load_saved_results() -> list[dict]:
    results: list[dict] = []
    if not OUTPUT_ROOT.exists():
        return results

    metadata_files = sorted(
        OUTPUT_ROOT.glob("*/metadata.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for metadata_file in metadata_files:
        try:
            data = json.loads(metadata_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        folder = metadata_file.parent.name
        images = []
        private_images = [
            item
            for item in data.get("images", [])
            if str(item.get("photoid") or "").startswith("private")
        ]
        for index, item in enumerate(private_images, start=1):
            filename = item.get("filename", "")
            image_file = metadata_file.parent / filename
            if filename and image_file.is_file():
                try:
                    display_filename = build_image_filename(
                        item["photoid"],
                        data.get("terminal_name") or "未知终端",
                        data.get("partner_name") or "未知业务员",
                        index,
                        image_file.suffix,
                    )
                except (KeyError, ValueError):
                    display_filename = filename
                images.append(
                    {
                        "filename": filename,
                        "display_filename": display_filename,
                        "size_bytes": item.get("size_bytes", image_file.stat().st_size),
                        "url": _image_url(folder, filename),
                    }
                )

        results.append(
            {
                "visit_id": data.get("visit_id", ""),
                "terminal_name": data.get("terminal_name", "未知终端"),
                "partner_name": data.get("partner_name", "未知业务员"),
                "extracted_at": data.get("extracted_at", ""),
                "images": images,
            }
        )
    return results


def _current_user() -> str | None:
    if AUTH_MODE == "off":
        return "本地用户"
    if AUTH_MODE in {"password", "oidc"}:
        return session.get("user")

    header = os.environ.get(
        "INFOLENS_PROXY_USER_HEADER",
        "Cf-Access-Authenticated-User-Email",
    )
    user = request.headers.get(header, "").strip().lower()
    if not user:
        return None

    allowed_domain = os.environ.get("INFOLENS_ALLOWED_EMAIL_DOMAIN", "").lower()
    allowed_emails = {
        email.strip().lower()
        for email in os.environ.get("INFOLENS_ALLOWED_EMAILS", "").split(",")
        if email.strip()
    }
    if allowed_domain and not user.endswith(f"@{allowed_domain}"):
        return None
    if allowed_emails and user not in allowed_emails:
        return None
    return user


def _identity_allowed(user: str) -> bool:
    normalized = user.strip().lower()
    allowed_domain = os.environ.get("INFOLENS_ALLOWED_EMAIL_DOMAIN", "").lower()
    allowed_emails = {
        email.strip().lower()
        for email in os.environ.get("INFOLENS_ALLOWED_EMAILS", "").split(",")
        if email.strip()
    }
    if allowed_domain and not normalized.endswith(f"@{allowed_domain}"):
        return False
    if allowed_emails and normalized not in allowed_emails:
        return False
    return True


def _login_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _current_user():
            return view(*args, **kwargs)
        if request.path.startswith("/api/") or request.path.startswith("/output/"):
            return jsonify({"error": "请先登录"}), 401
        return redirect(url_for("login", next=request.path))

    return wrapped


def _csrf_token() -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def _check_csrf() -> None:
    expected = session.get("csrf_token", "")
    supplied = request.headers.get("X-CSRF-Token", "")
    if not expected or not hmac.compare_digest(expected, supplied):
        abort(403, description="安全令牌无效，请刷新页面后重试")


def _check_rate_limit() -> None:
    limit = int(os.environ.get("INFOLENS_RATE_LIMIT", "10"))
    window = int(os.environ.get("INFOLENS_RATE_WINDOW_SECONDS", "600"))
    identity = _current_user() or request.remote_addr or "unknown"
    now = time.monotonic()
    with RATE_LOCK:
        bucket = RATE_BUCKETS[identity]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            abort(429, description="请求过于频繁，请稍后再试")
        bucket.append(now)


def create_app() -> Flask:
    _require_production_config()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    application = Flask(__name__, static_folder=None)
    application.wsgi_app = ProxyFix(
        application.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
    )
    application.config.update(
        MAX_CONTENT_LENGTH=16 * 1024,
        SECRET_KEY=os.environ.get("INFOLENS_SESSION_SECRET") or secrets.token_hex(32),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("INFOLENS_ENV") == "production",
        PERMANENT_SESSION_LIFETIME=8 * 60 * 60,
    )
    oauth = OAuth(application)
    if AUTH_MODE == "oidc":
        oauth.register(
            name="company",
            server_metadata_url=os.environ["INFOLENS_OIDC_METADATA_URL"],
            client_id=os.environ["INFOLENS_OIDC_CLIENT_ID"],
            client_secret=os.environ["INFOLENS_OIDC_CLIENT_SECRET"],
            client_kwargs={"scope": "openid email profile"},
        )

    @application.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'none'; "
            "form-action 'self'"
        )
        response.headers["Cache-Control"] = "no-store"
        return response

    @application.get("/healthz")
    def healthz():
        return jsonify({"status": "ok"})

    @application.route("/login", methods=["GET", "POST"])
    def login():
        if AUTH_MODE == "off":
            return redirect(url_for("index"))
        if AUTH_MODE == "proxy":
            if _current_user():
                return redirect(url_for("index"))
            return "身份验证失败，请通过公司的登录入口访问。", 401
        if AUTH_MODE == "oidc":
            callback = url_for("oidc_callback", _external=True)
            return oauth.company.authorize_redirect(callback)

        error = ""
        if request.method == "POST":
            username = request.form.get("username", "")
            password = request.form.get("password", "")
            expected_username = os.environ["INFOLENS_USERNAME"]
            password_hash = os.environ["INFOLENS_PASSWORD_HASH"]
            if hmac.compare_digest(username, expected_username) and check_password_hash(
                password_hash, password
            ):
                session.clear()
                session["user"] = username
                session.permanent = True
                destination = request.args.get("next", "/")
                if not destination.startswith("/") or destination.startswith("//"):
                    destination = "/"
                return redirect(destination)
            error = "账号或密码不正确"

        return (
            (WEB_ROOT / "login.html")
            .read_text(encoding="utf-8")
            .replace("{{ERROR}}", error)
        )

    @application.get("/auth/callback")
    def oidc_callback():
        if AUTH_MODE != "oidc":
            abort(404)
        token = oauth.company.authorize_access_token()
        userinfo = token.get("userinfo") or oauth.company.userinfo()
        user = str(userinfo.get("email") or userinfo.get("preferred_username") or "")
        if not user or not _identity_allowed(user):
            return "该公司账号没有 InfoLens 访问权限。", 403
        session.clear()
        session["user"] = user.lower()
        session.permanent = True
        return redirect(url_for("index"))

    @application.get("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))

    @application.get("/")
    @_login_required
    def index():
        return send_from_directory(WEB_ROOT, "index.html")

    @application.get("/api/session")
    @_login_required
    def session_info():
        return jsonify({"user": _current_user(), "csrf_token": _csrf_token()})

    @application.get("/api/results")
    @_login_required
    def saved_results():
        return jsonify(_load_saved_results())

    @application.get("/output/<path:relative_path>")
    @_login_required
    def output_file(relative_path: str):
        return send_from_directory(OUTPUT_ROOT, relative_path)

    @application.post("/api/extract")
    @_login_required
    def extract():
        _check_csrf()
        _check_rate_limit()
        payload = request.get_json(silent=True) or {}
        url = str(payload.get("url", "")).strip()
        if not url:
            return jsonify({"error": "请粘贴 CRM 拜访详情链接"}), 400
        if len(url) > 4096:
            return jsonify({"error": "链接过长"}), 400

        try:
            with EXTRACT_LOCK:
                result = extract_images(url, OUTPUT_ROOT)
        except (ValueError, CrmApiError) as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            application.logger.exception("提取图片失败")
            return jsonify({"error": "提取失败，请联系管理员查看服务日志"}), 500
        return jsonify(_serialize_result(result))

    @application.errorhandler(403)
    @application.errorhandler(429)
    def handled_error(error):
        return jsonify({"error": error.description}), error.code

    return application


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8765, debug=False, threaded=True)
