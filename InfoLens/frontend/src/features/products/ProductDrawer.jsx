import { AppDrawer } from "../../components/ui/AppDrawer.jsx";
/**
 * 商品右侧抽屉：详情、新增、编辑。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Button, Input, Message, Select, Space } from "../../lib/arco.js";
import { ProductDetails } from "./ProductDetail.jsx";
import { createProduct, updateProduct } from "../../api/products.js";
import { AUXILIARY_UNITS, PRODUCT_STATUSES, PRODUCT_BRANDS, PRODUCT_GRADES, emptyProductForm } from "./constants.js";

const { Option } = Select;

function MultiValueInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState("");

  function append(raw) {
    const additions = String(raw || "")
      .split(/[,，;；\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!additions.length) return;
    onChange(Array.from(new Set([...(value || []), ...additions])));
    setDraft("");
  }

  return (
    <div className="product-multi-input">
      {(value || []).map((item) => (
        <span className="product-code-tag" key={item}>
          {item}
          <button
            type="button"
            aria-label={`移除${item}`}
            onClick={() => onChange(value.filter((current) => current !== item))}
          >×</button>
        </span>
      ))}
      <Input
        value={draft}
        placeholder={value?.length ? "继续输入" : placeholder}
        onChange={setDraft}
        onBlur={() => append(draft)}
        onPaste={(event) => {
          const text = event.clipboardData?.getData("text") || "";
          if (/[,，;；\n]/.test(text)) {
            event.preventDefault();
            append(text);
          }
        }}
        onKeyDown={(event) => {
          if (["Enter", ",", "，", ";", "；"].includes(event.key)) {
            event.preventDefault();
            append(draft);
          }
        }}
      />
    </div>
  );
}

export function ProductDrawer({ visible, product, mode, onModeChange, onClose, onSaved }) {
  const [form, setForm] = useState(emptyProductForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (product) {
      setForm({
        ...product,
        snow_inventory: String(product.snow_inventory ?? 0),
        specification: product.specification == null ? "" : String(product.specification),
        cost_price: product.cost_price == null ? "" : String(product.cost_price),
        settlement_price: product.settlement_price == null ? "" : String(product.settlement_price),
      });
    } else {
      setForm(emptyProductForm());
    }
  }, [visible, product, mode]);

  const validNonnegative = (value) =>
    value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const complete = form.short_name.trim() && form.housekeeper_codes.length > 0 &&
    /^\d+$/.test(form.specification) && form.auxiliary_unit;
  const formReady = form.product_codes.length > 0 && form.product_name.trim() &&
    (form.status !== '正常' || complete) && validNonnegative(form.snow_inventory) &&
    (form.cost_price === "" || validNonnegative(form.cost_price)) &&
    (form.settlement_price === "" || validNonnegative(form.settlement_price));


  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save() {
    if (saving || !formReady) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        snow_inventory: Number(form.snow_inventory),
        specification: form.specification === "" ? null : Number(form.specification),
        cost_price: form.cost_price === "" ? null : Number(form.cost_price),
        settlement_price: form.settlement_price === "" ? null : Number(form.settlement_price),
      };
      const saved = form.id ? await updateProduct(form.id, payload) : await createProduct(payload);
      Message.success(form.id ? "商品档案已更新" : "商品档案已新建");
      await onSaved?.(saved);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  function enumField(field, label, options) {
    return <div key={field}><label>{label}</label>
      <Select aria-label={label} value={form[field] || undefined} showSearch allowCreate allowClear
        placeholder={`请选择${label}或输入自定义值`} getPopupContainer={() => document.body}
        onChange={value => setField(field, value || '')}>
        {[...new Set([...options, ...(form[field] ? [form[field]] : [])])].map(value =>
          <Option key={value} value={value}>{value}</Option>)}
      </Select>
    </div>;
  }

  return (
    <AppDrawer
      placement="right" width="min(720px, 100vw)"
      title={mode === 'detail' ? '商品详情' : mode === 'edit' ? '编辑商品' : '新增商品'}
      visible={visible} onCancel={() => { if (!saving) onClose(); }}
      closable={!saving} escToExit={!saving} maskClosable={false} unmountOnExit
      className="product-drawer"
      footer={<Space>
        <Button disabled={saving} onClick={() => {
          if (mode === 'edit') onModeChange('detail'); else onClose();
        }}>{mode === 'detail' ? '关闭' : '取消'}</Button>
        {mode === 'detail'
          ? <Button type="primary" disabled={saving} onClick={() => onModeChange('edit')}>编辑</Button>
          : <Button type="primary" loading={saving} disabled={!formReady || saving} onClick={save}>
            {mode === 'create' ? '确认新增' : '保存修改'}
          </Button>}
      </Space>}
    >
      {mode === 'detail' ? <ProductDetails product={product} /> : <>
      <div className="product-form-grid product-edit-fields">
        <div>
          <label>{form.status === "正常" && <i>*</i>}存货编号</label>
          <Input aria-label="存货编号" value={form.housekeeper_codes[0] || ''} maxLength={100}
            placeholder="请输入唯一存货编号"
            onChange={value => setField('housekeeper_codes', value.trim() ? [value.trim()] : [])} />
        </div>
        {enumField('brand', '品牌', PRODUCT_BRANDS)}
        <div>
          <label>{form.status === "正常" && <i>*</i>}商品</label>
          <Input value={form.short_name} maxLength={100} onChange={value => setField('short_name', value)} />
        </div>
        <div><label>状态</label>
          <Select aria-label="状态" value={form.status || '待处理'} getPopupContainer={() => document.body}
            onChange={value => setField('status', value)}>
            {PRODUCT_STATUSES.map(value => <Option key={value} value={value}>{value}</Option>)}
          </Select>
        </div>
        <div><label>成本价</label>
          <Input aria-label="成本价" value={form.cost_price} prefix="¥" placeholder="选填" onChange={value => {
            if (/^\d*(\.\d{0,2})?$/.test(value)) setField('cost_price', value);
          }} />
        </div>
        <div><label>雪花结算价</label>
          <Input aria-label="雪花结算价" value={form.settlement_price} prefix="¥" placeholder="选填" onChange={value => {
            if (/^\d*(\.\d{0,2})?$/.test(value)) setField('settlement_price', value);
          }} />
        </div>
        {enumField('grade', '等级', PRODUCT_GRADES)}
        <div>
          <label>{form.status === "正常" && <i>*</i>}规格</label>
          <div className="product-spec-editor">
            <div className="product-spec-controls">
              <Input aria-label="每箱包含数量" value={form.specification} placeholder="每箱包含数量"
                onChange={value => setField('specification', value.replace(/\D/g, ''))} />
              <Select aria-label="辅助单位" value={form.auxiliary_unit || undefined} placeholder="辅助单位"
                getPopupContainer={() => document.body} onChange={value => setField('auxiliary_unit', value)}>
                {AUXILIARY_UNITS.map(unit => <Option key={unit} value={unit}>{unit}</Option>)}
              </Select>
            </div>
            {form.specification && form.auxiliary_unit ? <span>1箱 = {form.specification}{form.auxiliary_unit}</span> : null}
          </div>
        </div>
        <div>
          <label><i>*</i>雪花库存（箱）</label>
          <Input value={form.snow_inventory} onChange={value => {
            if (/^\d*(\.\d*)?$/.test(value)) setField('snow_inventory', value);
          }} />
        </div>
        <div><label><i>*</i>商品全称</label>
          <Input value={form.product_name} maxLength={500} onChange={value => setField('product_name', value)} />
        </div>
        <div><label><i>*</i>商品编码</label>
          <MultiValueInput value={form.product_codes} placeholder="输入后按回车，可粘贴多个编码"
            onChange={value => setField('product_codes', value)} />
        </div>
      </div>
      </>}
    </AppDrawer>
  );
}

export default ProductDrawer;
