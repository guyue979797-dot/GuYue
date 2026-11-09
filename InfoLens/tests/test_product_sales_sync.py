import tempfile
import unittest
from pathlib import Path
from infolens.products import ProductStore
from infolens.product_sales_sync import sync_sales_products, stock_specification


class ProductSalesSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = ProductStore(Path(self.temp.name) / 'products.db')

    def tearDown(self):
        self.temp.cleanup()

    def product(self, code='P1', name='雪花纯生8度500ml听1*12纸箱', stock_code=None):
        return self.store.create_product(dict(product_codes=[code], short_name='', product_name=name,
            snow_inventory=88, housekeeper_codes=[stock_code] if stock_code else [], specification=12,
            auxiliary_unit='听', cost_price=40, settlement_price=60), operator='test', operator_name='测试', allow_incomplete=True)

    def sync(self, rows, **kwargs):
        return sync_sales_products(self.store, rows, operator='test', operator_name='测试', **kwargs)

    def test_unique_match_updates_only_requested_fields_and_is_idempotent(self):
        original = self.product()
        rows = [{'存货编号': '001007', '存货全名': '纯生（听装）', '存货规格': '1*12'}]
        self.assertEqual(self.sync(rows, dry_run=True)['updated'], 1)
        self.assertEqual(self.store.get_product(original['id'])['short_name'], '')
        self.assertEqual(self.sync(rows)['updated'], 1)
        updated = self.store.get_product(original['id'])
        self.assertEqual(updated['short_name'], '纯生（听装）')
        self.assertEqual(updated['housekeeper_codes'], ['001007'])
        self.assertEqual(updated['specification'], 12)
        for field in ('product_name', 'product_codes', 'snow_inventory', 'auxiliary_unit', 'cost_price', 'settlement_price', 'stock_month'):
            self.assertEqual(updated[field], original[field])
        self.assertEqual(self.sync(rows)['unchanged'], 1)
        self.assertEqual(self.store.list_products()['total'], 1)

    def test_duplicate_product_mapping_is_skipped_and_never_creates(self):
        self.product()
        self.product(code='P2', name='雪花纯生8度500ml听1*12换购版')
        result = self.sync([{'存货编号': '001007', '存货全名': '纯生（听装）', '存货规格': '1*12'}])
        self.assertEqual(result['updated'], 0)
        self.assertEqual(result['skipped'], 2)
        self.assertEqual(self.store.list_products()['total'], 2)

    def test_wrong_package_spec_and_conflicting_source_skip(self):
        self.product()
        for rows in ([{'存货编号': '1', '存货全名': '纯生（瓶装）', '存货规格': '1*12'}],
                     [{'存货编号': '1', '存货全名': '纯生（听装）', '存货规格': '1*24'}],
                     [{'存货编号': '1', '存货全名': '纯生（听装）', '存货规格': '1*12'},
                      {'存货编号': '1', '存货全名': '纯生（听装）', '存货规格': '1*24'}]):
            self.assertEqual(self.sync(rows)['updated'], 0)

    def test_spec_conversion_and_existing_code(self):
        for raw, value in [('1*12', 12), ('1*2*6', 12), ('6×4', 24), ('12', 12), ('', None), ('2L*6', None)]:
            self.assertEqual(stock_specification(raw), value)
        p = self.product(stock_code='001007')
        self.assertEqual(self.sync([{'存货编号': '001007', '存货全名': '新纯生（听装）', '存货规格': '1*24'}])['updated'], 1)
        self.assertEqual(self.store.get_product(p['id'])['specification'], 24)
