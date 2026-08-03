/**
 * 雪花政策明细表（统一 Arco DataTable）。
 */
import React from "../../lib/react.js";
import { Switch, Tooltip } from "../../lib/arco.js";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { TableRowActions } from "../../components/ui/TableRowActions.jsx";
import { PolicyProgressCell } from "../../components/business/PolicyProgressCell.jsx";
import {
  formatPolicyAmount,
  formatPolicyQuantity,
} from "../../utils/formatters.js";

function SortableHeader({ title, active, order, onClick, ariaLabel }) {
  return (
    <button
      className={active ? "policy-sort-button active" : "policy-sort-button"}
      type="button"
      title={`点击切换${title}排序`}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span>{title}</span>
      <span className="policy-sort-arrows" aria-hidden="true">
        <i className={active && order === "asc" ? "selected" : ""}>▲</i>
        <i className={active && order === "desc" ? "selected" : ""}>▼</i>
      </span>
    </button>
  );
}

export function SnowPolicyTable({
  items,
  total,
  page,
  pageSize,
  loading,
  scrollY,
  isAdmin,
  sortConfig,
  exportingPolicyId,
  onDetail,
  onEdit,
  onExport,
  onDelete,
  onToggle,
  onToggleSort,
  onShippedClick,
  onPhotographedClick,
  onPendingClick,
  onAlertClick,
  onReversedClick,
  onPageChange,
  onPageSizeChange,
}) {
  const columns = [
    {
      title: "年月",
      key: "year_month",
      // 含单元格内边距后仍需容纳“2026年7月”，避免被拆成两行。
      width: 120,
      render: (value, policy) => `${policy.year}年${policy.month}月`,
    },
    {
      title: "启用",
      key: "enabled",
      width: 80,
      render: (value, policy) => (
        <Tooltip
          content={
            policy.required_fields_complete
              ? policy.enabled ? "点击停用" : "点击启用"
              : "请先编辑并补全所有必填项"
          }
          getPopupContainer={() => document.body}
        >
          <span className="policy-enable-switch">
            <Switch
              size="small"
              checked={policy.enabled}
              disabled={!policy.required_fields_complete}
              checkedText="启用"
              uncheckedText="停用"
              onChange={() => onToggle(policy)}
            />
          </span>
        </Tooltip>
      ),
    },
    {
      title: "标签名",
      key: "display_name",
      width: 150,
      render: (value, policy) => (
        <span className="policy-name-tag">{policy.display_name}</span>
      ),
    },
    {
      title: "出库编码",
      key: "outbound_code",
      width: 160,
      render: (value, policy) => (
        <code className="policy-outbound-code">{policy.outbound_code || "-"}</code>
      ),
    },
    {
      title: "月目标",
      key: "month_target",
      width: 80,
      render: (value, policy) => policy.month_target ?? "-",
    },
    {
      title: (
        <SortableHeader
          title="出库进度"
          active={sortConfig.field === "shipped_count"}
          order={sortConfig.order}
          onClick={() => onToggleSort("shipped_count")}
          ariaLabel="切换已出库排序"
        />
      ),
      key: "progress",
      // 五类状态并列展示时的最小可读宽度，禁止挤入“套数限制”列。
      width: 400,
      className: "policy-progress-cell",
      render: (value, policy) => (
        <PolicyProgressCell
          displayName={policy.display_name}
          shipped={Number(policy.shipped_count || 0)}
          requiresPhoto={policy.requires_photo}
          photographed={Number(policy.photographed_count || 0)}
          pending={Number(policy.pending_outbound_count || 0)}
          alertCount={Number(policy.alert_count || 0)}
          reversed={Number(policy.reversed_count || 0)}
          onShippedClick={() => onShippedClick(policy)}
          onPhotographedClick={() => onPhotographedClick(policy)}
          onPendingClick={() => onPendingClick(policy)}
          onAlertClick={() => onAlertClick(policy)}
          onReversedClick={() => onReversedClick(policy)}
        />
      ),
    },
    {
      title: "套数限制",
      key: "set_limit",
      width: 90,
      render: (value, policy) => (
        <span className="policy-metric-number">{policy.set_limit ?? "-"}</span>
      ),
    },
    {
      title: "照片核验",
      key: "requires_photo",
      width: 90,
      render: (value, policy) => (
        <span
          className={`policy-photo-check ${policy.requires_photo ? "is-checked" : ""}`.trim()}
          role="checkbox"
          aria-checked={Boolean(policy.requires_photo)}
          aria-readonly="true"
          aria-label={`${policy.display_name} 照片核验${policy.requires_photo ? "已开启" : "未开启"}`}
        >
          {policy.requires_photo ? <span aria-hidden="true">✓</span> : null}
        </span>
      ),
    },
    {
      title: "核销（箱）",
      key: "reimbursement_quantity",
      width: 110,
      render: (value, policy) => (
        <span className="policy-metric-number">
          {formatPolicyQuantity(policy.reimbursement_quantity)}
        </span>
      ),
    },
    {
      title: (
        <SortableHeader
          title="核销金额"
          active={sortConfig.field === "reimbursement_amount"}
          order={sortConfig.order}
          onClick={() => onToggleSort("reimbursement_amount")}
          ariaLabel="切换核销金额排序"
        />
      ),
      key: "reimbursement_amount",
      width: 130,
      render: (value, policy) => (
        <span className="policy-reimbursement-amount">
          {formatPolicyAmount(policy.reimbursement_amount)}
        </span>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 110,
      className: "table-actions-cell",
      render: (value, policy) => (
        <TableRowActions
          onDetail={() => onDetail(policy)}
          items={[
            { key: "edit", label: "编辑", onClick: () => onEdit(policy) },
            {
              key: "export",
              label: exportingPolicyId === policy.id ? "导出中" : "导出",
              disabled: Boolean(exportingPolicyId),
              onClick: () => onExport(policy),
            },
            ...(isAdmin
              ? [{ key: "delete", label: "删除", danger: true, onClick: () => onDelete(policy) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable
      rowKey="id"
      columns={columns}
      data={items}
      loading={loading}
      emptyText="暂无政策标签"
      scrollY={scrollY}
      rowClassName={(policy) => (policy.enabled ? "" : "disabled")}
      pagination={{
        page,
        pageSize,
        total,
        onChange: onPageChange,
        onPageSizeChange: onPageSizeChange,
      }}
    />
  );
}

export default SnowPolicyTable;
