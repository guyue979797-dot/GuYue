"""客户档案、分页查询与不可变操作日志。"""

from __future__ import annotations

import json
import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


TERMINAL_CODE_RE = re.compile(r"^\d{10}$")
CUSTOMER_STATUSES = {"运营", "停用"}
SALESPEOPLE = ("黄春梅", "罗伟", "韦春云", "李富马")
SNOW_SALESPEOPLE = ("陈家利", "陈俊杰")
CUSTOMER_FIELDS = (
    "terminal_code",
    "customer_name",
    "status",
    "route",
    "salesperson",
    "snow_salesperson",
    "contact",
    "address",
    "phone",
    "remark",
)
FIELD_LABELS = {
    "terminal_code": "终端编码",
    "customer_name": "客户全名",
    "status": "状态",
    "route": "线路归属",
    "salesperson": "业务员",
    "snow_salesperson": "雪花业务员",
    "contact": "客户联系人",
    "address": "客户地址",
    "phone": "客户手机",
    "remark": "备注",
}
EXCEL_HEADERS = tuple(FIELD_LABELS[field] for field in CUSTOMER_FIELDS)
HEADER_TO_FIELD = {label: field for field, label in FIELD_LABELS.items()}


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _clean(value: Any, *, limit: int) -> str:
    text = str(value or "").strip()
    if len(text) > limit:
        raise ValueError(f"内容不能超过 {limit} 个字符")
    return text


def normalize_terminal_code(value: Any) -> str:
    if value is None:
        code = ""
    elif isinstance(value, bool):
        code = str(value)
    elif isinstance(value, int):
        code = str(value)
    elif isinstance(value, float) and value.is_integer():
        code = str(int(value))
    else:
        code = str(value).strip()
    if not TERMINAL_CODE_RE.fullmatch(code):
        raise ValueError("终端编码必须为10位纯数字")
    return code


def normalize_customer(payload: dict[str, Any]) -> dict[str, str]:
    customer = {
        "terminal_code": normalize_terminal_code(payload.get("terminal_code")),
        "customer_name": _clean(payload.get("customer_name"), limit=200),
        "status": _clean(payload.get("status") or "运营", limit=10),
        "route": _clean(payload.get("route"), limit=100),
        "salesperson": _clean(payload.get("salesperson"), limit=50),
        "snow_salesperson": _clean(payload.get("snow_salesperson"), limit=50),
        "contact": _clean(payload.get("contact"), limit=100),
        "address": _clean(payload.get("address"), limit=500),
        "phone": _clean(payload.get("phone"), limit=50),
        "remark": _clean(payload.get("remark"), limit=1000),
    }
    required = {
        "customer_name": "客户全名",
    }
    for field, label in required.items():
        if not customer[field]:
            raise ValueError(f"{label}不能为空")
    if customer["status"] not in CUSTOMER_STATUSES:
        raise ValueError("状态只能是运营或停用")
    if customer["salesperson"] and customer["salesperson"] not in SALESPEOPLE:
        raise ValueError(f"业务员只能是：{'、'.join(SALESPEOPLE)}")
    if customer["snow_salesperson"] and customer["snow_salesperson"] not in SNOW_SALESPEOPLE:
        raise ValueError(f"雪花业务员只能是：{'、'.join(SNOW_SALESPEOPLE)}")
    return customer


class CustomerStore:
    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=30000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    terminal_code TEXT NOT NULL UNIQUE,
                    customer_name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT '运营',
                    route TEXT NOT NULL,
                    salesperson TEXT NOT NULL,
                    snow_salesperson TEXT NOT NULL,
                    contact TEXT NOT NULL DEFAULT '',
                    address TEXT NOT NULL DEFAULT '',
                    phone TEXT NOT NULL DEFAULT '',
                    remark TEXT NOT NULL DEFAULT '',
                    version INTEGER NOT NULL DEFAULT 1,
                    created_by TEXT NOT NULL,
                    created_by_name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_by TEXT NOT NULL,
                    updated_by_name TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_by TEXT NOT NULL DEFAULT '',
                    deleted_by_name TEXT NOT NULL DEFAULT '',
                    deleted_at TEXT NOT NULL DEFAULT '',
                    CHECK(length(terminal_code) = 10),
                    CHECK(status IN ('运营', '停用'))
                );
                CREATE INDEX IF NOT EXISTS idx_customers_name
                    ON customers(customer_name);
                CREATE INDEX IF NOT EXISTS idx_customers_salesperson
                    ON customers(salesperson);
                CREATE INDEX IF NOT EXISTS idx_customers_snow_salesperson
                    ON customers(snow_salesperson);
                CREATE INDEX IF NOT EXISTS idx_customers_updated
                    ON customers(deleted_at, updated_at DESC, id DESC);

                CREATE TABLE IF NOT EXISTS customer_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL,
                    operator TEXT NOT NULL,
                    operator_name TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    action_summary TEXT NOT NULL,
                    changes_json TEXT NOT NULL DEFAULT '{}',
                    operated_at TEXT NOT NULL,
                    FOREIGN KEY(customer_id) REFERENCES customers(id)
                );
                CREATE INDEX IF NOT EXISTS idx_customer_logs_customer
                    ON customer_audit_logs(customer_id, operated_at DESC, id DESC);

                CREATE TABLE IF NOT EXISTS customer_import_jobs (
                    id TEXT PRIMARY KEY,
                    operator TEXT NOT NULL,
                    operator_name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    total_count INTEGER NOT NULL,
                    success_count INTEGER NOT NULL,
                    failed_count INTEGER NOT NULL,
                    errors_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL
                );
                """
            )

    def list_customers(
        self,
        *,
        terminal_code: str = "",
        customer_name: str = "",
        route: str = "",
        salesperson: str = "",
        snow_salesperson: str = "",
        policy_month: str = "",
        policy_tag: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        page = max(1, int(page))
        page_size = max(1, min(100, int(page_size)))
        conditions = []
        parameters: list[Any] = []
        filters = (
            ("terminal_code", terminal_code.strip(), False),
            ("customer_name", customer_name.strip(), True),
            ("route", route.strip(), False),
            ("salesperson", salesperson.strip(), True),
            ("snow_salesperson", snow_salesperson.strip(), True),
        )
        for field, value, fuzzy in filters:
            if not value:
                continue
            conditions.append(f"{field} {'LIKE' if fuzzy else '='} ?")
            parameters.append(f"%{value}%" if fuzzy else value)
        where = "deleted_at = ''"
        if conditions:
            where += " AND (" + " OR ".join(conditions) + ")"
        policy_tag = policy_tag.strip()
        if policy_tag:
            if not policy_month:
                raise ValueError("按雪花政策筛选时必须选择月份")
            where += """
                AND EXISTS (
                    SELECT 1
                    FROM customer_policy_tags AS selected_policy
                    WHERE selected_policy.month = ?
                      AND selected_policy.tag = ?
                      AND selected_policy.terminal_code = customers.terminal_code
                )
            """
            parameters.extend([policy_month, policy_tag])

        with self._connect() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) FROM customers WHERE {where}",
                parameters,
            ).fetchone()[0]
            offset = (page - 1) * page_size
            rows = connection.execute(
                f"""
                SELECT {", ".join(CUSTOMER_FIELDS)}, id, version,
                       created_by_name, created_at, updated_by_name, updated_at
                FROM customers
                WHERE {where}
                ORDER BY updated_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                [*parameters, page_size, offset],
            ).fetchall()
        items = [dict(row) for row in rows]
        if items and policy_month:
            codes = [item["terminal_code"] for item in items]
            placeholders = ",".join("?" for _ in codes)
            with self._connect() as connection:
                tag_rows = connection.execute(
                    f"""
                    SELECT terminal_code, tag, policy_id, color
                    FROM customer_policy_tags
                    WHERE month = ? AND terminal_code IN ({placeholders})
                    ORDER BY terminal_code, tag
                    """,
                    [policy_month, *codes],
                ).fetchall()
            tags_by_code: dict[str, list[dict[str, str]]] = {}
            for tag_row in tag_rows:
                tags_by_code.setdefault(tag_row["terminal_code"], []).append(
                    {
                        "name": tag_row["tag"],
                        "policy_id": tag_row["policy_id"],
                        "color": tag_row["color"],
                    }
                )
            for item in items:
                details = tags_by_code.get(item["terminal_code"], [])
                item["policy_tag_details"] = details
                item["policy_tags"] = [detail["name"] for detail in details]
        else:
            for item in items:
                item["policy_tags"] = []
                item["policy_tag_details"] = []
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def list_routes(self) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT route
                FROM customers
                WHERE deleted_at = '' AND route != ''
                ORDER BY route COLLATE NOCASE
                """
            ).fetchall()
        return [row["route"] for row in rows]

    def get_customer(self, customer_id: int, *, include_deleted: bool = False) -> dict[str, Any]:
        suffix = "" if include_deleted else " AND deleted_at = ''"
        with self._connect() as connection:
            row = connection.execute(
                f"SELECT * FROM customers WHERE id = ?{suffix}",
                (customer_id,),
            ).fetchone()
        if not row:
            raise ValueError("客户档案不存在")
        return dict(row)

    def create_customer(
        self,
        payload: dict[str, Any],
        *,
        operator: str,
        operator_name: str,
        source: str = "single",
    ) -> dict[str, Any]:
        customer = normalize_customer(payload)
        now = _now()
        action = "批量导入新建客户档案" if source == "batch" else "新建客户档案"
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    f"""
                    INSERT INTO customers (
                        {", ".join(CUSTOMER_FIELDS)},
                        created_by, created_by_name, created_at,
                        updated_by, updated_by_name, updated_at
                    ) VALUES ({", ".join("?" for _ in CUSTOMER_FIELDS)}, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        *(customer[field] for field in CUSTOMER_FIELDS),
                        operator,
                        operator_name,
                        now,
                        operator,
                        operator_name,
                        now,
                    ],
                )
                customer_id = cursor.lastrowid
                self._insert_log(
                    connection,
                    customer_id=customer_id,
                    operator=operator,
                    operator_name=operator_name,
                    action_type="create",
                    action_summary=action,
                    changes={},
                    operated_at=now,
                )
        except sqlite3.IntegrityError as exc:
            if "terminal_code" in str(exc):
                raise ValueError(f"终端编码 {customer['terminal_code']} 已存在") from exc
            raise ValueError("客户档案保存失败") from exc
        return self.get_customer(customer_id)

    def update_customer(
        self,
        customer_id: int,
        payload: dict[str, Any],
        *,
        operator: str,
        operator_name: str,
    ) -> dict[str, Any]:
        customer = normalize_customer(payload)
        requested_version = int(payload.get("version") or 0)
        try:
            with self._connect() as connection:
                current_row = connection.execute(
                    "SELECT * FROM customers WHERE id = ? AND deleted_at = ''",
                    (customer_id,),
                ).fetchone()
                if not current_row:
                    raise ValueError("客户档案不存在")
                current = dict(current_row)
                if requested_version and requested_version != current["version"]:
                    raise ValueError("档案已被其他人修改，请刷新后重试")
                changes = {
                    field: {"before": current[field], "after": customer[field]}
                    for field in CUSTOMER_FIELDS
                    if current[field] != customer[field]
                }
                if not changes:
                    return current
                now = _now()
                next_version = current["version"] + 1
                assignments = ", ".join(f"{field} = ?" for field in CUSTOMER_FIELDS)
                connection.execute(
                    f"""
                    UPDATE customers
                    SET {assignments}, version = ?, updated_by = ?,
                        updated_by_name = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    [
                        *(customer[field] for field in CUSTOMER_FIELDS),
                        next_version,
                        operator,
                        operator_name,
                        now,
                        customer_id,
                    ],
                )
                summary = "修改客户档案：" + "；".join(
                    f"{FIELD_LABELS[field]}由“{values['before'] or '空'}”改为“{values['after'] or '空'}”"
                    for field, values in changes.items()
                )
                self._insert_log(
                    connection,
                    customer_id=customer_id,
                    operator=operator,
                    operator_name=operator_name,
                    action_type="update",
                    action_summary=summary,
                    changes=changes,
                    operated_at=now,
                )
        except sqlite3.IntegrityError as exc:
            if "terminal_code" in str(exc):
                raise ValueError(f"终端编码 {customer['terminal_code']} 已存在") from exc
            raise ValueError("客户档案保存失败") from exc
        return self.get_customer(customer_id)

    def delete_customer(
        self,
        customer_id: int,
        *,
        operator: str,
        operator_name: str,
    ) -> None:
        now = _now()
        with self._connect() as connection:
            current = connection.execute(
                "SELECT id FROM customers WHERE id = ? AND deleted_at = ''",
                (customer_id,),
            ).fetchone()
            if not current:
                raise ValueError("客户档案不存在")
            connection.execute(
                """
                UPDATE customers
                SET deleted_by = ?, deleted_by_name = ?, deleted_at = ?,
                    updated_by = ?, updated_by_name = ?, updated_at = ?,
                    version = version + 1
                WHERE id = ?
                """,
                (
                    operator,
                    operator_name,
                    now,
                    operator,
                    operator_name,
                    now,
                    customer_id,
                ),
            )
            self._insert_log(
                connection,
                customer_id=customer_id,
                operator=operator,
                operator_name=operator_name,
                action_type="delete",
                action_summary="删除客户档案",
                changes={},
                operated_at=now,
            )

    def list_logs(self, customer_id: int) -> list[dict[str, Any]]:
        self.get_customer(customer_id)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, operator, operator_name, action_type, action_summary,
                       changes_json, operated_at
                FROM customer_audit_logs
                WHERE customer_id = ?
                ORDER BY operated_at DESC, id DESC
                """,
                (customer_id,),
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["changes"] = json.loads(item.pop("changes_json") or "{}")
            result.append(item)
        return result

    def record_import(
        self,
        *,
        operator: str,
        operator_name: str,
        filename: str,
        total_count: int,
        success_count: int,
        errors: list[dict[str, Any]],
    ) -> str:
        import_id = uuid.uuid4().hex
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO customer_import_jobs (
                    id, operator, operator_name, filename, total_count,
                    success_count, failed_count, errors_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    import_id,
                    operator,
                    operator_name,
                    filename,
                    total_count,
                    success_count,
                    len(errors),
                    json.dumps(errors, ensure_ascii=False),
                    _now(),
                ),
            )
        return import_id

    def get_import(self, import_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM customer_import_jobs WHERE id = ?",
                (import_id,),
            ).fetchone()
        if not row:
            raise ValueError("导入记录不存在")
        item = dict(row)
        item["errors"] = json.loads(item.pop("errors_json") or "[]")
        return item

    @staticmethod
    def _insert_log(
        connection: sqlite3.Connection,
        *,
        customer_id: int,
        operator: str,
        operator_name: str,
        action_type: str,
        action_summary: str,
        changes: dict[str, Any],
        operated_at: str,
    ) -> None:
        connection.execute(
            """
            INSERT INTO customer_audit_logs (
                customer_id, operator, operator_name, action_type,
                action_summary, changes_json, operated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                customer_id,
                operator,
                operator_name,
                action_type,
                action_summary,
                json.dumps(changes, ensure_ascii=False),
                operated_at,
            ),
        )
