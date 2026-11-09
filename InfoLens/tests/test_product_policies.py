import tempfile
import unittest
from pathlib import Path
from infolens.products import ProductStore
from infolens.product_policies import ProductPolicyStore


class ProductPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.products = ProductStore(Path(self.tmp.name) / 'test.sqlite3')
        self.product = self.products.create_product(dict(product_codes=['P1'], short_name='测试', product_name='测试商品', snow_inventory=10, housekeeper_codes=['G1'], specification=12, auxiliary_unit='听'), operator='test', operator_name='测试')
        self.store = ProductPolicyStore(self.products)
        self.payload = dict(product_id=self.product['id'], month='2026-10', price='80.25', quantity='100')

    def tearDown(self):
        self.tmp.cleanup()

    def test_multiple_prices_persistence_filters_and_end(self):
        first = self.store.create(self.payload, 'test')
        second = self.store.create({**self.payload, 'price': '90'}, 'test')
        self.assertEqual(first['used_quantity'], 0)
        self.assertEqual(first['price'], 80.25)
        self.assertEqual(len(ProductPolicyStore(self.products).list(month='2026-10')['items']), 2)
        self.assertEqual(self.store.list(month='2026-11')['items'], [])
        self.assertEqual(self.store.list(product_id='999')['items'], [])
        ended = self.store.end(first['id'], 'tester')
        self.assertEqual(ended['status'], '已结束')
        self.assertEqual(ended['used_quantity'], 0)
        self.assertEqual(self.store.end(first['id'], 'other')['ended_by'], 'tester')
        self.assertEqual(self.store.list()['items'][0]['id'], second['id'])

    def test_validation_and_usage_cannot_be_supplied(self):
        for field, values in {'month': ['2026-13', '', None, '0000-01'], 'price': ['NaN', 'Infinity', '-1', '1.001', None], 'quantity': ['0', '-1', '1.5', True, '1000000001'], 'product_id': [True, None, 999]}.items():
            for value in values:
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    self.store.create({**self.payload, field: value}, 'test')
        item = self.store.create({**self.payload, 'used_quantity': 50, 'status': '已结束'}, 'test')
        self.assertEqual(item['used_quantity'], 0)
        self.assertEqual(item['status'], '进行中')
        with self.assertRaises(ValueError):
            self.store.end(999, 'test')

    def test_catalog_costs_across_months_remaining_and_status(self):
        first = self.store.create(self.payload, 'test')
        next_month = self.store.create({**self.payload, 'month': '2026-11', 'price': '0'}, 'test')
        ended = self.store.create(self.payload, 'test')
        exhausted = self.store.create(self.payload, 'test')
        self.store.end(ended['id'], 'test')
        with self.products._connect() as db:
            db.execute('UPDATE product_cost_policies SET used_quantity = 25.5 WHERE id = ?', (first['id'],))
            db.execute('UPDATE product_cost_policies SET used_quantity = quantity WHERE id = ?', (exhausted['id'],))
        rows = self.store.available_costs([self.product['id']])[self.product['id']]
        self.assertEqual([row['id'] for row in rows], [first['id'], next_month['id']])
        self.assertEqual(rows[0]['remaining_quantity'], 74.5)
        self.assertEqual(rows[0]['price'], 80.25)
        self.assertEqual(rows[1]['price'], 0)
        self.assertEqual(self.store.available_costs([]), {})
        self.assertEqual(self.store.available_costs([999999]), {})

    def test_deleted_product_preserves_policy(self):
        self.store.create(self.payload, 'test')
        self.products.delete_product(self.product['id'], operator='test', operator_name='测试')
        self.assertEqual(self.products.policy_product_options(), [])
        self.assertEqual(self.store.list()['items'][0]['product_name'], '测试商品')
        with self.assertRaises(ValueError):
            self.store.create(self.payload, 'test')

    def test_remarks_validation_and_persistence(self):
        for remarks in ['', '说明' * 25]:
            item = self.store.create({**self.payload, 'remarks': remarks}, 'test')
            self.assertEqual(item['remarks'], remarks)
            self.assertEqual(ProductPolicyStore(self.products).list()['items'][0]['remarks'], remarks)
        for remarks in ['字' * 51, None, 123]:
            with self.assertRaises(ValueError):
                self.store.create({**self.payload, 'remarks': remarks}, 'test')

    def test_status_filter_and_direct_lookup(self):
        ended = self.store.create(self.payload, 'test')
        active = self.store.create({**self.payload, 'month': '2026-11'}, 'test')
        self.store.end(ended['id'], 'test')
        self.assertEqual([row['id'] for row in self.store.list(status='进行中')['items']], [active['id']])
        self.assertEqual([row['id'] for row in self.store.list(status='已结束')['items']], [ended['id']])
        self.assertEqual(self.store.list(status='进行中', month='2026-10')['items'], [])
        self.assertEqual(self.store.get(ended['id'])['status'], '已结束')
        with self.assertRaisesRegex(ValueError, '政策状态'):
            self.store.list(status='未知')
        with self.assertRaisesRegex(ValueError, '不存在'):
            self.store.get(999999)
