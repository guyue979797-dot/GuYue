import { useDraftState } from '../../hooks/useDraftState.js';
/**
 * 新增/编辑客户档案弹窗表单。
 */
import React, { useState } from "../../lib/react.js";
import { Input, Message, Select } from "../../lib/arco.js";
import { FormDrawer } from "../../components/ui/FormDrawer.jsx";
import { createCustomer, updateCustomer } from "../../api/customers.js";
import { CUSTOMER_STATUSES, EMPTY_CUSTOMER_FORM } from "./constants.js";

const { Option } = Select;

export function CustomerFormModal({
  visible,
  customer,
  salespeople,
  snowSalespeople,
  onClose,
  onSaved,
}) {
  const [form, setForm, resetForm, dirty] = useDraftState({ ...EMPTY_CUSTOMER_FORM });
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      resetForm(customer ? { ...EMPTY_CUSTOMER_FORM, ...customer } : { ...EMPTY_CUSTOMER_FORM });
    }
  }, [visible, customer]);

  const canSave =
    /^\d{10}$/.test(form.terminal_code) &&
    form.customer_name.trim();

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const isEdit = Boolean(form.id);
      if (isEdit) {
        await updateCustomer(form.id, form);
      } else {
        await createCustomer(form);
      }
      Message.success(isEdit ? "客户档案已更新" : "客户档案已新增");
      onClose();
      await onSaved?.();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDrawer
      size="small"
      title={form.id ? "编辑客户档案" : "新增客户档案"}
      visible={visible}
      loading={saving} dirty={dirty}
      okDisabled={!canSave}
      okText={form.id ? "保存修改" : "确认新增"}
      onCancel={onClose}
      onSubmit={save}
      className="customer-form-modal"
    >
      <div className="customer-form-grid drawer-field-stack">
        <div>
          <label><i>*</i>终端编码</label>
          <Input aria-label="终端编码"
            value={form.terminal_code}
            maxLength={10}
            placeholder="10位纯数字"
            onChange={(value) => setField("terminal_code", value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <label><i>*</i>客户全名</label>
          <Input aria-label="客户全名"
            value={form.customer_name}
            maxLength={200}
            onChange={(value) => setField("customer_name", value)}
          />
        </div>
        <div>
          <label>终端业态</label>
          <Input aria-label="终端业态"
            value={form.terminal_business_type}
            maxLength={100}
            onChange={(value) => setField("terminal_business_type", value)}
          />
        </div>
        <div>
          <label><i>*</i>状态</label>
          <Select aria-label="状态"
            value={form.status}
            onChange={(value) => setField("status", value)}
          >
            {CUSTOMER_STATUSES.map((value) => (
              <Option key={value} value={value}>{value}</Option>
            ))}
          </Select>
        </div>
        <div>
          <label>线路归属</label>
          <Input aria-label="线路归属"
            value={form.route}
            maxLength={100}
            onChange={(value) => setField("route", value)}
          />
        </div>
        <div>
          <label>业务员</label>
          <Select aria-label="业务员"
            value={form.salesperson || undefined}
            allowClear
            placeholder="可不选择"
            onChange={(value) => setField("salesperson", value || "")}
          >
            {(salespeople || []).map((name) => (
              <Option key={name} value={name}>{name}</Option>
            ))}
          </Select>
        </div>
        <div>
          <label>雪花业务员</label>
          <Select aria-label="雪花业务员"
            value={form.snow_salesperson || undefined}
            allowClear
            placeholder="可不选择"
            onChange={(value) => setField("snow_salesperson", value || "")}
          >
            {(snowSalespeople || []).map((name) => (
              <Option key={name} value={name}>{name}</Option>
            ))}
          </Select>
        </div>
        <div>
          <label>客户联系人</label>
          <Input aria-label="客户联系人"
            value={form.contact}
            maxLength={100}
            onChange={(value) => setField("contact", value)}
          />
        </div>
        <div>
          <label>客户手机</label>
          <Input aria-label="客户手机"
            value={form.phone}
            maxLength={50}
            onChange={(value) => setField("phone", value)}
          />
        </div>
        <div className="full-row">
          <label>客户地址</label>
          <Input aria-label="客户地址"
            value={form.address}
            maxLength={500}
            onChange={(value) => setField("address", value)}
          />
        </div>
        <div className="full-row">
          <label>备注</label>
          <textarea
            aria-label="备注"
            data-focus-owner
            className="customer-textarea"
            value={form.remark}
            maxLength={1000}
            rows={3}
            onChange={(event) => setField("remark", event.target.value)}
          />
        </div>
      </div>
    </FormDrawer>
  );
}

export default CustomerFormModal;
