import React from "../../../lib/react.js";
import { FormDrawer } from "../../../components/ui/FormDrawer.jsx";
import { formatDateTime, formatPolicyAmount, formatPolicyNormalSales } from "../../../utils/formatters.js";
import { SNOW_RULE_FIELDS, SNOW_RULE_OPERATORS } from "./constants.js";

export function PolicyDetailDrawer({ policy, onClose, onEdit }) {
  return <FormDrawer visible={Boolean(policy)} title="政策详情" size="medium"
    onCancel={onClose} onSubmit={onEdit ? () => { onClose(); onEdit(policy); } : undefined} okText="编辑" cancelText="关闭">
    {policy ? (
      <div className="record-detail-grid">
        <div><strong>年月</strong><span>{policy.year}年{policy.month}月</span></div>
        <div><strong>启用状态</strong><span>{policy.enabled ? "已启用" : "已停用"}</span></div>
        <div><strong>标签名</strong><span>{policy.display_name || "-"}</span></div>
        <div><strong>出库编码</strong><span>{policy.outbound_code || "-"}</span></div>
        <div><strong>月目标</strong><span>{policy.month_target ?? "-"}</span></div>
        <div><strong>照片核验</strong><span>{policy.requires_photo ? "需要" : "不需要"}</span></div>
        <div><strong>政策类型</strong><span>{policy.policy_type || '其他'}</span></div>
        <div><strong>正常销售（件）</strong><span>{formatPolicyNormalSales(policy.normal_sales)}</span></div>
        <div><strong>套数限制</strong><span>{policy.set_limit ?? "-"}</span></div>
        <div><strong>核销金额</strong><span>¥ {formatPolicyAmount(policy.reimbursement_amount)}</span></div>
        <div><strong>正常销售产品</strong><span>{(policy.normal_sale_products || []).map((product) => product.short_name || product.product_name).join("、") || "-"}</span></div>
        <div><strong>赠送产品</strong><span>{(policy.gift_products || []).map((product) => product.short_name || product.product_name).join("、") || "-"}</span></div>
        <div><strong>售卖类型</strong><span>{policy.gift_type || "-"}</span></div>
        <div><strong>出库解释</strong><span>{policy.explanation || "-"}</span></div>
        <div><strong>标签ID</strong><span>{policy.id || "-"}</span></div>
        <div><strong>命中条件</strong><span>{(policy.conditions || []).map((condition) => { const field = SNOW_RULE_FIELDS.find((item) => item.value === condition.field); return `${field?.label || condition.field}${SNOW_RULE_OPERATORS[condition.operator]}${condition.value}`; }).join("；") || "-"}</span></div>
        <div><strong>新建人</strong><span>{policy.created_by_name || "-"}</span></div>
        <div><strong>新建时间</strong><span>{formatDateTime(policy.created_at)}</span></div>
      </div>
    ) : null}
  </FormDrawer>;
}
