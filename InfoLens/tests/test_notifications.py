import io
import tempfile
import time
import unittest
from functools import wraps
from pathlib import Path
from flask import Flask, abort, jsonify, request
from infolens.notifications import NotificationStore, install_notifications


class NotificationStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = NotificationStore(Path(self.tmp.name) / 'notifications.sqlite3')

    def tearDown(self):
        self.tmp.cleanup()

    def test_shared_results_independent_reads_and_idempotent_completion(self):
        self.store.add('销售表上传', 'success', 'alice', '甲', 'sales.xlsx', {'imported': 12}, key='one')
        self.store.add('销售表上传', 'success', 'alice', '甲', key='one')
        self.assertEqual(self.store.list('bob')['unread_count'], 1)
        self.assertEqual(self.store.detail('one', 'bob')['details']['imported'], 12)
        self.assertEqual(self.store.list('bob')['unread_count'], 0)
        self.assertEqual(self.store.list('alice')['unread_count'], 1)
        self.assertEqual(self.store.list('alice')['total'], 1)

    def test_retention_cascades_reads_and_removes_details(self):
        self.store.add('客户表上传', 'failed', 'a', '甲', details={'error': '错误'}, key='old')
        self.store.detail('old', 'b')
        self.store.preview('preview', 'file.xlsx')
        future = time.time() + 61 * 86400
        self.store.prune(future)
        with self.store.connect() as db:
            for table in ('notifications', 'notification_reads', 'notification_previews'):
                self.assertEqual(db.execute('SELECT count(*) FROM ' + table).fetchone()[0], 0)

    def test_pagination_unread_and_mark_all_snapshot(self):
        for i in range(23):
            self.store.add('上传', 'success', 'a', '甲', key=str(i))
        self.assertEqual(len(self.store.list('b', 2)['items']), 3)
        cutoff = time.time()
        self.store.read_all('b', cutoff)
        self.store.add('上传', 'success', 'a', '甲', key='new')
        self.assertEqual(self.store.list('b', unread=True)['total'], 1)
        self.assertEqual(self.store.list('a')['unread_count'], 24)


class NotificationAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = Flask(__name__)
        self.app.testing = True
        def user():
            return request.headers.get('User', '')
        def login(fn):
            @wraps(fn)
            def wrapped(*args, **kwargs):
                if not user():
                    abort(401)
                return fn(*args, **kwargs)
            return wrapped
        def csrf():
            if request.headers.get('X-CSRF-Token') != 'test':
                abort(403)
        self.store = install_notifications(self.app, Path(self.tmp.name) / 'n.sqlite3', login, user,
                                           lambda: (user(), user()), csrf)
        @self.app.post('/api/sales/upload')
        @login
        def upload():
            csrf()
            return jsonify(imported=10, product_sync_error='商品同步失败', token='secret', source_url='private')
        @self.app.post('/api/products/import/preview')
        @login
        def preview():
            return jsonify(preview_id='draft', **(request.get_json(silent=True) or {}))
        @self.app.post('/api/products/import')
        @login
        def commit():
            return jsonify(created_count=3, failed_count=0)
        @self.app.post('/api/customers/import')
        @login
        def bad_upload():
            return jsonify(error='格式错误'), 400
        self.client = self.app.test_client()
        self.headers = {'User': 'alice', 'X-CSRF-Token': 'test'}

    def tearDown(self):
        self.tmp.cleanup()

    def test_authenticated_read_csrf_and_cross_user_visibility(self):
        self.assertEqual(self.client.get('/api/notifications').status_code, 401)
        self.client.post('/api/sales/upload', headers=self.headers,
                         data={'file': (io.BytesIO(b'data'), 'sales.xlsx')})
        data = self.client.get('/api/notifications', headers={'User': 'bob'}).get_json()
        self.assertEqual(data['unread_count'], 1)
        item = data['items'][0]
        self.assertEqual(item['result'], 'partial_success')
        self.assertEqual(item['filename'], 'sales.xlsx')
        url = '/api/notifications/' + item['id']
        detail = self.client.get(url, headers={'User': 'bob'}).get_json()
        self.assertNotIn('token', detail['details'])
        self.assertNotIn('source_url', detail['details'])
        self.assertEqual(self.store.list('bob')['unread_count'], 1)
        self.assertEqual(self.client.post(url + '/read', headers={'User': 'bob'}).status_code, 403)
        self.assertEqual(self.client.post(url + '/read', headers={'User': 'bob', 'X-CSRF-Token': 'test'}).status_code, 200)
        self.assertEqual(self.store.list('alice')['unread_count'], 1)
        self.assertEqual(self.store.list('bob')['unread_count'], 0)
        self.assertEqual(self.client.get('/api/notifications?page=bad', headers=self.headers).status_code, 400)
        self.assertEqual(self.client.get('/api/notifications/missing', headers=self.headers).status_code, 404)

    def test_preview_only_notifies_on_commit_and_preserves_filename(self):
        self.client.post('/api/products/import/preview', headers=self.headers,
                         data={'file': (io.BytesIO(b'data'), 'stock.xlsx')})
        self.assertEqual(self.store.list('alice')['total'], 0)
        self.client.post('/api/products/import', headers=self.headers, json={'preview_id': 'draft'})
        self.assertEqual(self.store.list('bob')['items'][0]['filename'], 'stock.xlsx')
        self.assertEqual(self.store.list('alice')['total'], 1)

    def test_failed_upload_is_recorded_but_csrf_rejection_is_not(self):
        self.client.post('/api/sales/upload', headers={'User': 'alice'})
        self.assertEqual(self.store.list('alice')['total'], 0)
        self.client.post('/api/customers/import', headers=self.headers)
        item = self.store.list('bob')['items'][0]
        self.assertEqual(item['result'], 'failed')
        self.assertEqual(self.store.detail(item['id'], 'bob')['details']['error'], '格式错误')

    def test_all_failed_preview_is_failed_not_partial(self):
        self.client.post('/api/products/import/preview', headers=self.headers,
                         json={'total_count': 2, 'failed_count': 2})
        self.assertEqual(self.store.list('alice')['items'][0]['result'], 'failed')
