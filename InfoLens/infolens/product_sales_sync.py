"""销售存货更新已有商品；仅自动采用名称、包装及规格唯一对应关系。"""
import re
import math
from collections import defaultdict, Counter
from datetime import datetime


def stock_specification(raw):
    text = str(raw or '').strip()
    if not re.fullmatch(r'\d+(?:\s*[*×xX]\s*\d+)*', text):
        return None
    values = [int(value) for value in re.split(r'\s*[*×xX]\s*', text)]
    return math.prod(values) if all(value > 0 for value in values) else None


def identity(name):
    text = str(name or '').lower().replace(' ', '')
    package = '马口铁' if '马口铁' in text else '听' if any(word in text for word in ('听', '罐')) else '瓶' if '瓶' in text else ''
    text = re.sub(r'[（(][^）)]*[）)]', '', text)
    text = text.replace('勇闯天涯superx', '超级勇闯').replace('超勇', '超级勇闯')
    text = text.replace('勇闯天涯', '勇闯').replace('雪花', '')
    text = re.sub(r'\d+(?:[.*×x]\d+)*(?:ml|l|度)?', '', text)
    for word in ('马口铁', '瓶装', '听装', '听', '瓶', '啤酒', '（', '）', '(', ')', '*', '×'):
        text = text.replace(word, '')
    return text.strip(), package


def sync_sales_products(store, rows, *, operator, operator_name, dry_run=False):
    variants = defaultdict(set)
    for row in rows:
        source = row.get('source', row)
        code = str(source.get('存货编号') or '').strip()
        name = str(source.get('存货全名') or '').strip()
        spec = stock_specification(source.get('存货规格'))
        if code and name:
            variants[code].add((name, spec))
    stocks = {code: (next(iter(values))) for code, values in variants.items()
              if len(values) == 1 and next(iter(values))[1] is not None}
    details = []
    with store._connect() as db:
        db.execute('BEGIN IMMEDIATE')
        products = [store._public_product(db, record) for record in db.execute("SELECT * FROM products WHERE deleted_at='' ORDER BY id").fetchall()]
        proposals = {}
        for product in products:
            candidates = []
            for code, (name, spec) in stocks.items():
                core, package = identity(name)
                short, short_package = identity(product['short_name'])
                full = product['product_name'].lower().replace(' ', '')
                _, full_package = identity(product['product_name'])
                full = full.replace('勇闯天涯superx', '超级勇闯').replace('勇闯天涯', '勇闯').replace('雪花', '')
                known = code in product['housekeeper_codes']
                name_matches = len(core) >= 2 and (core in full or (short and core == short))
                packaging_matches = bool(package) and package == (full_package or short_package)
                if known or (name_matches and packaging_matches and product['specification'] == spec):
                    candidates.append(code)
            if len(candidates) == 1:
                proposals[product['id']] = candidates[0]
            else:
                details.append({'product_id': product['id'], 'product_name': product['product_name'],
                                'result': '跳过', 'reason': '匹配有歧义' if candidates else '无唯一名称、包装及规格匹配', 'candidates': candidates})
        claims = Counter(proposals.values())
        owners = {r['code']: r['product_id'] for r in db.execute('SELECT code,product_id FROM product_housekeeper_codes')}
        for product in products:
            code = proposals.get(product['id'])
            if not code:
                continue
            if claims[code] != 1 or (code in owners and owners[code] != product['id']):
                details.append({'product_id': product['id'], 'product_name': product['product_name'], 'result': '跳过', 'reason': '存货编号对应多个商品或已被占用'})
                continue
            name, spec = stocks[code]
            changed = product['short_name'] != name or product['housekeeper_codes'] != [code] or product['specification'] != spec
            details.append({'product_id': product['id'], 'product_name': product['product_name'], 'result': '更新' if changed else '无变化',
                            'short_name': name, 'stock_code': code, 'specification': spec})
            if not changed or dry_run:
                continue
            status = '正常' if name and code and spec is not None and product['auxiliary_unit'] else '待完善'
            db.execute('''UPDATE products SET short_name=?, specification=?, status=?, version=version+1,
                          updated_by=?, updated_by_name=?, updated_at=? WHERE id=?''',
                       (name, spec, status, operator, operator_name, datetime.now().isoformat(timespec='seconds'), product['id']))
            db.execute('DELETE FROM product_housekeeper_codes WHERE product_id=?', (product['id'],))
            db.execute('INSERT INTO product_housekeeper_codes(product_id,code) VALUES (?,?)', (product['id'], code))
            store._log(db, product['id'], operator, operator_name, 'update', '销售表同步商品简称、存货编号、存货规格',
                       {'before': {'short_name': product['short_name'], 'housekeeper_codes': product['housekeeper_codes'], 'specification': product['specification']},
                        'after': {'short_name': name, 'housekeeper_codes': [code], 'specification': spec}})
    return {'updated': sum(d['result'] == '更新' for d in details),
            'unchanged': sum(d['result'] == '无变化' for d in details),
            'skipped': sum(d['result'] == '跳过' for d in details), 'details': details}
