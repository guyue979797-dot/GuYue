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

    def test_normal_product_options_survive_month_change(self):
        def create(code, status):
            return self.store.create_product({'product_codes':[code],'housekeeper_codes':['G-'+code],
                'product_name':code, 'short_name':code, 'snow_inventory':1,'specification':12,
                'auxiliary_unit':'听', 'status':status},operator='tester',operator_name='测试员')
        normal=create('NORMAL','正常')
        create('PENDING','待处理')
        create('OFFLINE','下线')
        removed=create('REMOVED','正常')
        self.store.delete_product(removed['id'],operator='tester',operator_name='测试员')
        with self.store._connect() as db:
            db.execute("UPDATE products SET stock_month='202001'")
        options=self.store.normal_product_options()
        self.assertEqual([item['id'] for item in options],[normal['id']])
        self.assertEqual(options[0]['short_name'],'NORMAL')

    def test_single_unique_stock_code_and_shared_product_codes_import_conflict(self):
        def create(stock):
            return self.store.create_product({
                'product_codes':['SHARED','OTHER'], 'product_name':'测试1*12听',
                'short_name':'测试', 'housekeeper_codes':stock, 'specification':12,
                'auxiliary_unit':'听', 'snow_inventory':0,
            }, operator='tester', operator_name='测试员')
        one = create(['S1'])
        two = create(['S2'])
        self.assertEqual(one['product_codes'],two['product_codes'])
        with self.assertRaisesRegex(ValueError,'只能设置一个'):
            create(['S3','S4'])
        with self.assertRaisesRegex(ValueError,'存货编号'):
            create(['S1'])
        self.assertEqual(self.store.list_products()['total'],2)
        rows = parse_stock_workbook(stock_file([[datetime.now().strftime('%Y%m'),'SHARED','测试1*12听','箱',1,99]]))
        preview = self.store.create_import_preview(filename='stock.xlsx',operator='tester',operator_name='测试员',rows=rows)
        self.assertEqual(preview['failed_count'],1)
        self.assertIn('对应多个商品',preview['details'][0]['message'])
        with self.assertRaises(ValueError):
            self.store.commit_import_preview(preview['preview_id'],operator='tester',operator_name='测试员')
        self.assertEqual(self.store.get_product(one['id'])['snow_inventory'],0)
        self.assertEqual(self.store.get_product(two['id'])['snow_inventory'],0)

    def test_legacy_unique_product_code_migration_preserves_data(self):
        product = self.store.create_product({'product_codes':['OLD'], 'product_name':'旧商品',
            'housekeeper_codes':['OLD-STOCK'],'snow_inventory':0,'status':'待处理'},operator='tester',operator_name='测试员')
        with self.store._connect() as db:
            db.execute('ALTER TABLE product_codes RENAME TO old_codes')
            db.execute('CREATE TABLE product_codes(product_id INTEGER NOT NULL REFERENCES products(id),code TEXT NOT NULL UNIQUE,PRIMARY KEY(product_id,code))')
            db.execute('INSERT INTO product_codes SELECT * FROM old_codes')
            db.execute('DROP TABLE old_codes')
        reopened=ProductStore(self.store.database_path)
        self.assertEqual(reopened.get_product(product['id'])['product_codes'],['OLD'])
        repeated=reopened.create_product({'product_codes':['OLD'],'product_name':'新商品',
            'housekeeper_codes':['NEW-STOCK'],'snow_inventory':0,'status':'待处理'},operator='tester',operator_name='测试员')
        self.assertEqual(repeated['product_codes'],['OLD'])
        self.assertEqual(reopened.get_product(product['id'])['housekeeper_codes'],['OLD-STOCK'])

    def test_status_lifecycle_and_upload_preserves_offline(self):
        product = self.store.create_product({
            'product_codes':['OFFLINE'], 'product_name':'下线测试', 'snow_inventory':0,
            'status':'下线',
        }, operator='tester', operator_name='测试员')
        self.assertEqual(product['status'],'下线')
        self.assertEqual(self.store.list_products(status='下线')['total'],1)
        self.assertEqual(self.store.list_products(status='待处理')['total'],0)
        product = self.store.update_product(product['id'], {**product, 'status':'待处理'}, operator='tester', operator_name='测试员')
        self.assertEqual(product['status'],'待处理')
        self.assertEqual(self.store.list_products(status='待处理')['total'],1)
        current_month = datetime.now().strftime('%Y%m')
        rows = parse_stock_workbook(stock_file([[current_month,'OFFLINE','测试500ml听1*12','箱',1,10]]))
        product = self.store.update_product(product['id'], {**product, 'status':'下线'}, operator='tester', operator_name='测试员')
        preview = self.store.create_import_preview(filename='stock.xlsx',operator='tester',operator_name='测试员',rows=rows)
        self.store.commit_import_preview(preview['preview_id'],operator='tester',operator_name='测试员')
        self.assertEqual(self.store.get_product(product['id'])['status'],'下线')
        with self.assertRaises(ValueError):
            self.store.update_product(product['id'], {**product,'status':'正常'},operator='tester',operator_name='测试员')

    def test_brand_grade_and_global_tree_counts(self):
        def create(code, brand='', grade=''):
            return self.store.create_product({
                'product_codes': [code], 'short_name': code, 'product_name': code,
                'housekeeper_codes': ['G-' + code], 'specification': 12,
                'auxiliary_unit': '听', 'snow_inventory': 1,
                'brand': brand, 'grade': grade,
            }, operator='tester', operator_name='测试员')
        first = create('B1', '雪花', '高端')
        create('B2', '雪花', '普通')
        create('B3')
        create('B4', '未设置品牌')
        self.assertEqual(first['brand'], '雪花')
        self.assertEqual(first['grade'], '高端')
        result = self.store.list_products(brand='雪花', page_size=1)
        self.assertEqual(result['total'], 2)
        self.assertEqual({item['brand']:item['count'] for item in result['brands']}, {'雪花':2, '':1, '未设置品牌':1})
        self.assertEqual(self.store.list_products(unbranded=True)['total'], 1)
        self.assertEqual(self.store.list_products(brand='未设置品牌')['total'], 1)
        self.assertEqual(self.store.list_products(brand='雪')['total'], 0)
        payload = dict(first)
        payload.pop('brand'); payload.pop('grade')
        updated = self.store.update_product(first['id'], payload, operator='tester', operator_name='测试员')
        self.assertEqual((updated['brand'],updated['grade']), ('雪花','高端'))
        updated = self.store.update_product(first['id'], {**updated, 'brand':'青岛','grade':'特级'}, operator='tester', operator_name='测试员')
        self.assertEqual(self.store.list_products(brand='青岛')['total'],1)
        self.assertEqual(updated['grade'],'特级')
        self.store.delete_product(first['id'], operator='tester', operator_name='测试员')
        self.assertNotIn('青岛', {item['brand'] for item in self.store.list_products()['brands']})
        with self.assertRaises(ValueError):
            create('BAD', '过长' * 26)

    def test_fixed_catalog_keeps_inventory_across_months_and_manual_edits(self):
        product = self.store.create_product({
            'product_codes': ['FIXED'], 'short_name': '测试', 'product_name': '测试商品',
            'snow_inventory': 12.5, 'housekeeper_codes': ['FIXED-G'],
            'specification': 12, 'auxiliary_unit': '听',
        }, operator='tester', operator_name='测试员')
        with self.store._connect() as db:
            db.execute("UPDATE products SET stock_month='202001' WHERE id=?", (product['id'],))
        result = self.store.list_products()
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['snow_inventory_boxes'], 12.5)
        self.assertEqual(result['summary_month'], 'all')
        self.store.delete_product(product['id'], operator='tester', operator_name='测试员')
        result = self.store.list_products()
        self.assertEqual(result['total'], 0)
        self.assertEqual(result['snow_inventory_boxes'], 0)

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

        repeated = self.store.create_product(
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

        self.assertEqual(repeated["product_codes"], ["P001"])
        self.store.delete_product(repeated["id"], operator="tester", operator_name="测试员")

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
        self.assertEqual(product["status"], "待处理")
        self.assertEqual(product["snow_inventory"], 54.5)
        self.assertEqual(product["specification"], 24)
        self.assertEqual(product["auxiliary_unit"], "听")
        self.assertEqual(products["monthly_inbound_tons"], 1.25)
        self.assertEqual(products["snow_inventory_boxes"], 54.5)
        self.assertEqual(products["summary_month"], "all")
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

    def test_product_archive_remains_visible_without_current_month_stock(self):
        product = self.store.create_product(dict(
            product_codes=['HISTORY-P'], short_name='历史商品', product_name='历史商品',
            snow_inventory=12, housekeeper_codes=['HISTORY-G'], specification=12,
            auxiliary_unit='听', cost_price=20,
        ), operator='test', operator_name='测试')
        with self.store._connect() as connection:
            connection.execute("UPDATE products SET stock_month = '202001' WHERE id = ?", (product['id'],))
        for month in ('', '202001', datetime.now().strftime('%Y%m'), 'all'):
            result = self.store.list_products(summary_month=month)
            self.assertEqual(result['total'], 1)
            self.assertEqual(result['items'][0]['id'], product['id'])
        self.assertEqual(self.store.list_products(name='不存在')['total'], 0)

    def test_optional_cost_price_create_edit_and_reopen(self):
        payload = dict(product_codes=['COST-P'], short_name='成本测试', product_name='成本测试商品', snow_inventory=10, housekeeper_codes=['COST-G'], specification=12, auxiliary_unit='听')
        item = self.store.create_product(payload, operator='test', operator_name='测试')
        self.assertIsNone(item['cost_price'])
        item = self.store.update_product(item['id'], {**item, 'cost_price': 42.50}, operator='test', operator_name='测试')
        self.assertEqual(item['cost_price'], 42.5)
        self.assertEqual(ProductStore(self.store.database_path).get_product(item['id'])['cost_price'], 42.5)
        with self.assertRaises(ValueError):
            self.store.update_product(item['id'], {**item, 'cost_price': -1}, operator='test', operator_name='测试')
        item = self.store.update_product(item['id'], {**item, 'cost_price': None}, operator='test', operator_name='测试')
        self.assertIsNone(item['cost_price'])


if __name__ == "__main__":
    unittest.main()
