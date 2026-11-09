import io
import tempfile
import unittest
from pathlib import Path
from openpyxl import Workbook
from infolens.sales import REQUIRED, SalesStore, analyze, classify, parse_workbook, number, money, pricing_quantity


def row(doc='S1', sku='A', qty=10, amount=100, summary='', **extra):
    source = dict.fromkeys(REQUIRED, '')
    source.update({'单据日期': '2026-07-01', '单据类型': '销售单', '单据编号': doc,
                   '存货编号': sku, '存货全名': sku, '客户全名': '店一', '经办人全名': '业务一',
                   '数量': qty, '单位': '听', '辅1数量': qty / 12, '折后单价': amount / qty if qty else 0,
                   '折后金额': amount, '成本单价': 5, '行摘要': summary})
    source.update(extra)
    return {'source': source, 'date': source['单据日期']}


class SalesTests(unittest.TestCase):
    def test_invalid_gift_case_quantity_rejected_before_import(self):
        headers = REQUIRED + ['赠品辅1数量']
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(headers)
        source = row(**{'赠品辅1数量': '不是数字'})['source']
        sheet.append([source.get(key) for key in headers])
        stream = io.BytesIO()
        workbook.save(stream)
        stream.seek(0)
        with self.assertRaisesRegex(ValueError, '第 2 行.*无效数值'):
            parse_workbook(stream)

    def test_classification_priority(self):
        cases = [({'单据类型': '销售退货单', '存货全名': '超勇听盖子', '仓库全名': '临期仓'}, '盖子回收'),
                 ({'单据类型': '销售退货单', '仓库全名': '临期仓'}, '临期退货'),
                 ({'单据类型': '销售退货单'}, '销售退货'), ({'客户全名': '串货'}, '串货处理'),
                 ({'行摘要': '兑盖陈列赠送换'}, '兑盖'), ({'行摘要': '陈列搭赠'}, '陈列'),
                 ({'行摘要': '品鉴'}, '客情'), ({'行摘要': '换'}, '换货退货'), ({}, '无法分类')]
        for extra, expected in cases:
            self.assertEqual(classify(row(amount=0, **extra)['source']), expected)

    def test_pairing_prefers_identical_sku_before_largest_quantity(self):
        result = analyze([row(sku='A', qty=20, amount=100), row(sku='B', qty=10, amount=50),
                          row(sku='B', qty=2, amount=0, summary='搭赠'), row(doc='H', sku='B', amount=50, 单据日期='2026-06-01')])
        self.assertEqual(result[2]['analysis']['分类'], '本品搭赠')
        self.assertEqual(result[2]['analysis']['搭赠匹配商品'], 'B')
        self.assertEqual(result[0]['analysis']['真实金额'], 100)
        self.assertEqual(number(result[1]['analysis']['真实金额']) + number(result[2]['analysis']['真实金额']), 50)

    def test_explicit_summary_overrides_same_sku_and_missing_sku_uses_quantity(self):
        result = analyze([row(sku='A', qty=20, amount=100), row(sku='B', qty=10, amount=50),
                          row(sku='B', qty=2, amount=0, summary='A搭赠'),
                          row(sku='C', qty=1, amount=0, summary='搭赠')])
        self.assertEqual(result[2]['analysis']['分类'], '非本品搭赠')
        self.assertEqual(result[2]['analysis']['搭赠匹配商品'], 'A')
        self.assertEqual(result[3]['analysis']['搭赠匹配商品'], 'A')

    def test_summary_short_product_name_overrides_largest_sale(self):
        result = analyze([
            row(doc='H', sku='OLD', qty=10, amount=30, 单据日期='2026-06-01'),
            row(sku='BRAVE', qty=60, amount=300, 存货全名='勇闯天涯（听装）'),
            row(sku='PURE', qty=36, amount=180, 存货全名='纯生（听装）'),
            row(sku='OLD', qty=0, amount=0, summary='纯生搭赠', 赠品=12, 存货全名='雪花老雪（听装）'),
        ])
        self.assertEqual(result[3]['analysis']['搭赠匹配商品'], '纯生（听装）')
        self.assertEqual(result[3]['analysis']['分类'], '非本品搭赠')
        self.assertEqual(result[1]['analysis']['真实金额'], 300)
        self.assertEqual(sum(number(r['analysis']['真实金额']) for r in result[1:]), 480)

    def test_ambiguous_short_name_is_not_treated_as_unique(self):
        from infolens.sales import named_sale_skus
        normal = {'B': [row(sku='B', 存货全名='纯生（瓶装）')], 'C': [row(sku='C', 存货全名='纯生（听装）')]}
        self.assertEqual(named_sale_skus('纯生搭赠', normal), ['B', 'C'])
        self.assertEqual(named_sale_skus('纯生（听装）搭赠', normal), ['C'])

    def test_named_pair_and_same_product_rounding(self):
        result = analyze([row(sku='A', qty=3, amount=10), row(sku='B', qty=100, amount=100),
                          row(sku='A', qty=3, amount=0, summary='A搭赠')])
        self.assertEqual(result[2]['analysis']['分类'], '本品搭赠')
        self.assertEqual(result[0]['analysis']['真实单价'], result[2]['analysis']['真实单价'])
        self.assertTrue(all(r['analysis']['单据核对状态'] == '一致' for r in result))
        self.assertEqual(sum(number(r['analysis']['真实金额']) for r in result), 110)

    def test_missing_history_does_not_invent_price(self):
        result = analyze([row(), row(sku='B', amount=0, summary='搭赠')])
        self.assertTrue(all(r['analysis']['真实金额'] is None for r in result))
        self.assertEqual(result[1]['analysis']['匹配状态'], '待处理：无可用历史价格')

    def test_cross_gift_scaling(self):
        result = analyze([row(doc='H', sku='B', amount=1000, 单据日期='2026-06-01'),
                          row(amount=10), row(sku='B', qty=2, amount=0, summary='搭赠')])
        self.assertEqual(result[1]['analysis']['真实金额'], 0)
        self.assertEqual(result[2]['analysis']['真实金额'], 10)
        self.assertEqual(result[2]['analysis']['单据核对状态'], '一致')

    def test_history_mode_cost_and_latest_tie_break(self):
        result = analyze([row(doc='H1', sku='B', amount=40, 单据日期='2026-06-01'),
                          row(doc='H2', sku='B', amount=60, 单据日期='2026-06-02'),
                          row(), row(sku='B', qty=1, amount=0, summary='搭赠')])
        self.assertEqual(result[-1]['analysis']['真实单价'], 6)
        self.assertEqual(result[-1]['analysis']['历史参考单据'], 'H2')

    def test_risk_excludes_gifts_and_preserves_returns(self):
        result = analyze([row(qty=10, amount=100), row(qty=10, amount=120),
                          row(doc='R', amount=-10, 单据类型='销售退货单', 存货全名='超勇听盖子')])
        self.assertIn('价格问题', result[0]['analysis']['明细风险'])
        self.assertEqual(result[2]['analysis']['真实金额'], -10)
        self.assertEqual(result[2]['analysis']['单据核对状态'], '一致')

    def test_parse_dates_and_validation(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(REQUIRED)
        original = row()['source']
        original['单据日期'] = 46204
        sheet.append([original[h] for h in REQUIRED])
        stream = io.BytesIO()
        workbook.save(stream)
        stream.seek(0)
        _, rows = parse_workbook(stream)
        self.assertRegex(rows[0]['date'], r'^2026-')
        sheet.append([original[h] if h != '数量' else '错误' for h in REQUIRED])
        stream = io.BytesIO()
        workbook.save(stream)
        stream.seek(0)
        with self.assertRaisesRegex(ValueError, '第 3 行'):
            parse_workbook(stream)

    def test_gift_quantity_column_prices_and_reconciles(self):
        results = analyze([
            row(doc='H', sku='B', qty=10, amount=50, 单据日期='2026-06-01'),
            row(qty=10, amount=100),
            row(sku='A', qty=0, amount=0, summary='A搭赠', 赠品=2),
            row(sku='B', qty=0, amount=0, summary='A搭赠', 赠品=3),
        ])
        self.assertEqual(results[3]['analysis']['真实金额'], 15)
        self.assertGreater(results[2]['analysis']['真实金额'], 0)
        for r in results:
            a = r['analysis']
            self.assertEqual(money(number(a['真实单价']) * pricing_quantity(r['source'])), number(a['真实金额']))
        self.assertEqual(sum(number(r['analysis']['真实金额']) for r in results[1:]), 100)

    def test_fractional_allocation_adjusts_price_to_match_cent_amount(self):
        results = analyze([row(qty=1, amount=1), row(qty=1, amount=1),
                           row(qty=0, amount=0, summary='搭赠', 赠品=1)])
        self.assertEqual(sum(number(r['analysis']['真实金额']) for r in results), 2)
        for r in results:
            self.assertEqual(money(number(r['analysis']['真实单价']) * pricing_quantity(r['source'])), number(r['analysis']['真实金额']))

    def test_delete_rows_is_physical_and_recalculates_remaining(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SalesStore(Path(directory) / 'sales.db')
            store.upload(REQUIRED, [row(qty=10, amount=100), row(qty=0, amount=0, summary='搭赠', 赠品=10)], 'delete.xlsx')
            items = store.list_rows()['items']
            self.assertEqual(items[0]['values']['真实金额'], 50)
            self.assertEqual(store.delete_rows([items[1]['id']])['deleted'], 1)
            self.assertEqual(store.list_rows()['items'][0]['values']['真实金额'], 100)
            with store.connect() as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM sales WHERE id=?', (items[1]['id'],)).fetchone()[0], 0)
            with self.assertRaises(ValueError):
                store.delete_rows([items[0]['id'], 999999])
            self.assertEqual(store.list_rows()['total'], 1)
            from unittest.mock import patch
            with patch('infolens.sales.analyze', side_effect=ValueError('重算失败')):
                with self.assertRaises(ValueError):
                    store.delete_rows([items[0]['id']])
            self.assertEqual(store.list_rows()['total'], 1)
            store.delete_rows([items[0]['id']])
            self.assertEqual(store.list_rows()['total'], 0)
            for invalid in ([], None, ['1'], [True]):
                with self.assertRaises(ValueError):
                    store.delete_rows(invalid)

    def test_product_options_follow_inventory_code_order(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SalesStore(Path(directory) / 'sales.db')
            store.upload(REQUIRED, [row(doc='A', sku='010', 存货全名='甲商品'),
                                    row(doc='B', sku='002', 存货全名='乙商品'),
                                    row(doc='C', sku='100', 存货全名='丙商品'),
                                    row(doc='D', sku='011', 存货全名='甲商品')], 'options.xlsx')
            self.assertEqual(store.list_rows()['options']['product'], ['乙商品', '甲商品', '丙商品'])
            self.assertEqual(store.list_rows(document='B')['options']['product'], ['乙商品', '甲商品', '丙商品'])

    def test_multi_category_include_exclude_and_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SalesStore(Path(directory) / 'sales.db')
            store.upload(REQUIRED, [row(doc='A'), row(doc='B', amount=0, summary='陈列'),
                                    row(doc='C', amount=0, summary='客情')], 'categories.xlsx')
            selected = ['陈列', '客情']
            self.assertEqual(store.list_rows(category=selected)['total'], 2)
            remaining = store.list_rows(category=selected, category_mode='exclude', sort_by='date', sort_order='desc')
            self.assertEqual(remaining['total'], 1)
            self.assertEqual(remaining['items'][0]['values']['分类'], '正常销售')
            self.assertEqual(store.list_rows(category=[], category_mode='exclude')['total'], 3)
            self.assertEqual(store.list_rows(category='陈列')['total'], 1)
            with self.assertRaises(ValueError):
                store.list_rows(category_mode='invalid')

    def test_server_sort_numeric_text_and_cross_page(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SalesStore(Path(directory) / 'sales.db')
            rows = [row(doc=f'D{i:02}', qty=1, amount=i + 1,
                        单据日期=f'2026-07-{i + 1:02}', 经办人全名=f'业务{i:02}',
                        客户备用2=f'{i:04}') for i in range(25)]
            store.upload(REQUIRED, rows, 'sort.xlsx')
            for field in ('unit_price', 'real_price', 'date', 'salesperson', 'terminal_code'):
                first = store.list_rows(sort_by=field, sort_order='desc')
                second = store.list_rows(sort_by=field, sort_order='desc', page=2)
                self.assertEqual(first['items'][0]['values']['单据编号'], 'D24')
                self.assertEqual(second['items'][-1]['values']['单据编号'], 'D00')
            result = store.list_rows(sort_by='category', sort_order='asc', customer='店一')
            self.assertEqual(result['total'], 25)
            with self.assertRaises(ValueError):
                store.list_rows(sort_by='injected', sort_order='asc')
            with self.assertRaises(ValueError):
                store.list_rows(sort_by='date', sort_order='invalid')

    def test_combined_filters_options_and_date_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SalesStore(Path(directory) / 'sales.db')
            store.upload(REQUIRED, [
                row(doc='D1', 客户全名='绿谷超市', 客户备用2='00123', 客户备用4='便利店'),
                row(doc='D2', 单据日期='2026-07-02', 客户全名='另一家', 经办人全名='业务二'),
            ], 'filters.xlsx')
            filters = dict(document_type='销售单', month='2026-07', salesperson='业务一',
                           terminal_code='00123', customer_type='便利店', customer='绿谷',
                           product='A', category='正常销售', date_start='2026-07-01', date_end='2026-07-01')
            result = store.list_rows(**filters)
            self.assertEqual(result['total'], 1)
            self.assertEqual(result['items'][0]['values']['单据编号'], 'D1')
            self.assertEqual(result['options']['salesperson'], ['业务一', '业务二'])
            self.assertEqual(store.list_rows(**{**filters, 'customer': '%'})['total'], 0)
            self.assertEqual(store.list_rows(date_start='2026-07-02')['total'], 1)
            with self.assertRaises(ValueError):
                store.list_rows(date_start='2026-07-03', date_end='2026-07-01')
            with self.assertRaises(ValueError):
                store.list_rows(date_start='invalid')

    def test_store_reimport_replace_and_literal_search(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SalesStore(Path(directory) / 'sales.db')
            store.upload(REQUIRED, [row(doc='S%1'), row(doc='S2')], 'first.xlsx')
            store.upload(REQUIRED, [row(doc='S%1', amount=200)], 'second.xlsx')
            self.assertEqual(store.list_rows()['total'], 2)
            found = store.list_rows(document='%')
            self.assertEqual(found['total'], 1)
            self.assertEqual(found['items'][0]['values']['折后金额'], 200)
            self.assertEqual(found['items'][0]['values']['单据年月'], '2026-07')
            self.assertEqual(store.list_rows(document='不存在')['items'], [])
            with self.assertRaises(ValueError):
                store.list_rows(page=0)
