"""商品月度政策与用量；销售成本分配器按实际分配件数反写已用量。"""
from decimal import Decimal, InvalidOperation
import re
from datetime import datetime


class ProductPolicyStore:
    def __init__(self, products):
        self.products = products
        with products._connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS product_cost_policies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    product_name TEXT NOT NULL,
                    month TEXT NOT NULL,
                    price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
                    quantity INTEGER NOT NULL CHECK(quantity > 0),
                    used_quantity INTEGER NOT NULL DEFAULT 0 CHECK(used_quantity >= 0 AND used_quantity <= quantity),
                    status TEXT NOT NULL DEFAULT '进行中' CHECK(status IN ('进行中', '已结束')),
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    ended_at TEXT NOT NULL DEFAULT '',
                    ended_by TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_product_cost_policy_month
                ON product_cost_policies(month, product_id);
            """)

            columns = {row['name'] for row in connection.execute('PRAGMA table_info(product_cost_policies)')}
            if 'end_reason' not in columns:
                connection.execute("ALTER TABLE product_cost_policies ADD COLUMN end_reason TEXT NOT NULL DEFAULT ''")
            if 'remarks' not in columns:
                connection.execute("ALTER TABLE product_cost_policies ADD COLUMN remarks TEXT NOT NULL DEFAULT ''")

    @staticmethod
    def month(value):
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value) or value.startswith('0000'):
            raise ValueError("政策月份格式应为YYYY-MM")
        return value

    @staticmethod
    def public(row):
        item = dict(row)
        item['price'] = item.pop('price_cents') / 100
        return item

    def get(self, policy_id):
        with self.products._connect() as connection:
            row = connection.execute('SELECT * FROM product_cost_policies WHERE id = ?', (policy_id,)).fetchone()
        if row is None:
            raise ValueError('商品政策不存在')
        return self.public(row)

    def list(self, *, product_id='', month='', status=''):
        clauses, params = [], []
        if status:
            if status not in ('进行中', '已结束'):
                raise ValueError('政策状态不正确')
            clauses.append('status = ?')
            params.append(status)
        if product_id:
            if not str(product_id).isdigit():
                raise ValueError("商品参数不正确")
            clauses.append('product_id = ?')
            params.append(int(product_id))
        if month:
            clauses.append('month = ?')
            params.append(self.month(month))
        where = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
        with self.products._connect() as connection:
            rows = connection.execute(
                'SELECT * FROM product_cost_policies' + where +
                " ORDER BY CASE status WHEN '进行中' THEN 0 ELSE 1 END, month DESC, id DESC", params
            ).fetchall()
            return {'items': [self.public(row) for row in rows]}

    def available_costs(self, product_ids):
        """Read remaining policy costs for one catalog page in a single query."""
        if not product_ids:
            return {}
        placeholders = ','.join('?' for _ in product_ids)
        with self.products._connect() as connection:
            rows = connection.execute(
                f"""SELECT id, product_id, month, price_cents,
                           quantity - used_quantity AS remaining_quantity
                    FROM product_cost_policies
                    WHERE product_id IN ({placeholders})
                      AND status = '进行中' AND used_quantity < quantity
                    ORDER BY month, created_at, id""", list(product_ids)
            ).fetchall()
        grouped = {}
        for row in rows:
            grouped.setdefault(row['product_id'], []).append(self.public(row))
        return grouped

    def create(self, payload, operator):
        if not isinstance(payload, dict):
            raise ValueError("政策数据格式不正确")
        remarks = payload.get('remarks', '')
        if not isinstance(remarks, str) or len(remarks) > 50:
            raise ValueError('备注说明不能超过50字')
        remarks = remarks.strip()
        product_id = payload.get('product_id')
        if isinstance(product_id, bool) or not str(product_id).isdigit():
            raise ValueError("请选择商品")
        month = self.month(payload.get('month'))
        try:
            price = Decimal(str(payload.get('price')))
            if not price.is_finite() or price < 0 or price > Decimal('999999999.99') or price != price.quantize(Decimal('.01')):
                raise ValueError("价格须为非负金额，最多两位小数")
        except (InvalidOperation, TypeError):
            raise ValueError("价格格式不正确") from None
        quantity = payload.get('quantity')
        if isinstance(quantity, bool) or not re.fullmatch(r'[0-9]+', str(quantity)) or not 0 < int(quantity) <= 1000000000:
            raise ValueError("政策件数须为1至10亿之间的整数")
        with self.products._connect() as connection:
            product = connection.execute("SELECT product_name FROM products WHERE id = ? AND deleted_at = ''", (int(product_id),)).fetchone()
            if not product:
                raise ValueError("商品档案不存在，请重新选择商品")
            cursor = connection.execute(
                "INSERT INTO product_cost_policies(product_id, product_name, month, price_cents, quantity, created_at, created_by, remarks) VALUES(?,?,?,?,?,?,?,?)",
                (int(product_id), product['product_name'], month, int(price * 100), int(quantity), datetime.now().isoformat(timespec='seconds'), operator, remarks)
            )
            return self.public(connection.execute('SELECT * FROM product_cost_policies WHERE id = ?', (cursor.lastrowid,)).fetchone())

    def end(self, policy_id, operator):
        with self.products._connect() as connection:
            row = connection.execute('SELECT * FROM product_cost_policies WHERE id = ?', (policy_id,)).fetchone()
            if not row:
                raise ValueError("政策不存在")
            if row['status'] == '进行中' or row['end_reason'] == 'exhausted':
                connection.execute("UPDATE product_cost_policies SET status = '已结束', end_reason = 'manual', ended_at = ?, ended_by = ? WHERE id = ?", (datetime.now().isoformat(timespec='seconds'), operator, policy_id))
            return self.public(connection.execute('SELECT * FROM product_cost_policies WHERE id = ?', (policy_id,)).fetchone())
