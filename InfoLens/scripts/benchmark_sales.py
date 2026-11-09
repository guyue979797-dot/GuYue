"""Repeatable sales-query timings using disposable synthetic data, never business databases."""
import json
import sys
import tempfile
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from infolens.sales import SalesStore, REQUIRED
from infolens.products import ProductStore
from infolens.product_policies import ProductPolicyStore
from infolens.policy_costs import PolicyCostAllocator
from infolens.sales_profit import SalesProfitQuery


def benchmark():
    with tempfile.TemporaryDirectory(prefix='infolens-sales-benchmark-') as directory:
        root = Path(directory)
        products = ProductStore(root / 'products.db')
        ProductPolicyStore(products)
        products.create_product(dict(product_codes=['P'], short_name='基准商品', product_name='基准商品',
            housekeeper_codes=['A'], specification=12, auxiliary_unit='听', snow_inventory=0, cost_price=30),
            operator='benchmark', operator_name='性能测试')
        sales = SalesStore(root / 'sales.db')
        rows = []
        for index in range(10000):
            source = dict.fromkeys(REQUIRED, '')
            source.update({'单据日期': '2026-07-01', '单据类型': '销售单', '单据编号': f'PERF{index:05}',
                '存货编号': 'A', '存货全名': '基准商品', '客户全名': '合成客户', '经办人全名': '合成人员',
                '数量': 12, '单位': '听', '辅1数量': 1, '折后单价': (40 + index % 60) / 12,
                '折后金额': 40 + index % 60, '成本单价': 5, '行摘要': '正常销售'})
            rows.append({'source': source, 'date': source['单据日期']})
        sales.upload(REQUIRED, rows, 'benchmark.xlsx')
        allocator = PolicyCostAllocator(products, sales)
        query = SalesProfitQuery(sales, products, allocator)
        measurements = {}
        for name, parameters in [('default', {}), ('profit', {'sort_by': 'profit', 'sort_order': 'desc'}),
                ('profit_page2', {'sort_by': 'profit', 'sort_order': 'desc', 'page': 2})]:
            timings = []
            for _ in range(5):
                start = perf_counter()
                result = query(page_size=50, **parameters)
                timings.append(round((perf_counter() - start) * 1000, 2))
                assert result['total'] == 10000 and len(result['items']) == 50
            measurements[name] = timings
        print(json.dumps({'rows': 10000, 'milliseconds': measurements}, ensure_ascii=False, indent=2))
        allocator.revisions.close()
        query.revisions.close()


if __name__ == '__main__':
    benchmark()
