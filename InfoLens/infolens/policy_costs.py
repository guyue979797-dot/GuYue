"""按全量销售日期及政策创建顺序分配件数，幂等反写政策用量。"""
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from threading import RLock
from .sales import number

COST_LOCK = RLock()
ELIGIBLE = {'正常销售', '本品搭赠', '非本品搭赠'}


class PolicyCostAllocator:
    def __init__(self, products, sales):
        self.products = products
        self.sales = sales
        with products._connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS sales_policy_allocations (
                    row_key TEXT NOT NULL, policy_id INTEGER NOT NULL,
                    quantity TEXT NOT NULL, price_cents INTEGER NOT NULL,
                    PRIMARY KEY(row_key,policy_id)
                );
                CREATE TABLE IF NOT EXISTS sales_policy_costs (
                    sales_id INTEGER PRIMARY KEY, payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sales_policy_meta (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL
                );
            ''')

    def refresh(self, month=None, force=False):
        if month is not None:
            from .product_policies import ProductPolicyStore
            month = ProductPolicyStore.month(month)
        with COST_LOCK, self.products._connect() as db:
            db.execute('ATTACH DATABASE ? AS sale_source', (str(self.sales.database),))
            db.execute('BEGIN IMMEDIATE')
            raw_rows = db.execute(
                "SELECT id,payload FROM sale_source.sales" +
                (" WHERE substr(json_extract(payload, '$.date'),1,7)=?" if month else '') + " ORDER BY id",
                (month,) if month else (),
            ).fetchall()
            products = [dict(row) for row in db.execute('''
                SELECT p.id, c.code, p.specification, p.cost_price, p.short_name
                FROM products p JOIN product_housekeeper_codes c ON c.product_id=p.id
                WHERE p.deleted_at='' ORDER BY p.id,c.code
            ''')]
            policies = [dict(row) for row in db.execute('''
                SELECT id,product_id,month,price_cents,quantity,status,created_at,ended_at,end_reason,product_name,remarks
                FROM product_cost_policies ORDER BY created_at,id
            ''')]
            if month:
                policies = [policy for policy in policies if policy['month'] == month]
            # 自动耗尽属于计算结果，不是停用指令；签名保持稳定，仍可全量重分配。
            signature_policies = [{**policy, 'status': '进行中', 'end_reason': '', 'ended_at': ''}
                                  if policy['status'] == '进行中' or policy['end_reason'] == 'exhausted'
                                  else policy for policy in policies]
            signature = hashlib.sha256(json.dumps(
                ['policy-cost-v5', [(row['id'],row['payload']) for row in raw_rows], products, signature_policies],
                ensure_ascii=False, sort_keys=True).encode()).hexdigest()
            signature_key = 'signature:' + month if month else 'signature'
            previous = db.execute("SELECT value FROM sales_policy_meta WHERE key=?", (signature_key,)).fetchone()
            if not force and previous and previous[0] == signature:
                return {row['sales_id']: json.loads(row['payload']) for row in db.execute("SELECT * FROM sales_policy_costs" + (" WHERE json_extract(payload,'$.month')=?" if month else ''), (month,) if month else ())}
            by_code = {product['code']: product for product in products}
            by_policy = {policy['id']: policy for policy in policies}
            active = defaultdict(list)
            for policy in policies:
                if policy['status'] == '进行中' or policy['end_reason'] == 'exhausted':
                    active[(policy['product_id'],policy['month'])].append(policy)
            old = defaultdict(list)
            for row in db.execute('SELECT * FROM sales_policy_allocations ORDER BY policy_id'):
                policy = by_policy.get(row['policy_id'])
                if policy and policy['status'] == '已结束' and policy['end_reason'] != 'exhausted':
                    old[row['row_key']].append(dict(row))
            entries = []
            occurrences = Counter()
            for raw in raw_rows:
                row = json.loads(raw['payload'])
                source = row['source']
                digest = hashlib.sha256(json.dumps(source, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                occurrences[digest] += 1
                key = digest + ':' + str(occurrences[digest])
                product = by_code.get(str(source.get('存货编号') or '').strip())
                quantity = number(source.get('辅1数量')) + number(source.get('赠品辅1数量'))
                entries.append(dict(id=raw['id'], row=row, key=key, product=product,
                                    quantity=quantity, parts=[], remaining=max(quantity,Decimal(0))))
            # 先保留结束政策已经分配给仍存在明细的额度，绝不把它分给新明细。
            used = defaultdict(Decimal)
            for entry in entries:
                if not entry['product'] or entry['row']['analysis']['分类'] not in ELIGIBLE:
                    continue
                for allocation in old[entry['key']]:
                    policy = by_policy[allocation['policy_id']]
                    if policy['product_id'] != entry['product']['id'] or policy['month'] != entry['row']['date'][:7]:
                        continue
                    take = min(number(allocation['quantity']), entry['remaining'], number(policy['quantity'])-used[policy['id']])
                    if take > 0:
                        entry['parts'].append((policy['id'],take,allocation['price_cents']))
                        entry['remaining'] -= take
                        used[policy['id']] += take
            entries.sort(key=lambda item: (item['row']['date'],str(item['row']['source']['单据编号']),item['id']))
            results = {}
            allocations = []
            for entry in entries:
                row, product = entry['row'], entry['product']
                result = {'month': row['date'][:7], 'cost': None, 'specification': None, 'policy_quantity': 0,
                          'fallback_quantity': 0, 'allocation': '', 'status': '', 'sources': []}
                results[entry['id']] = result
                if row['analysis']['分类'] not in ELIGIBLE:
                    result['status'] = '不适用：仅正常销售及本品/非本品搭赠计算利润'
                    continue
                if not product:
                    result['status'] = '未匹配商品存货编号'
                    continue
                result['specification'] = product['specification']
                for policy in active[(product['id'],row['date'][:7])]:
                    take = min(entry['remaining'], number(policy['quantity'])-used[policy['id']])
                    if take > 0:
                        entry['parts'].append((policy['id'],take,policy['price_cents']))
                        entry['remaining'] -= take
                        used[policy['id']] += take
                quantity = entry['quantity']
                policy_quantity = sum((part[1] for part in entry['parts']),Decimal(0))
                result['policy_quantity'] = float(policy_quantity)
                result['fallback_quantity'] = float(entry['remaining'])
                cost_total = sum((part[1]*Decimal(part[2])/100 for part in entry['parts']),Decimal(0))
                for policy_id,take,price in entry['parts']:
                    allocations.append((entry['key'],policy_id,str(take),price))
                descriptions = [f'政策#{policy_id}：{take}件 × {Decimal(price)/100}元/件' for policy_id,take,price in entry['parts']]
                if entry['remaining'] > 0:
                    descriptions.append(f"商品成本兜底：{entry['remaining']}件 × {product['cost_price'] if product['cost_price'] is not None else '未填写'}元/件")
                result['allocation'] = '；'.join(descriptions)
                result['sources'] = [
                    {'id': policy_id,
                     'label': f"{by_policy[policy_id]['month'][5:7]}月-{product['short_name'] or by_policy[policy_id]['product_name']}政策",
                     'remarks': by_policy[policy_id]['remarks']}
                    for policy_id,_,_ in entry['parts']
                ]
                if product['cost_price'] is None and (entry['remaining'] > 0 or quantity <= 0):
                    result['status'] = '剩余数量缺少商品兜底成本价'
                    continue
                if quantity > 0:
                    cost_total += entry['remaining'] * number(product['cost_price'])
                    cost = cost_total / quantity
                else:
                    cost = number(product['cost_price'])
                result['cost'] = str(cost)
                result['status'] = '政策及商品成本加权' if policy_quantity and entry['remaining'] else '政策成本' if policy_quantity else '商品成本兜底'
            # 绝对值重算，不使用 +=；刷新、重传和删除不会重复扣量。
            for policy in policies:
                db.execute('UPDATE product_cost_policies SET used_quantity=? WHERE id=?',
                           (float(used[policy['id']]),policy['id']))
                if policy['status'] == '进行中' or policy['end_reason'] == 'exhausted':
                    if used[policy['id']] >= number(policy['quantity']):
                        ended_at = policy['ended_at'] or datetime.now().isoformat(timespec='seconds')
                        db.execute("UPDATE product_cost_policies SET status='已结束', end_reason='exhausted', ended_at=?, ended_by='system' WHERE id=?",
                                   (ended_at,policy['id']))
                    else:
                        db.execute("UPDATE product_cost_policies SET status='进行中', end_reason='', ended_at='', ended_by='' WHERE id=?", (policy['id'],))
            if month:
                db.execute('DELETE FROM sales_policy_allocations WHERE policy_id IN (SELECT id FROM product_cost_policies WHERE month=?)', (month,))
            else:
                db.execute('DELETE FROM sales_policy_allocations')
            db.executemany('INSERT INTO sales_policy_allocations VALUES (?,?,?,?)',allocations)
            if month:
                db.execute("DELETE FROM sales_policy_costs WHERE json_extract(payload,'$.month')=? OR sales_id IN (SELECT id FROM sale_source.sales WHERE substr(json_extract(payload,'$.date'),1,7)=?)", (month,month))
            else:
                db.execute('DELETE FROM sales_policy_costs')
            db.executemany('INSERT INTO sales_policy_costs VALUES (?,?)',
                           [(key,json.dumps(value,ensure_ascii=False)) for key,value in results.items()])
            db.execute("INSERT OR REPLACE INTO sales_policy_meta VALUES (?,?)",(signature_key,signature))
            return results
