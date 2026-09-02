"""Simple local user store for password based access control."""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from werkzeug.security import check_password_hash, generate_password_hash


USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@-]{3,64}$")
ROLES = {"admin", "user"}
STATUSES = {"enabled", "disabled"}


class UserStore:
    def __init__(self, database_path: Path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL DEFAULT '',
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    status TEXT NOT NULL DEFAULT 'enabled',
                    is_super_admin INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_login_at TEXT
                )
                """
            )

    @staticmethod
    def hash_password(password: str) -> str:
        return generate_password_hash(password, method="pbkdf2:sha256")

    def ensure_super_admin(
        self,
        *,
        username: str,
        password_hash: str,
        display_name: str = "超级管理员",
    ) -> None:
        username = normalize_username(username)
        now = datetime.now().isoformat(timespec="seconds")
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if row:
                connection.execute(
                    """
                    UPDATE users
                    SET display_name = ?, password_hash = ?, role = 'admin',
                        status = 'enabled', is_super_admin = 1, updated_at = ?
                    WHERE id = ?
                    """,
                    (display_name, password_hash, now, row["id"]),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO users (
                        username, display_name, password_hash, role, status,
                        is_super_admin, created_at, updated_at
                    ) VALUES (?, ?, ?, 'admin', 'enabled', 1, ?, ?)
                    """,
                    (username, display_name, password_hash, now, now),
                )

    def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        username = normalize_username(username)
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM users
                WHERE username = ? AND status = 'enabled'
                """,
                (username,),
            ).fetchone()
            if not row or not check_password_hash(row["password_hash"], password):
                return None
            now = datetime.now().isoformat(timespec="seconds")
            connection.execute(
                "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
                (now, now, row["id"]),
            )
        user = dict(row)
        user["last_login_at"] = now
        return public_user(user)

    def list_users(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, username, display_name, role, status, is_super_admin,
                       created_at, updated_at, last_login_at
                FROM users
                ORDER BY is_super_admin DESC, created_at ASC, id ASC
                """
            ).fetchall()
        return [public_user(dict(row)) for row in rows]

    def create_user(
        self,
        *,
        username: str,
        display_name: str,
        password: str,
        role: str,
        status: str,
    ) -> dict[str, Any]:
        username = normalize_username(username)
        validate_role(role)
        validate_status(status)
        if len(password) < 6:
            raise ValueError("密码至少需要 6 位")
        now = datetime.now().isoformat(timespec="seconds")
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO users (
                        username, display_name, password_hash, role, status,
                        is_super_admin, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                    """,
                    (
                        username,
                        display_name.strip() or username,
                        self.hash_password(password),
                        role,
                        status,
                        now,
                        now,
                    ),
                )
                user_id = cursor.lastrowid
        except sqlite3.IntegrityError as exc:
            raise ValueError("账号已存在") from exc
        return self.get_user(user_id)

    def update_user(
        self,
        user_id: int,
        *,
        display_name: str,
        role: str,
        status: str,
        password: str = "",
    ) -> dict[str, Any]:
        validate_role(role)
        validate_status(status)
        current = self.get_user(user_id)
        if current["is_super_admin"]:
            role = "admin"
            status = "enabled"
        fields: list[str] = [
            "display_name = ?",
            "role = ?",
            "status = ?",
            "updated_at = ?",
        ]
        values: list[Any] = [
            display_name.strip() or current["username"],
            role,
            status,
            datetime.now().isoformat(timespec="seconds"),
        ]
        if password:
            if len(password) < 6:
                raise ValueError("密码至少需要 6 位")
            fields.append("password_hash = ?")
            values.append(self.hash_password(password))
        values.append(user_id)
        with self._connect() as connection:
            connection.execute(
                f"UPDATE users SET {', '.join(fields)} WHERE id = ?",
                values,
            )
        return self.get_user(user_id)

    def delete_user(self, user_id: int) -> None:
        current = self.get_user(user_id)
        if current["is_super_admin"]:
            raise ValueError("超级管理员不可删除")
        with self._connect() as connection:
            connection.execute("DELETE FROM users WHERE id = ?", (user_id,))

    def get_user(self, user_id: int) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, username, display_name, role, status, is_super_admin,
                       created_at, updated_at, last_login_at
                FROM users
                WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
        if not row:
            raise ValueError("用户不存在")
        return public_user(dict(row))


def normalize_username(username: str) -> str:
    normalized = username.strip().lower()
    if not USERNAME_RE.match(normalized):
        raise ValueError("账号仅支持 3-64 位字母、数字、点、下划线、横线或 @")
    return normalized


def validate_role(role: str) -> None:
    if role not in ROLES:
        raise ValueError("角色不正确")


def validate_status(status: str) -> None:
    if status not in STATUSES:
        raise ValueError("状态不正确")


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user.get("display_name") or user["username"],
        "role": user["role"],
        "status": user["status"],
        "is_super_admin": bool(user["is_super_admin"]),
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
        "last_login_at": user.get("last_login_at") or "",
    }
