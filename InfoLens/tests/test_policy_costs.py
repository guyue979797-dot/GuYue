import tempfile
import unittest
from pathlib import Path
from decimal import Decimal
from infolens.products import ProductStore
from infolens.product_policies import ProductPolicyStore
from infolens.sales import SalesStore
from infolens.policy_costs import PolicyCostAllocator
from infolens.sales_profit import enrich_sales_profit
from test_sales import row


class PolicyCostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.products = ProductStore(root / 'products.db')
        self.product = self.products.create_product(dict(product_codes=['P'], short_name='商品', product_name='商品',
            housekeeper_codes=['A'], specification=12, auxiliary_unit='听', snow_inventory=0, cost_price=30),
            operator='test', operator_name='测试')
        self.policies = ProductPolicyStore(self.products)
        self.sales = SalesStore(root / 'sales.db')
        with self.sales.connect():
            pass
        self.allocator = PolicyCostAllocator(self.products, self.sales)

    def tearDown(self):
        self.temp.cleanup()

    def policy(self, price, quantity, month='2026-07'):
        return self.policies.create(dict(product_id=self.product['id'], month=month, price=price, quantity=quantity), 'test')

    def sale(self, doc, day, boxes, **extra):
        return row(doc=doc, qty=boxes*12, amount=boxes*60,
                   单据日期=f'2026-07-{day:02}', 辅1数量=boxes, **extra)

    def upload(self, rows):
        self.sales.upload(list(rows[0]['source']), rows, 'sales.xlsx')

    def test_chronological_fifo_fractional_split_fallback_and_idempotency(self):
        first = self.policy(10,2)
        second = self.policy(20,2)
        self.upload([self.sale('late', 2, 3.5), self.sale('early', 1, 2.5)])
        allocations = self.allocator.refresh()
        items = self.sales.list_rows()['items']
        by_doc = {item['values']['单据编号']: allocations[item['id']] for item in items}
        self.assertEqual(Decimal(by_doc['early']['cost']), 12)
        self.assertEqual(by_doc['early']['policy_quantity'], 2.5)
        self.assertEqual(by_doc['late']['policy_quantity'], 1.5)
        self.assertEqual(by_doc['late']['fallback_quantity'], 2)
        self.assertEqual(Decimal(by_doc['late']['cost']), Decimal(90)/Decimal('3.5'))
        used = {item['id']: item['used_quantity'] for item in self.policies.list()['items']}
        self.assertEqual(used, {first['id']:2,second['id']:2})
        self.assertEqual(self.allocator.refresh(), allocations)
        self.assertEqual({item['id']:item['used_quantity'] for item in self.policies.list()['items']}, used)
        self.upload([self.sale('late',2,3.5), self.sale('early',1,2.5)])
        self.allocator.refresh()
        self.assertEqual({item['id']:item['used_quantity'] for item in self.policies.list()['items']}, used)
        # 筛选和分页只选择展示行，不改变全局消耗顺序。
        result = enrich_sales_profit(self.sales.list_rows(document='late'), self.products, self.allocator)
        self.assertEqual(result['items'][0]['values']['政策用量（件）'], 1.5)

    def test_delete_releases_usage_and_reallocates(self):
        policy = self.policy(10,3)
        self.upload([self.sale('early',1,2),self.sale('late',2,2)])
        self.allocator.refresh()
        early = self.sales.list_rows(document='early')['items'][0]
        self.sales.delete_rows([early['id']])
        results = self.allocator.refresh()
        late = self.sales.list_rows(document='late')['items'][0]
        self.assertEqual(Decimal(results[late['id']]['cost']), 10)
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'], 2)

    def test_only_eligible_classes_month_matching_and_gift_boxes(self):
        july = self.policy(10,10)
        august = self.policy(1,100,'2026-08')
        paid = self.sale('doc',1,2)
        gift = row(doc='doc', qty=0, amount=0, summary='搭赠', 赠品=12, 辅1数量=0, 赠品辅1数量=1)
        other = self.sale('other',2,8, 行摘要='陈列', 折后金额=0, 折后单价=0)
        self.upload([paid,gift,other])
        results=self.allocator.refresh()
        used={item['id']:item['used_quantity'] for item in self.policies.list()['items']}
        self.assertEqual(used[july['id']],3)
        self.assertEqual(used[august['id']],0)
        excluded=self.sales.list_rows(document='other')['items'][0]
        self.assertIsNone(results[excluded['id']]['cost'])

    def test_ended_policy_preserves_old_allocations_and_rejects_new_sales(self):
        policy=self.policy(10,10)
        self.upload([self.sale('early',1,2)])
        self.allocator.refresh()
        self.policies.end(policy['id'],'test')
        self.upload([self.sale('late',2,2)])
        allocations=self.allocator.refresh()
        for item in self.sales.list_rows()['items']:
            expected='10' if item['values']['单据编号']=='early' else '30'
            self.assertEqual(Decimal(allocations[item['id']]['cost']),Decimal(expected))
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'],2)

    def test_policy_can_cover_missing_fallback_cost_but_partial_cannot(self):
        self.product=self.products.update_product(self.product['id'],{**self.product,'cost_price':None},operator='test',operator_name='测试')
        self.policy(0,2)
        self.upload([self.sale('early',1,1),self.sale('late',2,2)])
        allocations=self.allocator.refresh()
        by_doc={r['values']['单据编号']:allocations[r['id']] for r in self.sales.list_rows()['items']}
        self.assertEqual(by_doc['early']['cost'],'0')
        self.assertIsNone(by_doc['late']['cost'])
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'],2)

    def test_policy_source_label_and_remarks_are_exposed_only_when_used(self):
        policy=self.policy(10,1)
        with self.products._connect() as db:
            db.execute('UPDATE product_cost_policies SET remarks=? WHERE id=?',('七月补贴',policy['id']))
        self.upload([self.sale('early',1,1),self.sale('late',2,1)])
        result=enrich_sales_profit(self.sales.list_rows(),self.products,self.allocator)
        rows={item['values']['单据编号']:item for item in result['items']}
        self.assertEqual(rows['early']['values']['成本来源'],'07月-商品政策')
        self.assertEqual(rows['early']['cost_sources'][0]['remarks'],'七月补贴')
        self.assertEqual(rows['late']['values']['成本来源'],'')
        self.assertEqual(rows['late']['cost_sources'],[])

    def test_force_month_rebuild_preserves_other_month_costs_and_usage(self):
        july=self.policy(10,10)
        august=self.policy(50,10,'2026-08')
        self.upload([self.sale('july',1,2), row(doc='august',qty=12,amount=60,辅1数量=1,单据日期='2026-08-01')])
        self.allocator.refresh()
        august_id=self.sales.list_rows(document='august')['items'][0]['id']
        def other_month():
            with self.products._connect() as db:
                return (db.execute('SELECT payload FROM sales_policy_costs WHERE sales_id=?',(august_id,)).fetchone()[0],
                        tuple(db.execute('SELECT used_quantity,status,ended_at FROM product_cost_policies WHERE id=?',(august['id'],)).fetchone()))
        before=other_month()
        with self.products._connect() as db:
            db.execute('UPDATE product_cost_policies SET price_cents=2000 WHERE id=?',(july['id'],))
        results=self.allocator.refresh(month='2026-07',force=True)
        self.assertEqual(len(results),1)
        self.assertEqual(Decimal(next(iter(results.values()))['cost']),20)
        self.assertEqual(other_month(),before)
        self.assertEqual(self.allocator.refresh(month='2026-09',force=True),{})
        with self.assertRaises(ValueError):
            self.allocator.refresh(month='2026-13',force=True)

    def test_exhaustion_auto_ends_and_reopens_after_delete(self):
        policy=self.policy(10,2)
        self.upload([self.sale('early',1,2),self.sale('late',2,1)])
        self.allocator.refresh()
        item=self.policies.list()['items'][0]
        self.assertEqual(item['status'],'已结束')
        self.assertEqual(item['end_reason'],'exhausted')
        self.allocator.refresh()
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'],2)
        key=self.sales.list_rows(document='early')['items'][0]['id']
        self.sales.delete_rows([key])
        self.allocator.refresh()
        item=self.policies.list()['items'][0]
        self.assertEqual(item['used_quantity'],1)
        self.assertEqual(item['status'],'进行中')
        self.policies.end(policy['id'],'test')
        self.allocator.refresh()
        self.assertEqual(self.policies.list()['items'][0]['end_reason'],'manual')

    def test_fractional_usage_and_cost_refresh_without_reconsumption(self):
        policy=self.policy(10,1)
        self.upload([self.sale('doc',1,.5)])
        self.allocator.refresh()
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'],.5)
        self.product=self.products.update_product(self.product['id'],{**self.product,'cost_price':40},operator='test',operator_name='测试')
        self.allocator.refresh()
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'],.5)
        self.policies.end(policy['id'],'test')
        self.allocator.refresh()
        key=self.sales.list_rows()['items'][0]['id']
        self.sales.delete_rows([key])
        self.allocator.refresh()
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'],0)
        self.upload([self.sale('new',2,.5)])
        costs=self.allocator.refresh()
        key=self.sales.list_rows()['items'][0]['id']
        self.assertEqual(Decimal(costs[key]['cost']),40)
        self.assertEqual(self.policies.list()['items'][0]['used_quantity'],0)

    def test_creation_time_before_id_and_updated_fallback(self):
        p1=self.policy(10,1)
        p2=self.policy(20,1)
        with self.products._connect() as db:
            db.execute("UPDATE product_cost_policies SET created_at='2000-01-01' WHERE id=?",(p2['id'],))
        self.upload([self.sale('doc',1,1)])
        allocations=self.allocator.refresh()
        key=self.sales.list_rows()['items'][0]['id']
        self.assertEqual(Decimal(allocations[key]['cost']),20)
        self.assertEqual({p['id']:p['used_quantity'] for p in self.policies.list()['items']}, {p1['id']:0,p2['id']:1})
