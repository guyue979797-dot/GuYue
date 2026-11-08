import React, { useEffect, useRef, useState } from '../lib/react.js';
import { Alert, Button, Form, Input, Message, Modal, Select, Space, Tag } from '../lib/arco.js';
import { FilterBar } from '../components/ui/FilterBar.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { TableRowActions } from '../components/ui/TableRowActions.jsx';
import { TableText } from '../components/ui/TableText.jsx';
import { FormDrawer } from '../components/ui/FormDrawer.jsx';
import { useContainerHeight } from '../hooks/useContainerHeight.js';

const blankFilters = { route: [], salesperson: [], status: '', keyword: '', terminal_business_type: '', snow_salesperson: '', remark: '' };
const routes = ['白云南路', '云城尚品', '龚家寨', '金园路'];
const people = ['张明', '李华', '王林'];
const names = ['晨光便利店', '云城生活超市', '悦来烟酒商行', '邻里优选便利店', '万家福食品经营部', '新街生活超市', '欣悦烟酒便利店', '惠民百货副食商行'];
const initialRows = Array.from({ length: 47 }, (_, i) => ({
  id: i + 1, terminal_code: String(1010000000 + i),
  customer_name: i === 3 ? '邻里优选便利店（云城尚品社区生活服务中心一号店）' : `${names[i % names.length]}${i > 7 ? `（${Math.floor(i / 8) + 1}店）` : ''}`,
  route: routes[i % routes.length], salesperson: people[i % people.length], snow_salesperson: people[(i + 1) % people.length],
  status: i % 7 === 0 ? '停业' : '运营',
  terminal_business_type: i % 3 === 0 ? '烟酒店' : '便利店',
  remark: i === 3 ? '长文本示例：社区入口右侧，招牌名称与工商登记名称不同。拜访前请核对终端编码，避免误选同名门店。' : i % 4 === 0 ? '请在上午联系门店负责人' : '',
}));
const fields = [
  { name: 'route', label: '线路归属', type: 'multi-select', placeholder: '全部线路', options: routes, showSearch: true },
  { name: 'salesperson', label: '业务员', type: 'multi-select', placeholder: '全部业务员', options: people, showSearch: true },
  { name: 'status', label: '经营状态', type: 'select', placeholder: '全部状态', options: ['运营', '停业'] },
  { name: 'keyword', label: '终端编码 / 客户名称', type: 'input', placeholder: '输入编码或名称', weight: 280 },
];
const additionalFields = [
  { name: 'terminal_business_type', label: '终端业态', type: 'select', placeholder: '全部业态', options: ['便利店', '烟酒店', '超市'], row: 1 },
  { name: 'snow_salesperson', label: '雪花业务员', type: 'select', placeholder: '全部雪花业务员', options: people, row: 1 },
  { name: 'remark', label: '备注', type: 'input', placeholder: '输入备注', weight: 280, row: 1 },
];
const clone = value => ({ ...value, route: [...value.route], salesperson: [...value.salesperson] });
const matches = (row, f) => (!f.route.length || f.route.includes(row.route)) && (!f.salesperson.length || f.salesperson.includes(row.salesperson)) && (!f.status || row.status === f.status) && (!f.keyword.trim() || `${row.terminal_code} ${row.customer_name}`.includes(f.keyword.trim())) && (!f.terminal_business_type || row.terminal_business_type === f.terminal_business_type) && (!f.snow_salesperson || row.snow_salesperson === f.snow_salesperson) && (!f.remark.trim() || row.remark.includes(f.remark.trim()));

export function CustomerDemo() {
  const [rows, setRows] = useState(initialRows);
  const [tableRef, tableHeight] = useContainerHeight(64);
  const [draft, setDraft] = useState(clone(blankFilters));
  const [applied, setApplied] = useState(clone(blankFilters));
  const [scenario, setScenario] = useState('normal');
  const [manyFilters, setManyFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [readOnly, setReadOnly] = useState(false);
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [failSave, setFailSave] = useState(false);
  const [form] = Form.useForm();
  const timer = useRef(null);
  const saveTimer = useRef(null);
  const opener = useRef(null);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(saveTimer.current); }, []);
  const filtered = rows.filter(row => matches(row, applied));
  const result = scenario === 'empty' || scenario === 'error' ? [] : filtered;

  function query(values = draft, nextScenario = scenario) {
    clearTimeout(timer.current);
    setLoading(true);
    const next = clone(values);
    timer.current = setTimeout(() => { setApplied(next); setPage(1); setScenario(nextScenario); setLoading(false); }, 650);
  }
  function open(mode, row) {
    opener.current = document.activeElement;
    setSaveError(''); setFailSave(false); setDirty(false);
    setPanel({ mode, row });
    form.resetFields();
    form.setFieldsValue(row || { status: '运营', route: routes[0], salesperson: people[0], terminal_business_type: '便利店' });
  }
  function close() {
    if (saving) return;
    setPanel(null);
    requestAnimationFrame(() => opener.current?.focus());
  }
  function requestClose() {
    if (saving) return;
    if (panel?.mode !== 'detail' && dirty) {
      Modal.confirm({ title: '放弃未保存的修改？', content: '关闭后，本次填写的内容不会保存。', okText: '放弃修改', cancelText: '继续编辑', onOk: close });
    } else close();
  }
  async function save() {
    if (saving) return;
    let values;
    try { values = await form.validate(); } catch (errors) {
      const field = Object.keys(errors?.errors || {})[0];
      if (field) {
        form.scrollToField(field, { block: 'nearest', behavior: 'smooth' });
        document.getElementById(`${field}_input`)?.focus();
      }
      return;
    }
    setSaving(true); setSaveError('');
    saveTimer.current = setTimeout(() => {
      setSaving(false);
      if (failSave) { setSaveError('保存失败，请重试。'); return; }
      const record = { ...panel.row, ...values, id: panel.row?.id || Date.now() };
      setRows(previous => panel.mode === 'create' ? [record, ...previous] : previous.map(row => row.id === record.id ? record : row));
      setPanel(null); Message.success('已保存');
      requestAnimationFrame(() => opener.current?.focus());
    }, 900);
  }
  const columns = [
    { key: 'terminal_code', title: '终端编码', render: (_, row) => <button type="button" className="data-link" onClick={() => open('detail', row)}>{row.terminal_code}</button> },
    { key: 'customer_name', title: '客户名称', maxAutoWidth: 320 },
    { key: 'route', title: '线路归属' },
    { key: 'salesperson', title: '业务员' },
    { key: 'terminal_business_type', title: '终端业态' },
    { key: 'status', title: '状态', widthText: row => row.status, render: (_, row) => <Tag color={row.status === '运营' ? 'green' : 'gray'}>{row.status}</Tag> },
    { key: 'remark', title: '备注', maxAutoWidth: 240, render: (_, row) => <TableText value={row.remark} /> },
    { key: 'actions', title: '操作', className: 'table-actions-cell', widthText: () => readOnly ? '详情' : '详情　⋯', render: (_, row) => <TableRowActions onDetail={() => open('detail', row)} items={readOnly ? [] : [{ key: 'edit', label: '编辑客户', onClick: () => open('edit', row) }]} /> },
  ];
  return <div className="ui-demo">
    <aside className="demo-sidebar">
      <div className="demo-brand"><span className="demo-brand-mark">鑫</span><div><strong>鑫向晨商贸</strong><small>业务工作台</small></div></div>
      <div className="demo-nav-label">客户管理</div>
      <nav aria-label="客户管理"><a className="demo-nav-active" href="#customers" aria-current="page">终端明细 <span>01</span></a></nav>
    </aside>
    <div className="demo-workspace">
      <header className="demo-topbar">
        <div className="demo-page-title"><span>客户管理</span><span className="demo-divider">/</span><h1>终端明细</h1></div>
        <Tag color="arcoblue">模拟数据</Tag>
      </header>
      <main className="demo-main" id="customers">
        <section className="demo-filter-card" aria-label="筛选客户">
          <FilterBar fields={manyFilters ? [...fields, ...additionalFields] : fields} values={draft} onChange={setDraft} onSearch={() => query()} onReset={() => { setDraft(clone(blankFilters)); query(blankFilters, 'normal'); }} loading={loading} showLabels />
        </section>
        <section className="demo-list-card" aria-label="客户列表">
          <div className="demo-list-heading"><h2>客户档案 <span aria-label="客户数量">{scenario === 'error' ? '—' : result.length}</span></h2><Button type="primary" disabled={readOnly} onClick={() => open('create')}>新增客户</Button></div>
          {scenario === 'error' && !loading ? <div className="demo-error" role="alert"><Alert type="error" showIcon content="客户列表加载失败"/><Button onClick={() => query(applied, 'normal')}>重新加载</Button></div> : null}
          <div className="demo-table-body" ref={tableRef}><DataTable scrollY={tableHeight} border={true} columns={columns} data={result.slice((page - 1) * pageSize, page * pageSize)} loading={loading} emptyText={scenario === 'error' ? '暂时无法获取客户数据' : <div className="demo-empty"><p>无匹配客户</p><Button onClick={() => { setDraft(clone(blankFilters)); query(blankFilters, 'normal'); }}>清空筛选</Button></div>} pagination={{ page, pageSize, total: result.length, onChange: setPage, onPageSizeChange: size => { setPageSize(size); setPage(1); } }} /></div>
        </section>
        <footer className="demo-controls"><strong>演示控制</strong><Space wrap><Button onClick={() => {
          const next = manyFilters ? clone(blankFilters) : { ...clone(blankFilters), route: [...routes], salesperson: [...people], status: '运营', terminal_business_type: '便利店' };
          setManyFilters(value => !value); setDraft(next); query(next, 'normal');
        }}>{manyFilters ? '基础筛选示例' : '多条件示例'}</Button><Select aria-label="演示状态" value={scenario} onChange={value => query(applied, value)} options={[{ value: 'normal', label: '正常数据' }, { value: 'empty', label: '空结果' }, { value: 'error', label: '请求失败' }]}/><Button onClick={() => query(applied)}>体验加载</Button><Button onClick={() => { setReadOnly(value => !value); setPanel(null); }}>{readOnly ? '切换为可编辑' : '切换为只读'}</Button></Space></footer>
      </main>
    </div>
    <FormDrawer title={panel?.mode === 'create' ? '新增客户' : panel?.mode === 'edit' ? '编辑客户' : '客户详情'} visible={Boolean(panel)} maskClosable size="small" className="demo-drawer" loading={saving} onCancel={requestClose} onSubmit={panel && panel.mode !== 'detail' ? save : undefined} footer={panel?.mode === 'detail' ? <Space><Button onClick={close}>关闭</Button>{!readOnly && <Button type="primary" onClick={() => open('edit', panel.row)}>编辑客户</Button>}</Space> : undefined}>
      {panel?.mode === 'detail' ? <><div className="demo-detail-intro"><h2>{panel.row.customer_name}</h2><p>终端编码 {panel.row.terminal_code}</p></div><div className="record-detail-grid">{[['状态', 'status'], ['线路归属', 'route'], ['业务员', 'salesperson'], ['终端业态', 'terminal_business_type'], ['备注', 'remark']].map(([label, key]) => <div key={key}><strong>{label}</strong><span>{panel.row[key] || '—'}</span></div>)}</div></> : <>
        {saveError && <Alert type="error" showIcon content={saveError} />}
        <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)} disabled={saving} className="drawer-field-stack">
          <Form.Item label="终端编码" field="terminal_code" rules={[{ required: true, message: '请输入终端编码' }, { match: /^\d{10}$/, message: '终端编码应为 10 位数字' }, { validator: (value, callback) => { if (rows.some(row => row.terminal_code === value && row.id !== panel?.row?.id)) callback('终端编码已存在'); else callback(); } }]}><Input aria-label="终端编码" placeholder="请输入 10 位数字" maxLength={10}/></Form.Item>
          <Form.Item label="客户名称" field="customer_name" rules={[{ required: true, whitespace: true, message: '请输入客户名称' }]}><Input aria-label="客户名称" placeholder="客户名称" maxLength={100}/></Form.Item>
          <Form.Item label="线路归属" field="route" rules={[{ required: true, message: '请选择线路' }]}><Select aria-label="线路归属" options={routes}/></Form.Item>
          <Form.Item label="业务员" field="salesperson" rules={[{ required: true, message: '请选择业务员' }]}><Select aria-label="业务员" options={people}/></Form.Item>
          <Form.Item label="终端业态" field="terminal_business_type"><Select aria-label="终端业态" options={['便利店', '烟酒店', '超市']}/></Form.Item>
          <Form.Item label="经营状态" field="status"><Select aria-label="经营状态" options={['运营', '停业']}/></Form.Item>
          <Form.Item label="备注" field="remark"><Input.TextArea aria-label="备注" placeholder="" maxLength={300} showWordLimit autoSize={{ minRows: 3, maxRows: 6 }}/></Form.Item>
        </Form>
        <details className="demo-tools"><summary>演示选项</summary><Button type={failSave ? 'primary' : 'secondary'} disabled={saving} onClick={() => setFailSave(value => !value)}>{failSave ? '模拟保存失败：已开启' : '模拟保存失败：已关闭'}</Button></details>
      </>}
    </FormDrawer>
  </div>;
}
