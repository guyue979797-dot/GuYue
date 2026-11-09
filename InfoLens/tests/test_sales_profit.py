import tempfile
import unittest
from pathlib import Path
from infolens.products import ProductStore
from infolens.sales_profit import enrich_sales_profit, SalesProfitQuery
from infolens.sales import SalesStore, REQUIRED
from test_sales import row


class ProfitTests(unittest.TestCase):
    def test_live_profit_sort_before_pagination_with_nulls_last(self):
        with tempfile.TemporaryDirectory() as directory:
            products = ProductStore(Path(directory) / 'products.db')
            products.create_product(dict(product_codes=['P'], short_name='商品', product_name='商品',
                snow_inventory=0, housekeeper_codes=['A'], specification=12, auxiliary_unit='听', cost_price=30),
                operator='test', operator_name='测试')
            sales = SalesStore(Path(directory) / 'sales.db')
            rows = [row(doc=f'S{i:02}', qty=12 if i % 2 == 0 else 24, amount=24 + i) for i in range(26)]
            rows += [row(doc='SNULL', sku='missing'), row(doc='OTHER', amount=999)]
            sales.upload(REQUIRED, rows, 'sort.xlsx')
            query_sales = SalesProfitQuery(sales, products, None)
            for field in ('profit', 'unit_profit', 'profit_rate'):
                for direction in ('asc', 'desc'):
                    query = dict(document='S', sort_by=field, sort_order=direction, page_size=20)
                    first = query_sales(page=1, **query)
                    second = query_sales(page=2, **query)
                    self.assertEqual(first['total'], 27)
                    items = first['items'] + second['items']
                    self.assertEqual(len({item['id'] for item in items}), 27)
                    self.assertIsNone(items[-1]['values']['单件利润'])
                    amounts = []
                    for item in items[:-1]:
                        values = item['values']
                        unit = values['单件利润']
                        amounts.append(round(unit * values['辅1数量'], 2) if field == 'profit'
                            else values['利润率'] if field == 'profit_rate' else unit)
                    self.assertEqual(amounts, sorted(amounts, reverse=direction == 'desc'))
            with self.assertRaises(ValueError):
                query_sales(sort_by='profit', sort_order='invalid')

    def test_profit_live_cost_missing_zero_and_pending_price(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProductStore(Path(directory) / 'p.db')
            product = store.create_product(dict(product_codes=['P'], short_name='商品', product_name='商品',
                snow_inventory=0, housekeeper_codes=['001007'], specification=12, auxiliary_unit='听', cost_price=30),
                operator='test', operator_name='测试')
            def calculate(code='001007', price=3, category='正常销售'):
                result = {'items': [{'values': {'存货编号': code, '真实单价': price, '分类': category}}], 'columns': []}
                return enrich_sales_profit(result, store)['items'][0]['values']
            values = calculate()
            self.assertEqual(values['单件利润'], 6)
            self.assertEqual(values['利润率'], .2)
            for category in ('本品搭赠', '非本品搭赠'):
                self.assertEqual(calculate(category=category)['单件利润'], 6)
            for category in ('销售退货', '临期退货', '盖子回收', '兑盖', '陈列', '客情', '换货退货', '串货处理', '无法分类'):
                self.assertIsNone(calculate(category=category)['单件利润'])
                self.assertIsNone(calculate(category=category)['利润率'])
            self.assertIsNone(calculate(code='missing')['单件利润'])
            self.assertIsNone(calculate(price=None)['单件利润'])
            for cost, expected_profit, expected_rate in [(40, -4, -.1), (0, 36, None), (None, None, None)]:
                product = store.update_product(product['id'], {**product, 'cost_price': cost}, operator='test', operator_name='测试')
                values = calculate()
                self.assertEqual(values['单件利润'], expected_profit)
                self.assertEqual(values['利润率'], expected_rate)
