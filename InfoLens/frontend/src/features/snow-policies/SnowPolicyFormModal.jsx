/**
 * 雪花政策标签新建/编辑表单弹窗。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Message,
  Select,
} from "../../lib/arco.js";
import { FormModal } from "../../components/ui/FormModal.jsx";
import {
  createPolicy,
  getPolicyOptions,
  updatePolicy,
} from "../../api/snowPolicies.js";
import { getProductOptions } from "../../api/products.js";
import {
  POLICY_GIFT_TYPES,
  SNOW_RULE_FIELDS,
  SNOW_RULE_OPERATORS,
  emptyPolicyForm,
  getPolicyMonthOptions,
} from "./constants.js";

const { Option } = Select;
const MONTH_OPTIONS = getPolicyMonthOptions();

export function SnowPolicyFormModal({ visible, policy, onClose, onSaved }) {
  const [form, setForm] = useState(emptyPolicyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [conflictPolicyOptions, setConflictPolicyOptions] = useState([]);
  const [conflictPolicyLoading, setConflictPolicyLoading] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFormError("");
    if (policy) {
      setForm({
        ...policy,
        set_limit: policy.set_limit ?? "",
        month_target: policy.month_target ?? "",
        conflict_policy_ids: policy.conflict_policy_ids || [],
        normal_sale_product_ids: policy.normal_sale_product_ids || [],
        gift_product_ids: policy.gift_product_ids || (
          policy.gift_product_id ? [policy.gift_product_id] : []
        ),
        gift_type: policy.gift_type || "",
        conditions: (policy.conditions || []).map((condition) => ({
          ...condition,
          value: String(condition.value ?? ""),
          auto_code: false,
        })),
      });
    } else {
      setForm(emptyPolicyForm());
    }
  }, [visible, policy]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setConflictPolicyLoading(true);
    const params = {
      year: form.year,
      month: form.month,
      exclude_id: form.id || "",
    };
    getPolicyOptions(params)
      .then((data) => {
        if (active) setConflictPolicyOptions(data.items || []);
      })
      .catch((error) => {
        if (active) Message.error(error.message);
      })
      .finally(() => {
        if (active) setConflictPolicyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, form.id, form.year, form.month]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setProductOptionsLoading(true);
    getProductOptions()
      .then((data) => {
        if (active) setProductOptions(data.items || []);
      })
      .catch((error) => {
        if (active) Message.error(error.message);
      })
      .finally(() => {
        if (active) setProductOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  function updatePolicyForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setFormError("");
  }

  function setOutboundCode(value) {
    setForm((current) => ({
      ...current,
      outbound_code: value,
      conditions: current.conditions.map((condition) =>
        condition.field === "outbound_remark" && condition.auto_code
          ? { ...condition, value }
          : condition
      ),
    }));
    setFormError("");
  }

  function updatePolicyCondition(index, patch) {
    setForm((current) => {
      const conditions = current.conditions.map((condition, position) => {
        if (position !== index) return condition;
        const next = { ...condition, ...patch };
        if (patch.field) {
          const field = SNOW_RULE_FIELDS.find((item) => item.value === patch.field);
          if (!field?.operators.includes(next.operator)) {
            next.operator = field?.operators[0] || "equals";
          }
          if (patch.field === "outbound_remark") {
            next.value = current.outbound_code;
            next.auto_code = true;
          } else {
            next.value = "";
            next.auto_code = false;
          }
        }
        if (Object.prototype.hasOwnProperty.call(patch, "value")) {
          next.auto_code = false;
        }
        return next;
      });
      return { ...current, conditions };
    });
    setFormError("");
  }

  function addPolicyCondition() {
    setForm((current) => {
      if (current.conditions.length >= 3) return current;
      const used = new Set(current.conditions.map((item) => item.field));
      const field = SNOW_RULE_FIELDS.find((item) => !used.has(item.value));
      if (!field) return current;
      return {
        ...current,
        conditions: [
          ...current.conditions,
          {
            field: field.value,
            operator: field.operators[0],
            value: field.value === "outbound_remark" ? current.outbound_code : "",
            auto_code: field.value === "outbound_remark",
          },
        ],
      };
    });
    setFormError("");
  }

  function removePolicyCondition(index) {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.filter((_item, position) => position !== index),
    }));
    setFormError("");
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        set_limit: form.set_limit === "" ? null : form.set_limit,
        month_target: form.month_target === "" ? null : form.month_target,
        conditions: form.conditions.map(({ auto_code, ...condition }) => condition),
      };
      if (form.id) {
        await updatePolicy(form.id, payload);
      } else {
        await createPolicy(payload);
      }
      Message.success(form.id ? "政策标签已更新" : "政策标签已新建");
      setFormError("");
      onClose();
      await onSaved?.();
    } catch (error) {
      setFormError(error.message);
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const formReady =
    form.name.trim() &&
    form.name.trim().length <= 10 &&
    form.outbound_code.trim() &&
    form.explanation.trim() &&
    form.explanation.trim().length <= 50 &&
    form.conditions.length >= 1 &&
    form.conditions.every((condition) => String(condition.value || "").trim()) &&
    form.normal_sale_product_ids.length > 0 &&
    form.gift_product_ids.length > 0 &&
    form.gift_type &&
    new Set(form.conditions.map((condition) => condition.field)).size === form.conditions.length &&
    (form.set_limit === "" || /^\d+$/.test(String(form.set_limit))) &&
    (form.month_target === "" || /^\d+$/.test(String(form.month_target)));

  return (
    <FormModal
      size="large"
      title={form.id ? `编辑标签｜${form.id}` : "新增雪花出库政策标签"}
      visible={visible}
      loading={saving}
      okDisabled={!formReady}
      okText={form.id ? "保存修改" : "新增"}
      onCancel={() => {
        setFormError("");
        onClose();
      }}
      onSubmit={save}
      className="policy-form-modal"
    >
      <div className="policy-form-grid">
        <div>
          <label><i>*</i>政策月份</label>
          <Select
            value={`${form.year}-${String(form.month).padStart(2, "0")}`}
            onChange={(value) => {
              const [year, month] = value.split("-");
              updatePolicyForm({
                year: Number(year),
                month: Number(month),
                conflict_policy_ids: [],
              });
            }}
          >
            {MONTH_OPTIONS.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <label>月目标</label>
          <Input
            value={String(form.month_target)}
            placeholder="选填，非负整数"
            onChange={(value) => updatePolicyForm({ month_target: value.replace(/\D/g, "") })}
          />
        </div>
        <div>
          <label className="policy-name-label">
            <span><i>*</i>标签名字</span>
            <small>展示为：{form.month}月-{form.name || "标签名字"}</small>
          </label>
          <Input
            value={form.name}
            maxLength={10}
            showWordLimit
            placeholder="不超过10个字"
            onChange={(value) => updatePolicyForm({ name: value })}
          />
        </div>
        <div>
          <label><i>*</i>出库编码</label>
          <Input
            value={form.outbound_code}
            maxLength={100}
            onChange={setOutboundCode}
          />
        </div>
        <div className="full-row">
          <label><i>*</i>出库解释</label>
          <Input
            value={form.explanation}
            maxLength={50}
            showWordLimit
            onChange={(value) => updatePolicyForm({ explanation: value })}
          />
        </div>
        <div>
          <label>是否拍照</label>
          <Checkbox
            checked={form.requires_photo}
            onChange={(checked) => updatePolicyForm({ requires_photo: checked })}
          >
            需要拍照
          </Checkbox>
        </div>
        <div>
          <label>套数限制</label>
          <Input
            value={String(form.set_limit)}
            placeholder="选填，非负整数"
            onChange={(value) => updatePolicyForm({ set_limit: value.replace(/\D/g, "") })}
          />
        </div>
        <div className="full-row policy-product-field">
          <label><i>*</i>正常销售产品</label>
          <Select
            mode="multiple"
            value={form.normal_sale_product_ids || []}
            loading={productOptionsLoading}
            allowClear
            showSearch
            placeholder="请选择一个或多个状态为正常的产品"
            onChange={(value) => updatePolicyForm({ normal_sale_product_ids: value || [] })}
            filterOption={(inputValue, option) =>
              String(option.props.children || "").toLowerCase()
                .includes(String(inputValue || "").toLowerCase())
            }
          >
            {productOptions.map((product) => (
              <Option key={product.id} value={product.id}>
                {product.short_name || product.product_name}
              </Option>
            ))}
          </Select>
        </div>
        <div className="full-row policy-gift-condition-group">
          <div>
            <label><i>*</i>赠送产品</label>
            <Select
              mode="multiple"
              value={form.gift_product_ids || []}
              loading={productOptionsLoading}
              allowClear
              showSearch
              placeholder="请选择一个或多个状态为正常的赠送产品"
              onChange={(value) => updatePolicyForm({ gift_product_ids: value || [] })}
              filterOption={(inputValue, option) =>
                String(option.props.children || "").toLowerCase()
                  .includes(String(inputValue || "").toLowerCase())
              }
            >
              {productOptions.map((product) => (
                <Option key={product.id} value={product.id}>
                  {product.short_name || product.product_name}
                </Option>
              ))}
            </Select>
          </div>
          <div>
            <label><i>*</i>售卖类型</label>
            <Select
              value={form.gift_type || undefined}
              placeholder="请选择售卖类型"
              onChange={(value) => updatePolicyForm({ gift_type: value || "" })}
            >
              {POLICY_GIFT_TYPES.map((type) => (
                <Option key={type} value={type}>{type}</Option>
              ))}
            </Select>
          </div>
          <small className="policy-product-group-help">
            产品与售卖类型不参与标签命中，仅用于命中后的出库合规告警。
          </small>
        </div>
        <div className="full-row">
          <label>冲突政策</label>
          <Select
            className="policy-conflict-select"
            mode="multiple"
            value={form.conflict_policy_ids || []}
            loading={conflictPolicyLoading}
            allowClear
            placeholder="选填；命中任一所选政策即触发冲突告警"
            onChange={(value) => updatePolicyForm({ conflict_policy_ids: value || [] })}
            renderFormat={(_option, value) => {
              const policyOption = conflictPolicyOptions.find((item) => item.id === value);
              return policyOption ? (
                <span className="policy-conflict-selection">
                  <i className="policy-color-dot" />
                  <span>{policyOption.display_name}</span>
                </span>
              ) : value;
            }}
          >
            {conflictPolicyOptions.map((policyOption) => (
              <Option key={policyOption.id} value={policyOption.id}>
                <span className="policy-conflict-option">
                  <span className="tag-neutral">
                    {policyOption.display_name}
                  </span>
                  <span className={policyOption.enabled ? "policy-option-status enabled" : "policy-option-status disabled"}>
                    {policyOption.enabled ? "启用" : "停用"}
                  </span>
                </span>
              </Option>
            ))}
          </Select>
          <small className="policy-conflict-help">
            可多选同月政策；当前终端同时命中其中任意一项时触发告警。
          </small>
        </div>
      </div>

      <div className="policy-condition-editor">
        <div className="policy-condition-title">
          <div><strong>命中条件</strong><span>同一字段只能定义一次，组合条件全部成立才命中</span></div>
          <Button
            className="policy-add-condition"
            size="small"
            disabled={form.conditions.length >= 3}
            onClick={addPolicyCondition}
          >
            添加条件
          </Button>
        </div>
        {form.conditions.map((condition, index) => {
          const usedFields = new Set(form.conditions.map((item) => item.field));
          const field = SNOW_RULE_FIELDS.find((item) => item.value === condition.field);
          return (
            <div className="policy-condition-row" key={`${condition.field}-${index}`}>
              <span>{index ? "并且" : "当"}</span>
              <Select
                value={condition.field}
                onChange={(value) => updatePolicyCondition(index, { field: value })}
              >
                {SNOW_RULE_FIELDS
                  .filter((option) => option.value === condition.field || !usedFields.has(option.value))
                  .map((option) => <Option key={option.value} value={option.value}>{option.label}</Option>)}
              </Select>
              <Select
                value={condition.operator}
                onChange={(value) => updatePolicyCondition(index, { operator: value })}
              >
                {(field?.operators || []).map((operator) => (
                  <Option key={operator} value={operator}>{SNOW_RULE_OPERATORS[operator]}</Option>
                ))}
              </Select>
              <Input
                value={String(condition.value ?? "")}
                placeholder={condition.field === "converted_boxes" ? "输入数值" : "输入匹配内容"}
                onChange={(value) => updatePolicyCondition(index, { value })}
              />
              <button
                className="policy-remove-condition"
                type="button"
                title="移除条件"
                aria-label="移除条件"
                disabled={form.conditions.length <= 1}
                onClick={() => removePolicyCondition(index)}
              >×</button>
            </div>
          );
        })}
      </div>
      <div className="policy-alert-notices">
        {(form.conflict_policy_ids || []).length ? (
          <Alert type="warning" showIcon content="已开启雪花政策冲突告警" />
        ) : null}
        {form.set_limit !== "" ? (
          <Alert type="warning" showIcon content="已开启政策重复出库告警" />
        ) : null}
        {(form.normal_sale_product_ids || []).length ? (
          <Alert type="warning" showIcon content="已开启正常销售产品错误告警" />
        ) : null}
        {(form.gift_product_ids || []).length ? (
          <Alert type="warning" showIcon content="已开启赠送产品错误告警" />
        ) : null}
        {form.gift_type ? (
          <Alert type="warning" showIcon content="已开启售卖类型错误告警" />
        ) : null}
      </div>
      {formError ? (
        <Alert
          className="policy-form-error"
          type="error"
          showIcon
          content={`${form.id ? "保存" : "新增"}失败：${formError}`}
        />
      ) : null}
    </FormModal>
  );
}

export default SnowPolicyFormModal;
