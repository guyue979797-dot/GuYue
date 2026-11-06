import tempfile
import unittest
from pathlib import Path
from infolens.products import ProductStore
from infolens.sales_profit import enrich_sales_profit


class ProfitTests(unittest.TestCase):
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
