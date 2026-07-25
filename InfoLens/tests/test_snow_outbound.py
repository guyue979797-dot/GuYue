import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from infolens.customers import CustomerStore
from infolens.snow_outbound import (
    SnowOutboundStore,
    parse_outbound_workbook,
    validate_rules,
)


HEADERS = (
    "票号",
    "开票日期",
    "业务员",
    "对象编码",
    "对象名称",
    "地址",
    "电话号码",
    "折合箱数",
    "售卖类型",
    "出库单备注",
)


def workbook_bytes(rows, headers=HEADERS):
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(headers)
    for row in rows:
        worksheet.append(row)
    stream = io.BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream


def rule_payload():
    return [
        {
            "tag": "超勇冰冻10+2",
            "conditions": [
                {
                    "field": "outbound_remark",
                    "operator": "equals",
                    "value": "PLX260001001797",
                },
                {
                    "field": "converted_boxes",
                    "operator": "equals",
                    "value": "10",
                },
            ],
        },
        {
            "tag": "花车",
            "conditions": [
                {
                    "field": "sale_type",
                    "operator": "contains",
                    "value": "陈列",
                }
            ],
        },
    ]


class SnowOutboundTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temporary.name) / "customers.sqlite3"
        self.customers = CustomerStore(self.database_path)
        self.store = SnowOutboundStore(self.database_path)

    def tearDown(self):
        self.temporary.cleanup()

    def parse(self, rows):
        return parse_outbound_workbook(workbook_bytes(rows))

    def test_parse_requires_exact_headers_and_consistent_ticket_identity(self):
        missing = tuple(header for header in HEADERS if header != "开票日期")
        with self.assertRaisesRegex(ValueError, "开票日期"):
            parse_outbound_workbook(workbook_bytes([], missing))

        rows = [
            (
                "T-1",
                "2026-07-01",
                "黄春梅",
                "1000000001",
                "甲客户",
                "",
                "",
                10,
                "正常",
                "备注",
            ),
            (
                "T-1",
                "2026-07-01",
                "黄春梅",
                "1000000002",
                "乙客户",
                "",
                "",
                2,
                "正常",
                "备注",
            ),
        ]
        with self.assertRaisesRegex(ValueError, "同一票号关联了不同月份或终端"):
            self.parse(rows)

    def test_rule_validation_enforces_unique_tag_and_type_aware_operators(self):
        duplicate = [rule_payload()[0], rule_payload()[0]]
        with self.assertRaisesRegex(ValueError, "只能配置一个条件组"):
            validate_rules(duplicate)
        invalid_operator = rule_payload()
        invalid_operator[0]["conditions"][1]["operator"] = "contains"
        with self.assertRaisesRegex(ValueError, "操作符不正确"):
            validate_rules(invalid_operator)

    def test_preview_commit_tags_negative_rows_and_auto_customers(self):
        rows = self.parse(
            [
                (
                    "T-1",
                    "2026-07-10",
                    "黄春梅",
                    "1000000001",
                    "甲客户",
                    "甲地址",
                    "13800000001",
                    10,
                    "旺季陈列",
                    "PLX260001001797",
                ),
                (
                    "T-1",
                    "2026-07-10",
                    "黄春梅",
                    "1000000001",
                    "甲客户",
                    "甲地址",
                    "13800000001",
                    2,
                    "赠品",
                    "",
                ),
                (
                    "T-2",
                    "2026-07-11",
                    "陈家利",
                    "1000000002",
                    "乙客户",
                    "乙地址",
                    "13800000002",
                    -10,
                    "旺季陈列",
                    "PLX260001001797",
                ),
            ]
        )
        preview = self.store.create_preview(
            filename="outbound.xlsx",
            operator="worker",
            operator_name="普通用户",
            rows=rows,
            rules=rule_payload(),
        )
        self.assertEqual(preview["negative_row_count"], 1)
        self.assertEqual(preview["auto_customer_count"], 2)
        self.assertEqual(preview["tag_count"], 2)

        imported = self.store.commit_preview(
            preview["preview_id"],
            operator="worker",
            operator_name="普通用户",
        )
        self.assertEqual(imported["ticket_count"], 2)
        self.assertEqual(imported["auto_customer_count"], 2)

        listing = self.customers.list_customers(
            policy_month="2026-07",
            page_size=100,
        )
        by_code = {item["terminal_code"]: item for item in listing["items"]}
        self.assertEqual(
            set(by_code["1000000001"]["policy_tags"]),
            {"超勇冰冻10+2", "花车"},
        )
        self.assertEqual(by_code["1000000002"]["policy_tags"], [])
        self.assertEqual(by_code["1000000001"]["salesperson"], "黄春梅")
        self.assertEqual(by_code["1000000001"]["snow_salesperson"], "")
        self.assertEqual(by_code["1000000002"]["salesperson"], "")
        self.assertEqual(by_code["1000000002"]["snow_salesperson"], "陈家利")
        self.assertEqual(by_code["1000000002"]["remark"], "由系统创建")

        customer = self.customers.get_customer(by_code["1000000002"]["id"])
        self.assertEqual(customer["address"], "乙地址")
        logs = self.customers.list_logs(customer["id"])
        self.assertEqual(logs[0]["operator_name"], "系统")
        self.assertIn("自动创建", logs[0]["action_summary"])

        with sqlite3.connect(self.database_path) as connection:
            stored_negative = connection.execute(
                """
                SELECT COUNT(*) FROM snow_outbound_lines
                WHERE converted_boxes < 0
                """
            ).fetchone()[0]
        self.assertEqual(stored_negative, 1)

    def test_reimport_replaces_only_involved_month_and_keeps_customers(self):
        first_rows = self.parse(
            [
                (
                    "JUL-1",
                    "2026-07-01",
                    "罗伟",
                    "1000000003",
                    "七月客户",
                    "",
                    "",
                    10,
                    "陈列",
                    "PLX260001001797",
                ),
                (
                    "AUG-1",
                    "2026-08-01",
                    "陈俊杰",
                    "1000000004",
                    "八月客户",
                    "",
                    "",
                    10,
                    "陈列",
                    "PLX260001001797",
                ),
            ]
        )
        first = self.store.create_preview(
            filename="first.xlsx",
            operator="admin",
            operator_name="管理员",
            rows=first_rows,
            rules=rule_payload(),
        )
        self.store.commit_preview(
            first["preview_id"],
            operator="admin",
            operator_name="管理员",
            is_admin=True,
        )

        replacement_rows = self.parse(
            [
                (
                    "JUL-2",
                    "2026-07-02",
                    "",
                    "1000000003",
                    "七月客户的新名称",
                    "",
                    "",
                    1,
                    "正常",
                    "无匹配",
                )
            ]
        )
        replacement = self.store.create_preview(
            filename="replacement.xlsx",
            operator="admin",
            operator_name="管理员",
            rows=replacement_rows,
            rules=rule_payload(),
        )
        self.store.commit_preview(
            replacement["preview_id"],
            operator="admin",
            operator_name="管理员",
            is_admin=True,
        )

        self.assertEqual(self.store.list_months(), ["2026-08", "2026-07"])
        july = self.customers.list_customers(
            terminal_code="1000000003",
            policy_month="2026-07",
        )["items"][0]
        august = self.customers.list_customers(
            terminal_code="1000000004",
            policy_month="2026-08",
        )["items"][0]
        self.assertEqual(july["policy_tags"], [])
        self.assertEqual(set(august["policy_tags"]), {"超勇冰冻10+2", "花车"})
        self.assertEqual(july["customer_name"], "七月客户")
        with sqlite3.connect(self.database_path) as connection:
            july_tickets = connection.execute(
                """
                SELECT ticket_no FROM snow_outbound_tickets
                WHERE month = '2026-07'
                """
            ).fetchall()
        self.assertEqual(july_tickets, [("JUL-2",)])

    def test_templates_are_saved_and_non_owner_cannot_change_them(self):
        template = self.store.save_template(
            name="旺季模板",
            rules=rule_payload(),
            is_default=True,
            operator="owner",
            operator_name="创建人",
        )
        self.assertTrue(template["is_default"])
        self.assertEqual(len(self.store.list_templates()), 1)
        with self.assertRaisesRegex(PermissionError, "只能修改自己"):
            self.store.save_template(
                template_id=template["id"],
                name="他人修改",
                rules=rule_payload(),
                is_default=False,
                operator="other",
                operator_name="其他人",
            )
        with self.assertRaisesRegex(PermissionError, "只能删除自己"):
            self.store.delete_template(
                template["id"],
                operator="other",
                is_admin=False,
            )

    def policy_payload(self, *, name="冰冻", code="PLX-001", remark="MATCH"):
        return {
            "name": name,
            "outbound_code": code,
            "explanation": "测试政策",
            "requires_photo": True,
            "set_limit": 10,
            "month_target": 25,
            "year": 2026,
            "month": 7,
            "conditions": [
                {
                    "field": "outbound_remark",
                    "operator": "contains",
                    "value": remark,
                }
            ],
        }

    def test_policy_crud_validation_uniqueness_and_logs(self):
        created = self.store.create_policy(
            self.policy_payload(),
            operator="worker",
            operator_name="普通用户",
        )
        self.assertRegex(created["id"], r"^POL-202607-[A-F0-9]{6}$")
        self.assertEqual(created["display_name"], "7月-冰冻")
        self.assertEqual(created["month_target"], 25)
        self.assertTrue(created["enabled"])
        with self.assertRaisesRegex(ValueError, "出库编码"):
            self.store.create_policy(
                self.policy_payload(name="另一个标签"),
                operator="worker",
                operator_name="普通用户",
            )
        with self.assertRaisesRegex(ValueError, "已存在标签"):
            self.store.create_policy(
                self.policy_payload(code="PLX-002"),
                operator="worker",
                operator_name="普通用户",
            )
        invalid_target = self.policy_payload(code="PLX-004", name="错误月目标")
        invalid_target["month_target"] = -1
        with self.assertRaisesRegex(ValueError, "月目标必须为非负整数"):
            self.store.create_policy(
                invalid_target,
                operator="worker",
                operator_name="普通用户",
            )
        duplicate_field = self.policy_payload(code="PLX-003", name="重复字段")
        duplicate_field["conditions"].append(
            {
                "field": "outbound_remark",
                "operator": "equals",
                "value": "OTHER",
            }
        )
        with self.assertRaisesRegex(ValueError, "只能定义一次"):
            self.store.create_policy(
                duplicate_field,
                operator="worker",
                operator_name="普通用户",
            )

        changed = self.policy_payload(name="冰冻新", code="PLX-001")
        updated = self.store.update_policy(
            created["id"],
            changed,
            operator="worker2",
            operator_name="普通用户2",
        )
        self.assertEqual(updated["id"], created["id"])
        self.assertEqual(updated["display_name"], "7月-冰冻新")
        disabled = self.store.set_policy_enabled(
            created["id"],
            False,
            operator="worker2",
            operator_name="普通用户2",
        )
        self.assertFalse(disabled["enabled"])
        logs = self.store.list_policy_logs(created["id"])
        self.assertEqual(
            [item["action_type"] for item in logs],
            ["disable", "update", "create"],
        )

    def test_latest_upload_updates_active_policy_only(self):
        active = self.store.create_policy(
            self.policy_payload(name="启用标签", code="PLX-A", remark="MATCH"),
            operator="admin",
            operator_name="管理员",
        )
        inactive = self.store.create_policy(
            self.policy_payload(name="停用标签", code="PLX-B", remark="MATCH"),
            operator="admin",
            operator_name="管理员",
        )
        matching_rows = self.parse(
            [
                (
                    "T-A",
                    "2026-07-10",
                    "黄春梅",
                    "1000000021",
                    "政策客户",
                    "",
                    "",
                    1,
                    "正常",
                    "MATCH",
                )
            ]
        )
        first = self.store.create_preview(
            filename="first.xlsx",
            operator="worker",
            operator_name="普通用户",
            rows=matching_rows,
            update_policy=True,
        )
        self.assertEqual(first["policy_count"], 2)
        self.store.commit_preview(
            first["preview_id"],
            operator="worker",
            operator_name="普通用户",
        )
        first_policy_result = self.store.list_policies(page_size=100)
        self.assertTrue(first_policy_result["latest_upload_at"])
        first_policy_counts = {
            item["id"]: item["shipped_count"]
            for item in first_policy_result["items"]
        }
        self.assertEqual(first_policy_counts[active["id"]], 1)
        self.assertEqual(first_policy_counts[inactive["id"]], 1)
        first_tags = self.customers.list_customers(
            terminal_code="1000000021",
            policy_month="2026-07",
        )["items"][0]["policy_tag_details"]
        self.assertEqual({item["policy_id"] for item in first_tags}, {active["id"], inactive["id"]})

        self.store.set_policy_enabled(
            inactive["id"],
            False,
            operator="worker",
            operator_name="普通用户",
        )
        nonmatching_rows = self.parse(
            [
                (
                    "T-B",
                    "2026-07-11",
                    "黄春梅",
                    "1000000021",
                    "政策客户",
                    "",
                    "",
                    1,
                    "正常",
                    "NONE",
                )
            ]
        )
        second = self.store.create_preview(
            filename="second.xlsx",
            operator="worker",
            operator_name="普通用户",
            rows=nonmatching_rows,
            update_policy=True,
        )
        self.assertEqual(second["policy_count"], 1)
        self.store.commit_preview(
            second["preview_id"],
            operator="worker",
            operator_name="普通用户",
        )
        second_policy_counts = {
            item["id"]: item["shipped_count"]
            for item in self.store.list_policies(page_size=100)["items"]
        }
        self.assertEqual(second_policy_counts[active["id"]], 0)
        self.assertEqual(second_policy_counts[inactive["id"]], 1)
        second_tags = self.customers.list_customers(
            terminal_code="1000000021",
            policy_month="2026-07",
        )["items"][0]["policy_tag_details"]
        self.assertEqual(
            {item["policy_id"] for item in second_tags},
            {inactive["id"]},
        )

    def test_upload_without_policy_update_keeps_existing_tags(self):
        policy = self.store.create_policy(
            self.policy_payload(),
            operator="admin",
            operator_name="管理员",
        )
        rows = self.parse(
            [
                (
                    "T-C",
                    "2026-07-10",
                    "",
                    "1000000022",
                    "保留标签客户",
                    "",
                    "",
                    1,
                    "正常",
                    "MATCH",
                )
            ]
        )
        first = self.store.create_preview(
            filename="first.xlsx",
            operator="worker",
            operator_name="普通用户",
            rows=rows,
            update_policy=True,
        )
        self.store.commit_preview(
            first["preview_id"],
            operator="worker",
            operator_name="普通用户",
        )
        rows[0]["outbound_remark"] = "NONE"
        second = self.store.create_preview(
            filename="second.xlsx",
            operator="worker",
            operator_name="普通用户",
            rows=rows,
            update_policy=False,
        )
        self.assertEqual(second["policy_count"], 0)
        self.store.commit_preview(
            second["preview_id"],
            operator="worker",
            operator_name="普通用户",
        )
        details = self.customers.list_customers(
            terminal_code="1000000022",
            policy_month="2026-07",
        )["items"][0]["policy_tag_details"]
        self.assertEqual(details[0]["policy_id"], policy["id"])


if __name__ == "__main__":
    unittest.main()
