import React, { useEffect, useRef, useState } from "../../lib/react.js";
import { Alert, Button, DatePicker, Empty, Input, Message, Modal, Select, Spin, Tag, Tooltip } from "../../lib/arco.js";
import { FilterBar } from "../../components/ui/FilterBar.jsx";
import { FormDrawer } from "../../components/ui/FormDrawer.jsx";
import { createProductPolicy, endProductPolicy, getPolicyProducts, listProductPolicies } from "../../api/productPolicies.js";

const currentMonth = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date());
const emptyForm = () => ({ product_id: undefined, month: currentMonth(), price: "", quantity: "", remarks: "" });
const defaultFilters = () => ({ product_id: undefined, month: undefined, status: "进行中" });

export function ProductPolicyPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [query, setQuery] = useState(filters);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  async function load(values) {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await listProductPolicies(values);
      if (id === requestId.current) setItems(data.items || []);
    } catch (err) {
      if (id === requestId.current) { setItems([]); setError(err.message); }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  async function loadOptions() {
    setOptionsError("");
    try { setProducts((await getPolicyProducts()).items || []); }
    catch (err) { setOptionsError(err.message); }
  }
  useEffect(() => { loadOptions(); }, []);
  useEffect(() => { load(query); return () => { requestId.current += 1; }; }, [query]);

  const displayName = (item) => products.find((p) => p.id === item.product_id)?.short_name || item.short_name || item.product_name;
  const options = products.map((p) => ({ value: p.id, label: p.short_name || p.product_name }));
  const renderProduct = (_, value) => {
    const label = options.find((option) => option.value === value)?.label || "";
    return <Tooltip content={label} getPopupContainer={() => document.body}><span className="product-policy-selected-name">{label}</span></Tooltip>;
  };
  const ready = form.product_id && form.month && /^\d+(\.\d{1,2})?$/.test(form.price)
    && Number(form.price) <= 999999999.99 && /^[1-9]\d*$/.test(form.quantity) && Number(form.quantity) <= 1000000000;
  const field = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await createProductPolicy(form);
      Message.success("商品政策已新建");
      setVisible(false);
      const next = defaultFilters();
      setFilters(next);
      setQuery(next);
    } catch (err) { Message.error(err.message); }
    finally { setSaving(false); }
  }
  function end(item) {
    Modal.confirm({
      title: "结束政策",
      content: `确定结束“${displayName(item)}”${item.month}的政策吗？结束后该政策不再使用。`,
      okText: "结束政策",
      onOk: async () => {
        try { await endProductPolicy(item.id); Message.success("政策已结束"); await load(query); }
        catch (err) { Message.error(err.message); throw err; }
      },
    });
  }

  return (
    <div className="product-policy-page">
      <div className="table-page-filter-card">
        <FilterBar fields={[
          { name: 'month', label: '政策月份', type: 'month', placeholder: '政策月份', width: 180 },
          { name: 'product_id', label: '商品名称', type: 'select', placeholder: '全部商品', width: 360,
            showSearch: true, options, renderFormat: renderProduct },
          { name: 'status', label: '政策状态', type: 'select', placeholder: '全部状态', width: 180,
            options: [{ value: '进行中', label: '未结束' }, { value: '已结束', label: '已结束' }] },
        ]} values={filters} onChange={setFilters} loading={loading}
          onSearch={() => setQuery({ ...filters })}
          onReset={() => { const next = defaultFilters(); setFilters(next); setQuery(next); }} />
      </div>
      <div className="product-policy-results">
        <div className="product-policy-heading"><strong>价格与用量</strong><span>共 {items.length} 条政策</span>
          <Button className="product-policy-new-button" type="primary" onClick={() => { setForm(emptyForm()); setVisible(true); loadOptions(); }}>新建政策</Button>
        </div>
        {optionsError && <Alert type="error" content={`商品选项加载失败：${optionsError}`} action={<Button onClick={loadOptions}>重试</Button>} />}
        {error && <Alert type="error" content={error} action={<Button onClick={() => load(query)}>重试</Button>} />}
        <Spin loading={loading} style={{ width: "100%" }}>
          {!items.length && !error ? <Empty description={loading ? "正在加载政策" : "暂无商品政策，可点击新建政策添加"} /> : null}
          <div className="product-policy-grid">
            {items.map((item) => (
              <article className="product-policy-card" key={item.id}>
                <div className="product-policy-card-title"><Tooltip content={displayName(item)}><h3>{displayName(item)}</h3></Tooltip>{item.status === "进行中" ? <Button className="product-policy-end-button" type="text" size="small" onClick={() => end(item)}>结束政策</Button> : <Tag color="gray">已结束</Tag>}</div>
                <div className="product-policy-month"><span>政策月份 · {item.month.replace("-", "年")}月</span></div>
                <div className="product-policy-price">¥{item.price.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small> / 件</small></div>
                <div className="product-policy-quantity"><span>已使用 / 总量</span><strong>{item.used_quantity.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} / {item.quantity.toLocaleString()} 件</strong></div>
                <div className="product-policy-remarks"><Tooltip content={item.remarks || "暂无备注"}><p>{item.remarks || ""}</p></Tooltip></div>
              </article>
            ))}
          </div>
        </Spin>
      </div>
      <FormDrawer className="product-policy-form-modal" title="新建商品政策" size="small" visible={visible} loading={saving} okDisabled={!ready || saving} onSubmit={save} onCancel={() => { if (!saving) setVisible(false); }}>
        {optionsError && <Alert type="error" content={optionsError} />}
        <div className="product-form-grid drawer-field-stack">
          <div className="full-row"><label><i>*</i>商品名称</label><Select getPopupContainer={() => document.body} aria-label="商品名称" showSearch renderFormat={renderProduct} options={options} placeholder="从商品档案选择商品" value={form.product_id} onChange={(value) => field("product_id", value)} /></div>
          <div className="full-row"><label><i>*</i>政策月份</label><DatePicker.MonthPicker getPopupContainer={() => document.body} aria-label="政策月份" style={{ width: "100%" }} value={form.month || undefined} onChange={(value) => field("month", value)} /></div>
          <div><label><i>*</i>价格（元/件）</label><Input aria-label="价格（元/件）" prefix="¥" placeholder="0.00" value={form.price} onChange={(value) => { if (/^\d*(\.\d{0,2})?$/.test(value)) field("price", value); }} /></div>
          <div><label><i>*</i>政策件数</label><Input aria-label="政策件数" suffix="件" placeholder="请输入正整数" value={form.quantity} onChange={(value) => { if (/^\d*$/.test(value)) field("quantity", value); }} /></div>
          <div className="full-row"><label>备注说明</label><Input.TextArea aria-label="备注说明" placeholder="请输入备注说明（50字以内）" value={form.remarks} maxLength={50} showWordLimit onChange={(value) => field("remarks", value)} autoSize={{ minRows: 2, maxRows: 3 }} /></div>
        </div>
      </FormDrawer>
    </div>
  );
}
