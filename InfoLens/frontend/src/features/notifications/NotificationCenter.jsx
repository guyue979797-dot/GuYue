import { AppDrawer } from "../../components/ui/AppDrawer.jsx";
import React, { useCallback, useEffect, useRef, useState } from '../../lib/react.js';
import { Alert, Button, Empty, Pagination, Radio, Spin, Tag } from '../../lib/arco.js';
import { listNotifications, readNotification, readAllNotifications } from '../../api/notifications.js';
import './notifications.css';
import { resultErrors } from './resultErrors.js';

const results = { success: '成功', partial_success: '部分成功', failed: '失败' };
const colors = { success: 'green', partial_success: 'orange', failed: 'red' };
const formatTime = value => new Date(value * 1000).toLocaleString('zh-CN', { hour12: false });

function ErrorItems({ details }) {
  const [page, setPage] = useState(1);
  const errors = resultErrors(details);
  if (!errors.length) return <span>无</span>;
  return <div className="notice-result-array">{errors.slice((page - 1) * 20, page * 20).map((item, index) =>
    <div className="notice-result-item" key={index}>
      {item.identity && <strong>{item.identity}</strong>}
      <div>{item.message}</div>
    </div>)}
    {errors.length > 20 && <Pagination current={page} total={errors.length} pageSize={20} onChange={setPage} simple />}
  </div>;
}

export function NotificationCenter() {
  const [visible, setVisible] = useState(false);
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, unread_count: 0 });
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [reading, setReading] = useState(false);
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const seq = ++sequence.current;
    if (!quiet) setLoading(true);
    try {
      const next = await listNotifications({ page, unread });
      if (seq !== sequence.current) return;
      setData(next); setError('');
      if (!next.items.length && page > 1) setPage(page - 1);
    } catch (e) { if (seq === sequence.current && !quiet) setError(e.message); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [page, unread]);
  useEffect(() => {
    load(!visible);
    const timer = setInterval(() => { if (!document.hidden) load(true); }, 15000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('upload-result', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('upload-result', onFocus); sequence.current++; };
  }, [load, visible]);
  async function openDetail(item) {
    const seq = ++detailSequence.current;
    setDetail(null); setDetailError(''); setDetailOpen(true); setReading(true);
    try { const next = await readNotification(item.id); if (seq === detailSequence.current) { setDetail(next); load(true); } }
    catch (e) { if (seq === detailSequence.current) setDetailError(e.message); }
    finally { if (seq === detailSequence.current) setReading(false); }
  }
  async function markAll() {
    setLoading(true);
    try { await readAllNotifications(); await load(); }
    catch (e) { setError(e.message); setLoading(false); }
  }
  return <>
    <button className="icon-btn notification-btn notice-bell" type="button" aria-label={`通知，${data.unread_count}条未读`} title="消息通知" onClick={() => setVisible(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {data.unread_count > 0 && <span className="notice-count">{data.unread_count > 99 ? '99+' : data.unread_count}</span>}
    </button>
    <AppDrawer title="消息通知" visible={visible} width="min(520px, 100vw)" footer={null} onCancel={() => setVisible(false)}>
      <div className="notice-toolbar"><Radio.Group type="button" value={unread ? 'unread' : 'all'} onChange={value => { setUnread(value === 'unread'); setPage(1); }}>
        <Radio value="all">全部</Radio><Radio value="unread">未读 {data.unread_count}</Radio>
      </Radio.Group><Button type="text" disabled={!data.unread_count || loading} onClick={markAll}>全部标为已读</Button></div>
      {error && <Alert type="error" content={error} action={<Button onClick={() => load()}>重试</Button>} />}
      <Spin loading={loading} style={{ width: '100%' }}>
        {!data.items.length && !error ? <Empty description={unread ? '暂无未读通知' : '暂无上传结果，上传完成后将在此展示'} /> : data.items.map(item =>
          <button className={`notice-item ${item.is_read ? '' : 'notice-item-unread'}`} key={item.id} onClick={() => openDetail(item)}>
            <div className="notice-item-title"><strong>{item.event}</strong><Tag color={colors[item.result]}>{results[item.result]}</Tag>{!item.is_read && <i aria-label="未读" />}</div>
            {item.filename && <div className="notice-filename" title={item.filename}>{item.filename}</div>}
            <div className="notice-item-meta"><span>操作人：{item.operator_name}</span></div>
            <div className="notice-item-footer"><time>{formatTime(item.created_at)}</time><span className="notice-view">查看详情</span></div>
          </button>)}
      </Spin>
      {data.total > 20 && <Pagination current={page} total={data.total} pageSize={20} onChange={setPage} />}
    </AppDrawer>
    <AppDrawer title="详情" visible={detailOpen} width="min(680px, 100vw)" footer={null} onCancel={() => { setDetailOpen(false); detailSequence.current++; }}>
      {detailError && <Alert type="error" content={detailError} />}
      <Spin loading={reading} style={{ width: '100%' }}>{detail && <div className="notice-detail">
        <h4>处理结果</h4>
        <dl className="notice-result-fields">
          <div><dt>状态</dt><dd><Tag color={colors[detail.result]}>{results[detail.result]}</Tag></dd></div>
          <div><dt>操作人</dt><dd>{detail.operator_name}</dd></div>
          <div><dt>上传文件</dt><dd>{detail.filename || '—'}</dd></div>
          <div><dt>开始时间</dt><dd>{formatTime(detail.started_at)}</dd></div>
          <div><dt>结束时间</dt><dd>{formatTime(detail.created_at)}</dd></div>
          <div><dt>错误项</dt><dd><ErrorItems key={detail.id} details={detail.details} /></dd></div>
        </dl>
      </div>}</Spin>
    </AppDrawer>
  </>;
}
