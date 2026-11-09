import json
import tempfile
import unittest
from pathlib import Path

from openpyxl import load_workbook

from infolens.products import ProductStore
from infolens.sales import REQUIRED, SalesStore
from infolens.sales_export import build_sales_workbook
from infolens.sales_profit import enrich_sales_profit
from test_sales import row


class SalesExportTests(unittest.TestCase):
    def test_total_profit_preserves_missing_zero_and_negative_values(self):
        result = {'columns': [], 'items': [{'values': {'单件利润': profit, '辅1数量': 2,
            '赠品辅1数量': 1}} for profit in (None, 0, -1.5)]}
        workbook = load_workbook(build_sales_workbook(result))
        sheet = workbook.active
        index = [cell.value for cell in sheet[1]].index('利润') + 1
        self.assertEqual([sheet.cell(row, index).value for row in (2, 3, 4)], [None, 0, -4.5])
        workbook.close()

    def test_complete_month_includes_hidden_fields_profit_and_literal_text(self):
        with tempfile.TemporaryDirectory() as directory:
            sales = SalesStore(Path(directory) / 'sales.sqlite3')
            products = ProductStore(Path(directory) / 'products.sqlite3')
            products.create_product({'product_codes': ['PRODUCT-A'], 'housekeeper_codes': ['A'],
                'short_name': 'A', 'product_name': 'A商品', 'snow_inventory': 0,
                'specification': 12, 'auxiliary_unit': '听', 'cost_price': 40}, operator='test', operator_name='测试')
            rows = [row(doc=f'S{i:04d}') for i in range(1005)]
            rows[0]['source'].update({'客户备用2': '0012345678', '赠品辅1数量': 2.5,
                '行摘要': '=1+1', '隐藏字段': '@原始文本', '合计（件）': 999})
            other_month = row(doc='AUGUST')
            other_month['date'] = other_month['source']['单据日期'] = '2026-08-01'
            sales.upload(REQUIRED + ['客户备用2', '赠品辅1数量', '隐藏字段'], rows + [other_month], 'sales.xlsx')
            result = enrich_sales_profit(sales.month_rows('2026-07'), products)
            self.assertEqual(result['total'], 1005)
            result['items'][0]['values']['政策成本分配'] = [{'政策': '测试', '件数': 1}]
            workbook = load_workbook(build_sales_workbook(result), data_only=False)
            sheet = workbook.active
            headers = [cell.value for cell in sheet[1]]
            def cell(title, row_number=2):
                return sheet.cell(row_number, headers.index(title) + 1)
            self.assertEqual(sheet.max_row, 1006)
            self.assertEqual(headers[13:17], ['金额', '真实金额', '单价', '真实单价'])
            self.assertEqual(cell('单价').number_format, '0.00')
            self.assertEqual(cell('真实单价').number_format, '0.00')
            self.assertEqual(headers[:4], ['年月', '单据日期', '单据类型', '单据编号'])
            self.assertEqual(cell('年月').value, '2026-07')
            self.assertEqual(cell('单据编号', 1006).value, 'S1004')
            self.assertNotIn('AUGUST', [cell('单据编号', index).value for index in range(2, 1007)])
            self.assertEqual(cell('终端编码').value, '0012345678')
            self.assertEqual(cell('终端编码').data_type, 's')
            self.assertEqual(cell('行摘要').value, '=1+1')
            self.assertEqual(cell('行摘要').data_type, 's')
            self.assertEqual(cell('隐藏字段').value, '@原始文本')
            self.assertEqual(cell('单件成本').value, 40)
            self.assertEqual(cell('单件利润').value, 80)
            self.assertEqual(cell('利润').value, 266.67)
            self.assertEqual(cell('利润率').value, 2)
            self.assertEqual(cell('利润率').number_format, '0.00%')
            self.assertAlmostEqual(cell('合计（件）').value, 10 / 12 + 2.5)
            self.assertEqual(cell('原始·合计（件）').value, 999)
            self.assertEqual(json.loads(cell('政策成本分配').value), [{'政策': '测试', '件数': 1}])
            self.assertEqual(sheet.freeze_panes, 'A2')
            workbook.close()

    def test_month_validation_and_empty_month(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SalesStore(Path(directory) / 'sales.sqlite3')
            for month in (None, '', '2026-1', '2026-13', '0000-01', '2026-07 OR 1=1'):
                with self.subTest(month=month), self.assertRaises(ValueError):
                    store.month_rows(month)
            self.assertEqual(store.month_rows('2026-07')['total'], 0)
