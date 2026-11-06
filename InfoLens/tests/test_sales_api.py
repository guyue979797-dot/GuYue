import importlib
import io
import os
import tempfile
import unittest
from unittest.mock import patch
from openpyxl import Workbook
from werkzeug.security import generate_password_hash
from infolens.sales import REQUIRED
from test_sales import row


class SalesApiTests(unittest.TestCase):
    def test_auth_csrf_import_search_and_bad_file(self):
        with tempfile.TemporaryDirectory() as output, patch.dict(os.environ, {
            'INFOLENS_AUTH_MODE': 'password', 'INFOLENS_ENV': 'development',
            'INFOLENS_OUTPUT_ROOT': output, 'INFOLENS_USERNAME': 'team',
            'INFOLENS_PASSWORD_HASH': generate_password_hash('test-password', method='pbkdf2:sha256'),
            'INFOLENS_SESSION_SECRET': 's' * 64,
        }):
            import web
            client = importlib.reload(web).app.test_client()
            self.assertEqual(client.get('/api/sales').status_code, 401)
            self.assertEqual(client.post('/api/sales/upload').status_code, 401)
            self.assertEqual(client.post('/api/sales/delete').status_code, 401)
            client.get('/login')
            with client.session_transaction() as session:
                token = session['csrf_token']
            self.assertEqual(client.post('/login', data={'username': 'team', 'password': 'test-password', 'csrf_token': token}).status_code, 302)
            token = client.get('/api/session').get_json()['csrf_token']
            self.assertEqual(client.post('/api/sales/upload').status_code, 403)
            product = web.PRODUCT_STORE.create_product(dict(
                product_codes=['PRODUCT-A'], short_name='旧简称', product_name='现有商品A',
                snow_inventory=88, housekeeper_codes=['A'], specification=6, auxiliary_unit='听',
                cost_price=40, settlement_price=60,
            ), operator='test', operator_name='测试')
            policy_response = client.post('/api/product-cost-policies', headers={'X-CSRF-Token': token}, json={
                'product_id': product['id'], 'month': '2026-07', 'price': 20, 'quantity': 10,
            })
            self.assertEqual(policy_response.status_code, 201)
            workbook = Workbook()
            headers_in_file = REQUIRED + ['存货规格']
            workbook.active.append(headers_in_file)
            source = row()['source']
            source['存货规格'] = '1*12'
            workbook.active.append([source[h] for h in headers_in_file])
            stream = io.BytesIO()
            workbook.save(stream)
            stream.seek(0)
            headers = {'X-CSRF-Token': token}
            result = client.post('/api/sales/upload', headers=headers, data={'file': (stream, 'sales.xlsx')})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.get_json()['imported'], 1)
            self.assertEqual(result.get_json()['product_sync']['updated'], 1)
            updated_product = web.PRODUCT_STORE.get_product(product['id'])
            self.assertEqual(updated_product['short_name'], 'A')
            self.assertEqual(updated_product['specification'], 12)
            self.assertEqual(updated_product['snow_inventory'], 88)
            self.assertEqual(updated_product['cost_price'], 40)
            result = client.get('/api/sales?document=S1').get_json()
            self.assertEqual(result.get('total'), 1, result)
            self.assertEqual(result['items'][0]['values']['单据年月'], '2026-07')
            self.assertEqual(result['items'][0]['values']['利润参考成本价'], 20)
            policies = client.get('/api/product-cost-policies').get_json()['items']
            self.assertAlmostEqual(policies[0]['used_quantity'], 10/12)
            self.assertEqual(client.post('/api/sales/recalculate-cost', json={'month': '2026-07'}).status_code, 403)
            self.assertEqual(client.post('/api/sales/recalculate-cost', headers=headers, json={'month': '2026-13'}).status_code, 400)
            recalculated = client.post('/api/sales/recalculate-cost', headers=headers, json={'month': '2026-07'})
            self.assertEqual(recalculated.status_code, 200)
            self.assertEqual(recalculated.get_json()['rows'], 1)
            client.get('/api/sales?category=正常销售&sort_by=date&sort_order=desc')
            self.assertAlmostEqual(client.get('/api/product-cost-policies').get_json()['items'][0]['used_quantity'], 10/12)
            self.assertEqual(client.get('/api/sales?page=-1').status_code, 400)
            self.assertEqual(client.get('/api/sales?page=no').status_code, 400)
            result = client.post('/api/sales/upload', headers=headers, data={'file': (io.BytesIO(b'bad'), 'bad.xlsx')})
            self.assertEqual(result.status_code, 400)
            self.assertEqual(client.get('/api/sales').get_json()['total'], 1)
            self.assertEqual(client.post('/api/sales/upload', headers=headers, data={'file': (io.BytesIO(b'bad'), 'bad.csv')}).status_code, 400)

            key = client.get('/api/sales').get_json()['items'][0]['id']
            self.assertEqual(client.post('/api/sales/delete', json={'ids': [key]}).status_code, 403)
            self.assertEqual(client.post('/api/sales/delete', headers=headers, json={'ids': []}).status_code, 400)
            result = client.post('/api/sales/delete', headers=headers, json={'ids': [key]})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.get_json()['deleted'], 1)
            self.assertEqual(client.get('/api/sales').get_json()['total'], 0)
            self.assertEqual(client.get('/api/product-cost-policies').get_json()['items'][0]['used_quantity'], 0)
