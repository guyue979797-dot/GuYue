import tempfile
import unittest
from pathlib import Path

from infolens.customers import CustomerStore


def customer_payload(code: str, name: str, salesperson: str = "黄春梅") -> dict:
    return {
        "terminal_code": code,
        "customer_name": name,
        "status": "运营",
        "route": "一号线路",
        "salesperson": salesperson,
        "snow_salesperson": "陈家利",
        "contact": "联系人",
        "address": "客户地址",
        "phone": "13800000000",
        "remark": "",
    }


class CustomerStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = CustomerStore(Path(self.temporary.name) / "customers.sqlite3")

    def tearDown(self):
        self.temporary.cleanup()

    def test_create_update_logs_and_validation(self):
        created = self.store.create_customer(
            customer_payload("1000000001", "甲客户"),
            operator="admin",
            operator_name="管理员",
        )
        self.assertEqual(created["version"], 1)
        no_route = customer_payload("1000000002", "无线路客户")
        no_route["route"] = ""
        no_route["salesperson"] = ""
        no_route["snow_salesperson"] = ""
        created_no_route = self.store.create_customer(
            no_route,
            operator="admin",
            operator_name="管理员",
        )
        self.assertEqual(created_no_route["route"], "")
        self.assertEqual(created_no_route["salesperson"], "")
        self.assertEqual(created_no_route["snow_salesperson"], "")

        payload = customer_payload("1000000001", "甲客户（新）")
        payload["version"] = created["version"]
        updated = self.store.update_customer(
            created["id"],
            payload,
            operator="worker",
            operator_name="普通用户",
        )
        self.assertEqual(updated["version"], 2)
        logs = self.store.list_logs(created["id"])
        self.assertEqual([item["action_type"] for item in logs], ["update", "create"])
        self.assertIn("客户全名", logs[0]["action_summary"])

        with self.assertRaisesRegex(ValueError, "10位纯数字"):
            self.store.create_customer(
                customer_payload("123", "错误编码"),
                operator="admin",
                operator_name="管理员",
            )
        with self.assertRaisesRegex(ValueError, "业务员只能是"):
            self.store.create_customer(
                customer_payload("1000000002", "错误业务员", "名单外人员"),
                operator="admin",
                operator_name="管理员",
            )

    def test_intersection_query_pagination_and_soft_delete(self):
        first = self.store.create_customer(
            customer_payload("1000000001", "甲客户", "黄春梅"),
            operator="admin",
            operator_name="管理员",
        )
        second_payload = customer_payload("1000000002", "乙客户", "罗伟")
        second_payload["route"] = "二号线路"
        self.store.create_customer(
            second_payload,
            operator="admin",
            operator_name="管理员",
        )
        result = self.store.list_customers(
            terminal_code="1000000001",
            salesperson="罗伟",
            page=1,
            page_size=1,
        )
        self.assertEqual(result["total"], 0)
        intersection_result = self.store.list_customers(
            route="二号线路",
            salesperson="罗伟",
        )
        self.assertEqual(intersection_result["total"], 1)
        self.assertEqual(
            intersection_result["items"][0]["terminal_code"],
            "1000000002",
        )
        route_result = self.store.list_customers(route="二号线路")
        self.assertEqual(route_result["total"], 1)
        self.assertEqual(route_result["items"][0]["terminal_code"], "1000000002")
        self.assertEqual(self.store.list_routes(), ["一号线路", "二号线路"])

        self.store.delete_customer(
            first["id"],
            operator="admin",
            operator_name="管理员",
        )
        self.assertEqual(self.store.list_customers()["total"], 1)
        with self.assertRaisesRegex(ValueError, "已存在"):
            self.store.create_customer(
                customer_payload("1000000001", "复用编码"),
                operator="admin",
                operator_name="管理员",
            )

    def test_optimistic_lock_and_noop_update(self):
        created = self.store.create_customer(
            customer_payload("1000000001", "甲客户"),
            operator="admin",
            operator_name="管理员",
        )
        payload = customer_payload("1000000001", "甲客户")
        payload["version"] = created["version"]
        unchanged = self.store.update_customer(
            created["id"],
            payload,
            operator="admin",
            operator_name="管理员",
        )
        self.assertEqual(unchanged["version"], 1)
        self.assertEqual(len(self.store.list_logs(created["id"])), 1)

        payload["customer_name"] = "变更"
        payload["version"] = 99
        with self.assertRaisesRegex(ValueError, "其他人修改"):
            self.store.update_customer(
                created["id"],
                payload,
                operator="admin",
                operator_name="管理员",
            )


if __name__ == "__main__":
    unittest.main()
