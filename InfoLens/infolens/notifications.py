"""Shared upload results with per-user reads and a 60-day retention window."""
import json
from contextlib import contextmanager
import sqlite3
import time
import uuid
from pathlib import Path


class NotificationStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY, event TEXT NOT NULL, result TEXT NOT NULL,
                    operator TEXT NOT NULL, operator_name TEXT NOT NULL,
                    filename TEXT NOT NULL, started_at REAL NOT NULL,
                    created_at REAL NOT NULL, details TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS notification_time ON notifications(created_at DESC);
                CREATE TABLE IF NOT EXISTS notification_reads (
                    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
                    username TEXT NOT NULL, PRIMARY KEY(notification_id, username));
                CREATE TABLE IF NOT EXISTS notification_previews (
                    id TEXT PRIMARY KEY, filename TEXT NOT NULL, created_at REAL NOT NULL, details TEXT NOT NULL DEFAULT '{}');
            ''')
            if 'details' not in {row[1] for row in db.execute('PRAGMA table_info(notification_previews)')}:
                db.execute("ALTER TABLE notification_previews ADD COLUMN details TEXT NOT NULL DEFAULT '{}' ")
        self.prune()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def prune(self, now=None):
        cutoff = (time.time() if now is None else now) - 60 * 86400
        with self.connect() as db:
            db.execute('DELETE FROM notifications WHERE created_at <= ?', (cutoff,))
            db.execute('DELETE FROM notification_previews WHERE created_at <= ?', (cutoff,))

    def preview(self, key, filename, details=None):
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO notification_previews (id,filename,created_at,details) VALUES (?,?,?,?)', (key, filename, time.time(), json.dumps(details or {}, ensure_ascii=False)))

    def preview_metadata(self, key):
        with self.connect() as db:
            row = db.execute('SELECT filename, details FROM notification_previews WHERE id=?', (key,)).fetchone()
        return {'filename': row['filename'], 'details': json.loads(row['details'])} if row else {'filename': '', 'details': {}}

    def preview_filename(self, key):
        return self.preview_metadata(key)['filename']

    def add(self, event, result, operator, operator_name, filename='', details=None, started_at=None, key=None):
        self.prune()
        now = time.time()
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?,?,?,?)',
                       (key or uuid.uuid4().hex, event, result, operator, operator_name or operator,
                        filename, started_at or now, now, json.dumps(details or {}, ensure_ascii=False)))

    def list(self, username, page=1, unread=False):
        self.prune()
        where = 'WHERE r.username IS NULL' if unread else ''
        join = 'FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.username=?'
        with self.connect() as db:
            total = db.execute('SELECT COUNT(*) ' + join + ' ' + where, (username,)).fetchone()[0]
            count = db.execute('SELECT COUNT(*) ' + join + ' WHERE r.username IS NULL', (username,)).fetchone()[0]
            rows = db.execute('SELECT n.*, r.username IS NOT NULL AS is_read ' + join + ' ' + where +
                              ' ORDER BY n.created_at DESC,n.id DESC LIMIT 20 OFFSET ?', (username, (page-1)*20)).fetchall()
        items = [{k: row[k] for k in row.keys() if k != 'details'} for row in rows]
        return dict(items=items, total=total, unread_count=count, page=page)

    def detail(self, key, username=None):
        self.prune()
        with self.connect() as db:
            row = db.execute('SELECT * FROM notifications WHERE id=?', (key,)).fetchone()
            if not row:
                return None
            if username is not None:
                db.execute('INSERT OR IGNORE INTO notification_reads VALUES (?,?)', (key, username))
        return {**dict(row), 'details': json.loads(row['details']), 'is_read': username is not None}

    def read_all(self, username, before):
        self.prune()
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO notification_reads SELECT id,? FROM notifications WHERE created_at<=?', (username, before))


# Store only business result fields: no upload URLs, local paths, credentials or request bodies.
DETAIL_FIELDS = {
    'error', 'message', 'total_count', 'success_count', 'failed_count', 'created_count',
    'updated_count', 'unchanged_count', 'skipped_count', 'warning_count', 'summary_only_count',
    'imported', 'total', 'row_count', 'ticket_count', 'terminal_count', 'tag_count',
    'auto_customer_count', 'months', 'errors', 'warnings', 'product_sync', 'product_sync_error',
    'details', 'monthly_inbound_tons', 'snow_inventory_boxes', 'monthly_summaries',
}


def safe_details(payload):
    return {key: value for key, value in payload.items() if key in DETAIL_FIELDS}


def install_notifications(app, path, login_required, current_user, operator, csrf):
    from flask import g, jsonify, request
    store = NotificationStore(path)
    app.extensions['notifications'] = store
    events = {
        '/api/sales/upload': '销售表上传',
        '/api/customers/import': '客户表上传',
        '/api/products/import/upload': '商品表上传',
        '/api/products/import': '商品表上传',
        '/api/products/import/preview': '商品表上传',
        '/api/snow-outbound/preview': '政策表上传',
        '/api/snow-outbound/import': '政策表上传',
        '/api/extract': '照片链接导入',
        '/api/batch-extract': '照片批量上传',
    }

    @app.before_request
    def start_upload_clock():
        if request.method == 'POST' and request.path in events:
            g.upload_started_at = time.time()

    @app.after_request
    def record_upload_response(response):
        if request.method != 'POST' or request.path not in events or response.status_code in (401, 403, 429):
            return response
        if not current_user() or getattr(g, 'upload_record_id', None):
            return response
        try:
            payload = response.get_json(silent=True) or {}
            upload = request.files.get('file') if response.status_code != 413 else None
            filename = Path(upload.filename).name if upload and upload.filename else ''
            if request.path.endswith('/preview') and response.status_code < 400:
                store.preview(events[request.path] + ':' + payload['preview_id'], filename, safe_details(payload))
                if not payload.get('failed_count'):
                    return response
            if response.status_code == 202:
                return response
            preview_id = (request.get_json(silent=True) or {}).get('preview_id', '')
            preview = store.preview_metadata(events[request.path] + ':' + str(preview_id))
            filename = filename or preview['filename']
            details = {**preview['details'], **safe_details(payload)}
            if response.status_code >= 500 and not details.get('error'):
                details['error'] = '处理异常，请联系管理员查看日志'
            failed = int(payload.get('failed_count') or 0)
            all_failed = failed > 0 and (payload.get('success_count') == 0 or failed == payload.get('total_count'))
            result = 'failed' if response.status_code >= 400 or all_failed else 'partial_success' if failed or payload.get('product_sync_error') else 'success'
            user, name = operator()
            store.add(events[request.path], result, user, name, filename, details, getattr(g, 'upload_started_at', None))
        except Exception:
            app.logger.exception('保存上传结果通知失败')
        return response

    @app.get('/api/notifications')
    @login_required
    def list_notifications():
        try:
            page = int(request.args.get('page', '1'))
            if page < 1 or page > 100000:
                raise ValueError()
        except ValueError:
            return jsonify(error='分页参数不正确'), 400
        return jsonify(store.list(current_user(), page, request.args.get('unread') == 'true'))

    @app.get('/api/notifications/<key>')
    @login_required
    def notification_detail(key):
        item = store.detail(key)
        return (jsonify(item), 200) if item else (jsonify(error='通知不存在或已超过60天'), 404)

    @app.post('/api/notifications/<key>/read')
    @login_required
    def read_notification(key):
        csrf()
        item = store.detail(key, current_user())
        return (jsonify(item), 200) if item else (jsonify(error='通知不存在或已超过60天'), 404)

    @app.post('/api/notifications/read-all')
    @login_required
    def read_all_notifications():
        csrf()
        store.read_all(current_user(), time.time())
        return jsonify(message='已全部标为已读')

    return store
