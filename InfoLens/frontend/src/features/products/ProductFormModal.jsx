/**
 * 新增/编辑产品档案弹窗表单。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Input, Message, Select } from "../../lib/arco.js";
import { FormModal } from "../../components/ui/FormModal.jsx";
import { createProduct, updateProduct } from "../../api/products.js";
import { AUXILIARY_UNITS, emptyProductForm } from "./constants.js";

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

export function ProductFormModal({ visible, product, onClose, onSaved }) {
  const [form, setForm] = useState(emptyProductForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (product) {
      setForm({
        ...product,
        snow_inventory: String(product.snow_inventory ?? 0),
        specification: product.specification === null ? "" : String(product.specification),
        settlement_price: product.settlement_price === null ? "" : String(product.settlement_price),
      });
    } else {
      setForm(emptyProductForm());
    }
  }, [visible, product]);

  const validNonnegative = (value) =>
    value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const formReady =
    form.product_codes.length > 0 &&
    form.short_name.trim() &&
    form.product_name.trim() &&
    form.housekeeper_codes.length > 0 &&
    /^\d+$/.test(form.specification) &&
    form.auxiliary_unit &&
    validNonnegative(form.snow_inventory) &&
    (form.settlement_price === "" || validNonnegative(form.settlement_price));

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        snow_inventory: Number(form.snow_inventory),
        specification: Number(form.specification),
        settlement_price: form.settlement_price === "" ? null : Number(form.settlement_price),
      };
      if (form.id) {
        await updateProduct(form.id, payload);
      } else {
        await createProduct(payload);
      }
      Message.success(form.id ? "产品档案已更新" : "产品档案已新建");
      onClose();
      await onSaved?.();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      size="medium"
      title={form.id ? "编辑产品档案" : "新增产品档案"}
      visible={visible}
      loading={saving}
      okDisabled={!formReady}
      okText={form.id ? "保存修改" : "确认新增"}
      onCancel={onClose}
      onSubmit={save}
      className="product-form-modal"
    >
      <div className="product-form-grid">
        <div className="full-row">
          <label><i>*</i>商品编码</label>
          <MultiValueInput
            value={form.product_codes}
            placeholder="输入后按回车，可粘贴多个编码"
            onChange={(value) => setField("product_codes", value)}
          />
        </div>
        <div>
          <label><i>*</i>商品简称</label>
          <Input
            value={form.short_name}
            maxLength={100}
            onChange={(value) => setField("short_name", value)}
          />
        </div>
        <div>
          <label><i>*</i>雪花库存（箱）</label>
          <Input
            value={form.snow_inventory}
            onChange={(value) => {
              if (/^\d*(\.\d*)?$/.test(value)) setField("snow_inventory", value);
            }}
          />
        </div>
        <div className="full-row">
          <label><i>*</i>商品名称</label>
          <Input
            value={form.product_name}
            maxLength={500}
            onChange={(value) => setField("product_name", value)}
          />
        </div>
        <div className="full-row">
          <label><i>*</i>管家婆编码</label>
          <MultiValueInput
            value={form.housekeeper_codes}
            placeholder="输入后按回车，可粘贴多个编码"
            onChange={(value) => setField("housekeeper_codes", value)}
          />
        </div>
        <div>
          <label><i>*</i>规格</label>
          <Input
            value={form.specification}
            placeholder="每箱包含数量"
            onChange={(value) => setField("specification", value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <label><i>*</i>辅助单位</label>
          <Select
            value={form.auxiliary_unit || undefined}
            placeholder="瓶、听或罐"
            onChange={(value) => setField("auxiliary_unit", value)}
          >
            {AUXILIARY_UNITS.map((unit) => (
              <Option key={unit} value={unit}>{unit}</Option>
            ))}
          </Select>
        </div>
        <div>
          <label>结算价</label>
          <Input
            value={form.settlement_price}
            prefix="¥"
            onChange={(value) => {
              if (/^\d*(\.\d{0,2})?$/.test(value)) setField("settlement_price", value);
            }}
          />
        </div>
        <div className="product-spec-preview">
          <label>换算关系</label>
          <strong>
            {form.specification && form.auxiliary_unit
              ? `1箱 = ${form.specification}${form.auxiliary_unit}`
              : "请填写规格和辅助单位"}
          </strong>
        </div>
      </div>
    </FormModal>
  );
}

export default ProductFormModal;
