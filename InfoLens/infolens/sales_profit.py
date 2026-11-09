"""按存货编号关联商品的当前成本与规格；查询时计算，避免成本更新后结果陈旧。"""
from .sales import number, money
from .policy_costs import ELIGIBLE, COST_LOCK
from .sqlite_revisions import SQLiteRevisions
from copy import deepcopy

PROFIT_FIELDS = ['单件利润', '利润率', '利润参考成本价', '利润参考规格', '利润计算状态', '成本来源', '政策成本分配', '政策用量（件）', '商品成本用量（件）']


def enrich_sales_profit(result, product_store, allocator=None):
    allocated = allocator.refresh() if allocator else None
    with product_store._connect() as db:
        products = {row['code']: dict(row) for row in db.execute('''
            SELECT codes.code, products.cost_price, products.specification
            FROM product_housekeeper_codes AS codes
            JOIN products ON products.id=codes.product_id
            WHERE products.deleted_at=''
        ''')}
    for item in result['items']:
        values = item['values']
        values.update(dict.fromkeys(PROFIT_FIELDS))
        if values.get('分类') not in ELIGIBLE:
            values['利润计算状态'] = '不适用：仅正常销售及本品/非本品搭赠计算利润'
            continue
        product = products.get(str(values.get('存货编号') or '').strip())
        if not product:
            values['利润计算状态'] = '未匹配商品存货编号'
            continue
        cost_row = allocated.get(item.get('id')) if allocated is not None else None
        if cost_row is not None:
            item['cost_sources'] = cost_row.get('sources', [])
            values['成本来源'] = '；'.join(policy['label'] for policy in item['cost_sources'])
            values['政策成本分配'] = cost_row['allocation']
            values['政策用量（件）'] = cost_row['policy_quantity']
            values['商品成本用量（件）'] = cost_row['fallback_quantity']
        effective_cost = cost_row['cost'] if cost_row is not None else product['cost_price']
        values['利润参考成本价'] = float(number(effective_cost)) if effective_cost is not None else None
        values['利润参考规格'] = product['specification']
        if effective_cost is None:
            values['利润计算状态'] = cost_row['status'] if cost_row else '商品未填写成本价'
            continue
        if product['specification'] is None or number(product['specification']) <= 0:
            values['利润计算状态'] = '商品缺少有效存货规格'
            continue
        if values.get('真实单价') is None:
            values['利润计算状态'] = '真实单价待定'
            continue
        cost = number(effective_cost)
        profit = money(number(values['真实单价']) * number(product['specification']) - cost)
        values['单件利润'] = float(profit)
        values['利润率'] = float(profit / cost) if cost else None
        values['利润计算状态'] = '已计算' if cost else '成本价为0，利润率无法计算'
    result['columns'] = list(dict.fromkeys(result['columns'] + PROFIT_FIELDS))
    return result


PROFIT_SORT_FIELDS = {'unit_profit': '单件利润', 'profit_rate': '利润率', 'profit': '利润'}


def profit_sort_key(item, field, direction):
    values = item['values']
    amount = values.get(PROFIT_SORT_FIELDS[field]) if field != 'profit' else values.get('单件利润')
    if amount is not None and field == 'profit':
        amount = float(money(number(amount) *
            (number(values.get('辅1数量')) + number(values.get('赠品辅1数量')))))
    return (amount is None, (amount if direction == 'asc' else -amount) if amount is not None else 0, item['id'])


class SalesProfitQuery:
    """One bounded matching snapshot; cache orders, never stale business values."""
    def __init__(self, sales, products, allocator):
        self.sales, self.products, self.allocator = sales, products, allocator
        self.revisions = allocator.revisions if allocator else SQLiteRevisions([products.database_path, sales.database])
        self.revision = self.query = self.result = None
        self.orders = {}

    def __call__(self, **query):
        with COST_LOCK:
            page, size = query.get('page', 1), query.get('page_size', 20)
            field, direction = query.get('sort_by', ''), query.get('sort_order', '')
            if page < 1 or size not in (20, 50, 100, 500, 1000):
                raise ValueError('分页参数不正确')
            filters = {k: v for k, v in query.items() if k not in ('page', 'page_size', 'sort_by', 'sort_order')}
            if field in PROFIT_SORT_FIELDS:
                if direction not in ('asc', 'desc'):
                    raise ValueError('排序参数不正确')
            elif field or direction:
                # Ordinary sorting remains SQLite's responsibility.
                filters.update(sort_by=field, sort_order=direction)
            before = self.revisions.read()
            if self.revision != before or self.query != filters:
                base = {**filters, 'page': 1, 'page_size': 20, 'all_rows': True}
                result = enrich_sales_profit(self.sales.list_rows(**base), self.products, self.allocator)
                after = self.revisions.read()
                self.revision = after if before == after else None
                self.query, self.result, self.orders = deepcopy(filters), result, {}
            result = self.result
            if field in PROFIT_SORT_FIELDS:
                order = (field, direction)
                if order not in self.orders:
                    self.orders[order] = sorted(result['items'], key=lambda item: profit_sort_key(item, field, direction))
                items = self.orders[order]
            else:
                items = result['items']
            # Copy only the page, so callers cannot corrupt cached rows/options.
            return deepcopy({**result, 'items': items[(page - 1) * size:page * size]})
