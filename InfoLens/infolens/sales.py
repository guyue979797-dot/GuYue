"""销售明细分析。业务规则来自 sales-detail-analysis；原始值与分析字段分开保存。"""
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
import re
import sqlite3
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel

FIELDS = ['单据年月', '分类', '真实单价', '真实金额', '搭赠匹配商品', '计算方式', '匹配状态',
          '历史参考日期', '历史参考单据', '历史参考客户', '历史参考依据', '单据核对状态', '明细风险']
REQUIRED = ['单据日期', '单据类型', '单据编号', '存货编号', '存货全名', '客户全名',
            '经办人全名', '单位', '数量', '辅1数量', '折后单价', '折后金额', '成本单价', '仓库全名', '行摘要']
CENT = Decimal('.01')


def number(value):
    try:
        result = Decimal(str(value or 0).replace(',', ''))
        if not result.is_finite():
            raise InvalidOperation
        return result
    except InvalidOperation:
        raise ValueError(f'无效数值：{value}') from None


def pricing_quantity(source):
    """原销售表销售数量和赠品数量分列；非零赠品优先，否则取数量。"""
    gift = number(source.get('赠品'))
    return gift if gift else number(source.get('数量'))


def calculated_price(amount, quantity):
    return float(amount / quantity) if quantity else (0.0 if amount == 0 else None)


def money(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def date_text(value, epoch=None):
    if isinstance(value, (int, float)):
        value = from_excel(value, epoch) if epoch else from_excel(value)
    if isinstance(value, (date, datetime)):
        return value.strftime('%Y-%m-%d')
    match = re.match(r'^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})', str(value or '').strip())
    if not match:
        raise ValueError(f'无法识别单据日期：{value}')
    return date(*map(int, match.groups())).isoformat()


def parse_workbook(stream):
    workbook = load_workbook(stream, read_only=True, data_only=True)
    try:
        for sheet in workbook:
            iterator = sheet.iter_rows(values_only=True)
            for index, values in enumerate(iterator, 1):
                headers = [str(v).strip() if v is not None else '' for v in values]
                if '单据编号' not in headers or '单据日期' not in headers:
                    if index >= 20:
                        break
                    continue
                missing = set(REQUIRED) - set(headers)
                if missing:
                    raise ValueError('销售表缺少字段：' + '、'.join(sorted(missing)))
                headers = [h or f'未命名列{i + 1}' for i, h in enumerate(headers)]
                if len(set(headers)) != len(headers):
                    raise ValueError('销售表存在重复列名')
                if set(headers) & set(FIELDS):
                    raise ValueError('请上传原始销售明细表，不能包含分析结果字段')
                rows = []
                for row_index, values in enumerate(iterator, index + 1):
                    if not any(v is not None and v != '' for v in values):
                        continue
                    source = dict(zip(headers, values))
                    if not source.get('单据编号'):
                        raise ValueError(f'第 {row_index} 行缺少单据编号，请移除汇总行后上传')
                    try:
                        normalized_date = date_text(source['单据日期'], workbook.epoch)
                        for field in ['数量', '赠品', '辅1数量', '赠品辅1数量', '折后单价', '折后金额', '成本单价']:
                            number(source.get(field))
                    except ValueError as exc:
                        raise ValueError(f'第 {row_index} 行：{exc}') from exc
                    for key, value in source.items():
                        if isinstance(value, (date, datetime)):
                            source[key] = value.isoformat()
                    rows.append({'source': source, 'date': normalized_date})
                if not rows:
                    raise ValueError('销售表没有明细数据')
                return headers, rows
        raise ValueError('未找到销售明细表头（前20行）')
    finally:
        workbook.close()


def classify(s):
    if s['单据类型'] == '销售退货单':
        if s['存货全名'] in ('超勇听盖子', '勇闯听盖子', '超勇瓶盖子'):
            return '盖子回收'
        return '临期退货' if s['仓库全名'] == '临期仓' else '销售退货'
    if s['客户全名'] == '串货':
        return '串货处理'
    if number(s['折后金额']) == 0:
        text = str(s.get('行摘要') or '')
        for words, label in [
            (('兑盖', '换盖', '盖子兑换', '兑奖盖子', '盖子已收', '盖子收回', '盖子已拿'), '兑盖'),
            (('陈列',), '陈列'), (('客情', '品鉴', '品尝'), '客情'),
            (('额外赠送', '搭赠', '赠送', '赠品'), '搭赠'), (('换',), '换货退货')]:
            if any(word in text for word in words):
                return label
    if number(s['折后金额']) and number(s['折后单价']):
        return '正常销售'
    return '无法分类'


def named_sale_skus(text, normal):
    """先识别完整名称，再识别去包装后缀的商品名；唯一性由调用方判断。"""
    exact = [sku for sku, group in normal.items()
             if any(str(row['source']['存货全名']) in text for row in group)]
    if exact:
        return exact
    matches = []
    for sku, group in normal.items():
        for row in group:
            name = str(row['source']['存货全名'])
            stem = re.sub(r'[（(][^）)]*[）)]', '', name).strip()
            if stem.startswith('雪花') and len(stem) > 3:
                stem = stem[2:]
            if len(stem) >= 2 and stem in text:
                matches.append(sku)
                break
    return matches


def analyze(rows):
    docs = defaultdict(list)
    for i, item in enumerate(rows):
        s = item['source']
        a = dict.fromkeys(FIELDS, '')
        a.update({'单据年月': item['date'][:7], '分类': classify(s),
                  '真实单价': calculated_price(money(number(s['折后金额'])), pricing_quantity(s)), '真实金额': float(money(number(s['折后金额']))),
                  '计算方式': '原金额 / 计价数量；真实金额 = 真实单价 ×（赠品或数量）', '匹配状态': '无需匹配'})
        item = {**item, 'analysis': a, 'index': i}
        docs[str(s['单据编号'])].append(item)
    history = defaultdict(list)
    # 无搭赠销售可作为早期历史缺失时的兜底；不采用尚未计算的搭赠单价格。
    clean = defaultdict(list)
    for doc in docs.values():
        if not any(r['analysis']['分类'] == '搭赠' for r in doc):
            for r in doc:
                if r['analysis']['分类'] == '正常销售' and pricing_quantity(r['source']) > 0:
                    clean[str(r['source']['存货编号'])].append(r)
    result = []
    for doc in sorted(docs.values(), key=lambda d: (min(r['date'] for r in d), d[0]['index'])):
        normal = defaultdict(list)
        gifts = defaultdict(list)
        for r in doc:
            if r['analysis']['分类'] == '正常销售':
                normal[str(r['source']['存货编号'])].append(r)
        for r in doc:
            s, a = r['source'], r['analysis']
            if a['分类'] != '搭赠':
                continue
            text = str(s.get('行摘要') or '')
            named = named_sale_skus(text, normal)
            sku = named[0] if len(named) == 1 else str(s['存货编号']) if str(s['存货编号']) in normal else max(normal, key=lambda key: (
                sum(number(n['source']['辅1数量']) for n in normal[key]),
                sum(number(n['source']['折后金额']) for n in normal[key]), -normal[key][0]['index']), default=None)
            a.update({'分类': '本品搭赠' if sku == str(s['存货编号']) else '非本品搭赠',
                      '真实单价': None, '真实金额': None, '匹配状态': '待处理：无正常销售商品', '计算方式': '待计算'})
            if sku is None:
                continue
            a['搭赠匹配商品'] = normal[sku][0]['source']['存货全名']
            a['匹配状态'] = '已匹配'
            gifts[sku].append(r)
            if a['分类'] == '本品搭赠':
                continue
            candidates = [h for h in history[str(s['存货编号'])] if h['date'] <= r['date'] and h['analysis']['真实单价'] is not None and h['analysis']['真实单价'] > 0 and h['source']['单位'] == s['单位']]
            scopes = [([h for h in candidates if h['source']['经办人全名'] == s['经办人全名']], '同业务员'),
                      ([h for h in candidates if h['source']['客户全名'] == s['客户全名']], '同客户'),
                      (candidates, '其他历史销售'),
                      ([h for h in clean[str(s['存货编号'])] if str(h['source']['单据编号']) != str(s['单据编号']) and h['source']['单位'] == s['单位'] and h['analysis']['真实单价'] > 0], '无搭赠销售兜底')]
            for pool, basis in scopes:
                if not pool:
                    continue
                counts = Counter(round(h['analysis']['真实单价'], 8) for h in pool)
                price = max(counts, key=lambda p: (counts[p], -abs(number(p) - number(s['成本单价'])), max(h['date'] for h in pool if round(h['analysis']['真实单价'], 8) == p)))
                ref = max((h for h in pool if round(h['analysis']['真实单价'], 8) == price), key=lambda h: (h['date'], h['index']))
                a.update({'真实单价': price, '真实金额': float(money(number(price) * pricing_quantity(s))),
                          '历史参考日期': ref['date'], '历史参考单据': ref['source']['单据编号'],
                          '历史参考客户': ref['source']['客户全名'], '历史参考依据': basis, '计算方式': '历史真实单价估值'})
                break
            if a['真实单价'] is None:
                a['匹配状态'] = '待处理：无可用历史价格'
        for sku, group in normal.items():
            attached = gifts[sku]
            if not attached:
                continue
            cross = [g for g in attached if g['analysis']['分类'] == '非本品搭赠']
            same = [g for g in attached if g['analysis']['分类'] == '本品搭赠']
            total = sum(money(number(r['source']['折后金额'])) for r in group)
            quantity = sum(pricing_quantity(r['source']) for r in group + same)
            if any(g['analysis']['真实金额'] is None for g in cross) or quantity <= 0 or total < 0 or any(pricing_quantity(g['source']) < 0 for g in attached):
                for r in group + same:
                    r['analysis'].update({'真实单价': None, '真实金额': None, '匹配状态': '待处理：搭赠价格或数量异常', '计算方式': '待计算'})
                continue
            valuation = sum(number(g['analysis']['真实金额']) for g in cross)
            if valuation > total:
                remaining = total
                for i, g in enumerate(cross):
                    amount = remaining if i == len(cross) - 1 else money(number(g['analysis']['真实金额']) * total / valuation)
                    remaining -= amount
                    g['analysis'].update({'真实金额': float(amount), '真实单价': float(amount / pricing_quantity(g['source'])) if pricing_quantity(g['source']) else 0, '计算方式': '搭赠估值超额，按比例缩减'})
            remaining_total = total - sum(number(g['analysis']['真实金额']) for g in cross)
            price = remaining_total / quantity
            remaining = remaining_total
            for i, r in enumerate(group + same):
                amount = remaining if i == len(group + same) - 1 else money(price * pricing_quantity(r['source']))
                remaining -= amount
                row_quantity = pricing_quantity(r['source'])
                unit_price = float(price)
                adjusted = money(number(unit_price) * row_quantity) != amount
                if adjusted:
                    unit_price = calculated_price(amount, row_quantity)
                r['analysis'].update({'真实单价': unit_price, '真实金额': float(amount),
                    '计算方式': '真实单价 ×（赠品或数量），金额四舍五入到分' + ('；分币尾差调整本行真实单价' if adjusted else ''),
                    '匹配状态': '已计算'})
        pending = any(r['analysis']['真实金额'] is None for r in doc)
        equal = not pending and sum(number(r['analysis']['真实金额']) for r in doc) == sum(money(number(r['source']['折后金额'])) for r in doc)
        for group in normal.values():
            prices = [number(r['analysis']['真实单价']) for r in group if r['analysis']['真实单价'] is not None]
            if prices and min(prices) > 0 and (max(prices) - min(prices)) / min(prices) >= Decimal('.1'):
                for r in group:
                    r['analysis']['明细风险'] = '价格问题：同单同商品正常销售最高最低真实单价差 / 最低价 ≥ 10%'
        for r in doc:
            a = r['analysis']
            a['单据核对状态'] = '待处理：存在未定价明细' if pending else ('一致' if equal else '金额不一致')
            if a['分类'] == '无法分类':
                a['明细风险'] = '无法分类'
            if a['分类'] == '正常销售' and a['真实单价'] is not None and pricing_quantity(r['source']) > 0:
                history[str(r['source']['存货编号'])].append(r)
        result.extend(doc)
    return sorted(result, key=lambda r: r['index'])


class SalesStore:
    def __init__(self, database):
        self.database = Path(database)

    @contextmanager
    def connect(self):
        self.database.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.database, timeout=60)
        db.execute('CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, document TEXT, payload TEXT)')
        db.execute('CREATE INDEX IF NOT EXISTS sales_document ON sales(document)')
        db.execute('CREATE TABLE IF NOT EXISTS sales_meta (key TEXT PRIMARY KEY, value TEXT)')
        try:
            with db:
                yield db
        finally:
            db.close()

    def upload(self, headers, rows, filename):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = [json.loads(r[0]) for r in db.execute('SELECT payload FROM sales ORDER BY id')]
            documents = {str(r['source']['单据编号']) for r in rows}
            combined = [{'source': r['source'], 'date': r['date']} for r in previous if str(r['source']['单据编号']) not in documents] + rows
            processed = analyze(combined)
            old = db.execute("SELECT value FROM sales_meta WHERE key='headers'").fetchone()
            all_headers = list(dict.fromkeys((json.loads(old[0]) if old else []) + headers))
            db.execute('DELETE FROM sales')
            db.executemany('INSERT INTO sales(document,payload) VALUES (?,?)', [(str(r['source']['单据编号']), json.dumps(r, ensure_ascii=False)) for r in processed])
            for key, value in [('headers', json.dumps(all_headers)), ('filename', filename)]:
                db.execute('INSERT OR REPLACE INTO sales_meta VALUES (?,?)', (key, value))
        return {'imported': len(rows), 'total': len(processed), 'filename': filename}

    def save_product_sync(self, report):
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO sales_meta(key,value) VALUES (?,?)',
                       ('product_sync', json.dumps(report, ensure_ascii=False)))

    def delete_rows(self, ids):
        if not isinstance(ids, list) or not ids or len(ids) > 1000:
            raise ValueError('请选择1至1000条销售明细')
        if any(type(key) is not int or key <= 0 for key in ids):
            raise ValueError('销售明细编号不正确')
        ids = list(dict.fromkeys(ids))
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            placeholders = ','.join('?' for _ in ids)
            count = db.execute(f'SELECT COUNT(*) FROM sales WHERE id IN ({placeholders})', ids).fetchone()[0]
            if count != len(ids):
                raise ValueError('部分明细已变更，请刷新后重新选择')
            db.execute(f'DELETE FROM sales WHERE id IN ({placeholders})', ids)
            remaining = db.execute('SELECT id,payload FROM sales ORDER BY id').fetchall()
            processed = analyze([json.loads(raw) for _, raw in remaining])
            db.executemany('UPDATE sales SET payload=? WHERE id=?', [
                (json.dumps(row, ensure_ascii=False), record[0])
                for record, row in zip(remaining, processed)
            ])
        return {'deleted': count}

    def recalculate(self):
        """重新计算保存的原始明细，不改变原始数据与行ID。"""
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            records = db.execute('SELECT id,payload FROM sales ORDER BY id').fetchall()
            rows = [json.loads(raw) for _, raw in records]
            processed = analyze(rows)
            db.executemany('UPDATE sales SET payload=? WHERE id=?', [
                (json.dumps(row, ensure_ascii=False), record[0])
                for record, row in zip(records, processed)
            ])
        return len(processed)

    def month_rows(self, month):
        if not isinstance(month, str) or not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', month) or month.startswith('0000'):
            raise ValueError('请选择有效的导出月份')
        with self.connect() as db:
            records = db.execute(
                "SELECT id,payload FROM sales WHERE substr(json_extract(payload, '$.date'),1,7)=? ORDER BY json_extract(payload, '$.date'), id",
                (month,),
            ).fetchall()
            meta = dict(db.execute('SELECT key,value FROM sales_meta'))
        items = [{'id': key, 'values': {**row['source'], **row['analysis']}}
                 for key, raw in records for row in [json.loads(raw)]]
        columns = list(dict.fromkeys(json.loads(meta.get('headers', '[]')) + FIELDS
            + [field for item in items for field in item['values']]))
        return {'items': items, 'columns': columns, 'total': len(items)}

    def list_rows(self, document='', page=1, page_size=20, sort_by='', sort_order='', all_rows=False, **filters):
        if page < 1 or page_size not in (20, 50, 100, 500, 1000):
            raise ValueError('分页参数不正确')
        sort_fields = {
            'unit_price': "CAST(json_extract(payload, '$.source.折后单价') AS REAL)",
            'real_price': "CAST(json_extract(payload, '$.analysis.真实单价') AS REAL)",
            'category': "json_extract(payload, '$.analysis.分类') COLLATE ZH",
            'date': "json_extract(payload, '$.date')",
            'salesperson': "json_extract(payload, '$.source.经办人全名') COLLATE ZH",
            'terminal_code': "CAST(json_extract(payload, '$.source.客户备用2') AS TEXT)",
        }
        if sort_by not in ('', *sort_fields) or sort_order not in ('', 'asc', 'desc'):
            raise ValueError('排序参数不正确')
        if bool(sort_by) != bool(sort_order):
            raise ValueError('请同时指定排序字段和方向')
        order = 'id'
        if sort_by:
            expression = sort_fields[sort_by]
            order = f'({expression}) IS NULL, {expression} {sort_order.upper()}, id'
        with self.connect() as db:
            # 中文按拼音编码顺序排列；编码相同时按原文确定稳定顺序。
            db.create_collation('ZH', lambda a, b: ((a.encode('gb18030'), a) > (b.encode('gb18030'), b)) - ((a.encode('gb18030'), a) < (b.encode('gb18030'), b)))
            conditions, args = [], []
            if document.strip():
                conditions.append('instr(document, ?) > 0')
                args.append(document.strip())
            fields = {
                'document_type': '$.source.单据类型', 'month': '$.analysis.单据年月',
                'salesperson': '$.source.经办人全名', 'terminal_code': '$.source.客户备用2',
                'customer_type': '$.source.客户备用4', 'customer': '$.source.客户全名',
                'product': '$.source.存货全名', 'category': '$.analysis.分类',
            }
            category_mode = filters.get('category_mode') or 'include'
            if category_mode not in ('include', 'exclude'):
                raise ValueError('分类条件不正确')
            categories = filters.get('category') or []
            if isinstance(categories, str):
                categories = [categories]
            categories = list(dict.fromkeys(str(value).strip() for value in categories if str(value).strip()))
            if categories:
                placeholders = ','.join('?' for _ in categories)
                operator = 'NOT IN' if category_mode == 'exclude' else 'IN'
                conditions.append(f"COALESCE(json_extract(payload, '$.analysis.分类'), '') {operator} ({placeholders})")
                args.extend(categories)
            for key, path in fields.items():
                if key == 'category':
                    continue
                value = str(filters.get(key) or '').strip()
                if value:
                    expression = 'CAST(json_extract(payload, ?) AS TEXT)'
                    conditions.append(f'instr({expression}, ?) > 0' if key in ('customer', 'terminal_code') else f'{expression} = ?')
                    args.extend([path, value])
            start, end = filters.get('date_start', ''), filters.get('date_end', '')
            for value in (start, end):
                if value:
                    try:
                        date.fromisoformat(value)
                    except ValueError:
                        raise ValueError('单据日期格式不正确') from None
            if start and end and start > end:
                raise ValueError('开始日期不能晚于结束日期')
            for value, operator in ((start, '>='), (end, '<=')):
                if value:
                    conditions.append(f"json_extract(payload, '$.date') {operator} ?")
                    args.append(value)
            where = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
            total = db.execute('SELECT COUNT(*) FROM sales' + where, args).fetchone()[0]
            sql = 'SELECT id,payload FROM sales' + where + ' ORDER BY ' + order
            records = db.execute(sql if all_rows else sql + ' LIMIT ? OFFSET ?',
                args if all_rows else args + [page_size, (page - 1) * page_size]).fetchall()
            meta = dict(db.execute('SELECT key,value FROM sales_meta'))
            options = {}
            for key in ('document_type', 'month', 'salesperson', 'customer_type', 'product', 'category'):
                values = db.execute(
                    "SELECT DISTINCT CAST(json_extract(payload, ?) AS TEXT) AS value FROM sales ORDER BY value",
                    (fields[key],),
                )
                options[key] = [row[0] for row in values if row[0] is not None and str(row[0]).strip()]
            product_values = db.execute("""
                SELECT DISTINCT CAST(json_extract(payload, '$.source.存货全名') AS TEXT) AS name,
                                CAST(json_extract(payload, '$.source.存货编号') AS TEXT) AS code
                FROM sales
            """).fetchall()
            def product_order(item):
                name, code = item[0] or '', str(item[1] or '').strip()
                code_key = (0, int(code), code) if code.isdigit() else (1, code.casefold(), code) if code else (2, '', '')
                return code_key, name
            options['product'] = list(dict.fromkeys(
                name for name, _ in sorted(product_values, key=product_order) if name and name.strip()
            ))
            options['month'].sort(reverse=True)
        return {'items': [{'id': key, 'values': {**r['source'], **r['analysis']}} for key, raw in records for r in [json.loads(raw)]],
                'columns': json.loads(meta.get('headers', '[]')) + FIELDS, 'options': options, 'product_sync': json.loads(meta.get('product_sync', 'null')), 'total': total, 'filename': meta.get('filename', '')}
