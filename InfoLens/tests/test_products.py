import io
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

from infolens.products import ProductStore, parse_packaging, parse_stock_workbook


def stock_file(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(
        ["年月", "商品编号", "商品名称", "单位", "入库千升数", "可用（箱）"]
    )
    for row in rows:
        sheet.append(row)
    stream = io.BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream


class ProductStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.store = ProductStore(
            Path(self.temporary_directory.name) / "products.sqlite3"
        )

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_packaging_parser_multiplies_both_sides(self):
        self.assertEqual(
            parse_packaging("雪花精品8度500ml听6*2塑膜六连包"),
            (12, "听"),
        )
        self.assertEqual(
            parse_packaging("雪花干爽9.5度330ml听6×4塑膜六连包"),
            (24, "听"),
        )
        self.assertEqual(
            parse_packaging("雪花全麦精酿1L马口铁罐1X6纸箱"),
            (6, "罐"),
        )

    def test_crud_codes_are_unique_and_completion_is_derived(self):
        created = self.store.create_product(
            {
                "product_codes": ["P001", "P001-A"],
                "short_name": "蓝听",
                "product_name": "雪花蓝听500ml听1*12",
                "snow_inventory": 12.5,
                "housekeeper_codes": ["G001"],
                "specification": 12,
                "auxiliary_unit": "听",
                "settlement_price": 52,
            },
            operator="tester",
            operator_name="测试员",
        )
        self.assertEqual(created["status"], "正常")
        self.assertEqual(created["product_codes"], ["P001", "P001-A"])

        with self.assertRaisesRegex(ValueError, "商品编码已被其他产品使用"):
            self.store.create_product(
                {
                    "product_codes": ["P001"],
                    "short_name": "重复",
                    "product_name": "重复商品",
                    "snow_inventory": 0,
                    "housekeeper_codes": ["G002"],
                    "specification": 12,
                    "auxiliary_unit": "听",
                },
                operator="tester",
                operator_name="测试员",
            )

        second = self.store.create_product(
            {
                "product_codes": ["P002"],
                "short_name": "高库存",
                "product_name": "高库存商品",
                "snow_inventory": 99,
                "housekeeper_codes": ["G002"],
                "specification": 12,
                "auxiliary_unit": "听",
            },
            operator="tester",
            operator_name="测试员",
        )
        descending = self.store.list_products(inventory_sort="desc")
        self.assertEqual(descending["items"][0]["id"], second["id"])
        ascending = self.store.list_products(inventory_sort="asc")
        self.assertEqual(ascending["items"][0]["id"], created["id"])

        updated = self.store.update_product(
            created["id"],
            {
                **created,
                "short_name": "蓝听新版",
                "snow_inventory": 18.25,
            },
            operator="tester",
            operator_name="测试员",
        )
        self.assertEqual(updated["short_name"], "蓝听新版")
        self.assertEqual(updated["snow_inventory"], 18.25)

        self.store.delete_product(
            created["id"],
            operator="tester",
            operator_name="测试员",
        )
        self.store.delete_product(
            second["id"],
            operator="tester",
            operator_name="测试员",
        )
        self.assertEqual(self.store.list_products()["total"], 0)

    def test_stock_import_creates_pending_updates_and_skips_non_box(self):
        current_month = datetime.now().strftime("%Y%m")
        historical_month = (
            datetime.now().replace(day=1) - timedelta(days=1)
        ).strftime("%Y%m")
        rows = parse_stock_workbook(
            stock_file(
                [
                    [
                        current_month,
                        "3101",
                        "雪花干爽9.5度330ml听6*4塑膜六连包纸箱",
                        "箱",
                        1.25,
                        54.5,
                    ],
                    [current_month, "5102", "勇闯天涯太阳伞", "顶", 0, 10],
                ]
            )
        )
        preview = self.store.create_import_preview(
            filename="stock.xlsx",
            operator="tester",
            operator_name="测试员",
            rows=rows,
        )
        self.assertEqual(preview["created_count"], 1)
        self.assertEqual(preview["skipped_count"], 1)
        self.assertEqual(preview["monthly_inbound_tons"], 1.25)
        self.assertEqual(preview["snow_inventory_boxes"], 54.5)
        result = self.store.commit_import_preview(
            preview["preview_id"],
            operator="tester",
            operator_name="测试员",
        )
        self.assertEqual(result["created_count"], 1)
        products = self.store.list_products()
        self.assertEqual(products["total"], 1)
        product = products["items"][0]
        self.assertEqual(product["status"], "待完善")
        self.assertEqual(product["snow_inventory"], 54.5)
        self.assertEqual(product["specification"], 24)
        self.assertEqual(product["auxiliary_unit"], "听")
        self.assertEqual(products["monthly_inbound_tons"], 1.25)
        self.assertEqual(products["snow_inventory_boxes"], 54.5)
        self.assertEqual(products["summary_month"], current_month)
        self.assertEqual(products["summary_months"], [current_month])

        second_rows = parse_stock_workbook(
            stock_file(
                [
                    [
                        current_month,
                        "3101",
                        "雪花干爽9.5度330ml听6*4塑膜六连包纸箱",
                        "箱",
                        2.5,
                        60.25,
                    ]
                ]
            )
        )
        second_preview = self.store.create_import_preview(
            filename="stock2.xlsx",
            operator="tester",
            operator_name="测试员",
            rows=second_rows,
        )
        self.assertEqual(second_preview["updated_count"], 1)
        self.store.commit_import_preview(
            second_preview["preview_id"],
            operator="tester",
            operator_name="测试员",
        )
        self.assertEqual(
            self.store.list_products()["items"][0]["snow_inventory"],
            60.25,
        )

        historical_rows = parse_stock_workbook(
            stock_file(
                [
                    [
                        historical_month,
                        "3101",
                        "雪花干爽9.5度330ml听6*4塑膜六连包纸箱",
                        "箱",
                        3.5,
                        80,
                    ]
                ]
            )
        )
        historical_preview = self.store.create_import_preview(
            filename=f"stock-{historical_month}.xlsx",
            operator="tester",
            operator_name="测试员",
            rows=historical_rows,
        )
        self.assertEqual(historical_preview["summary_only_count"], 1)
        self.store.commit_import_preview(
            historical_preview["preview_id"],
            operator="tester",
            operator_name="测试员",
        )
        current_products = self.store.list_products()
        self.assertEqual(current_products["total"], 1)
        self.assertEqual(current_products["items"][0]["snow_inventory"], 60.25)

        june_summary = self.store.list_products(summary_month=historical_month)
        self.assertEqual(june_summary["monthly_inbound_tons"], 3.5)
        self.assertEqual(june_summary["snow_inventory_boxes"], 60.25)
        self.assertEqual(june_summary["summary_months"], [current_month, historical_month])

        replacement_preview = self.store.create_import_preview(
            filename=f"stock-{historical_month}-replacement.xlsx",
            operator="tester",
            operator_name="测试员",
            rows=parse_stock_workbook(
                stock_file(
                    [
                        [
                            historical_month,
                            "3101",
                            "雪花干爽9.5度330ml听6*4塑膜六连包纸箱",
                            "箱",
                            4,
                            75,
                        ]
                    ]
                )
            ),
        )
        self.store.commit_import_preview(
            replacement_preview["preview_id"],
            operator="tester",
            operator_name="测试员",
        )
        june_replacement = self.store.list_products(summary_month=historical_month)
        self.assertEqual(june_replacement["monthly_inbound_tons"], 4)
        self.assertEqual(june_replacement["snow_inventory_boxes"], 60.25)

        all_months = self.store.list_products(summary_month="all")
        self.assertEqual(all_months["monthly_inbound_tons"], 6.5)
        self.assertEqual(all_months["snow_inventory_boxes"], 60.25)


if __name__ == "__main__":
    unittest.main()
