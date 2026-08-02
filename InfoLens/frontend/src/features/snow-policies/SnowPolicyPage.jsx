/**
 * 雪花出库政策页面入口。
 */
import React, { useState } from "../../lib/react.js";
import { Button, Message, Modal, Space } from "../../lib/arco.js";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { TerminalListModal } from "../../components/business/TerminalListModal.jsx";
import { SnowOutboundUploadModal } from "../../components/business/SnowOutboundUploadModal.jsx";
import { useContainerHeight } from "../../hooks/useContainerHeight.js";
import { getDateParts } from "../../utils/formatters.js";
import {
  deletePolicy,
  exportPolicyArchive,
  getPolicyTerminals,
  togglePolicyStatus,
} from "../../api/snowPolicies.js";
import { useSnowPolicies } from "./useSnowPolicies.js";
import { SnowPolicyFilters } from "./SnowPolicyFilters.jsx";
import { SnowPolicyTable } from "./SnowPolicyTable.jsx";
import { SnowPolicyFormModal } from "./SnowPolicyFormModal.jsx";
import { SnowPolicyAlertsModal } from "./SnowPolicyAlertsModal.jsx";
import { showPolicyDetail } from "./SnowPolicyDetail.jsx";
import { TERMINAL_LIST_META } from "./constants.js";

export function SnowPolicyPage({ isAdmin }) {
  const policies = useSnowPolicies();
  const [tableShellRef, tableHeight] = useContainerHeight(64);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [exportingPolicyId, setExportingPolicyId] = useState("");
  const [terminalListOpen, setTerminalListOpen] = useState(false);
  const [terminalListPolicy, setTerminalListPolicy] = useState(null);
  const [terminalListKind, setTerminalListKind] = useState("pending");
  const [terminalListItems, setTerminalListItems] = useState([]);
  const [terminalListLoading, setTerminalListLoading] = useState(false);
  const [alertListOpen, setAlertListOpen] = useState(false);
  const [alertListPolicy, setAlertListPolicy] = useState(null);

  const latestUploadDate = getDateParts(policies.latestUploadAt);

  const filterValues = {
    ...policies.filters,
    yearMonth:
      policies.filters.year && policies.filters.month
        ? `${policies.filters.year}-${String(policies.filters.month).padStart(2, "0")}`
        : "",
  };

  function handleYearMonthChange(value) {
    if (!value) {
      policies.setFilterField("year", "");
      policies.setFilterField("month", "");
      return;
    }
    const [year, month] = value.split("-");
    policies.setFilterField("year", year);
    policies.setFilterField("month", String(Number(month)));
  }

  function openCreate() {
    setEditingPolicy(null);
    setFormOpen(true);
  }

  function openEdit(policy) {
    setEditingPolicy(policy);
    setFormOpen(true);
  }

  async function exportPolicy(policy) {
    if (exportingPolicyId) return;
    setExportingPolicyId(policy.id);
    try {
      await exportPolicyArchive(policy.id);
      Message.success(`“${policy.display_name}”核销明细已导出`);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setExportingPolicyId("");
    }
  }

  async function togglePolicy(policy) {
    try {
      await togglePolicyStatus(policy.id, !policy.enabled);
      Message.success(policy.enabled ? "政策标签已停用" : "政策标签已启用");
      await policies.loadPolicies();
    } catch (error) {
      Message.error(error.message);
    }
  }

  async function openPolicyTerminals(policy, kind) {
    const meta = TERMINAL_LIST_META[kind];
    if (!meta || !policy[meta.countField]) return;
    setTerminalListKind(kind);
    setTerminalListPolicy(policy);
    setTerminalListItems([]);
    setTerminalListOpen(true);
    setTerminalListLoading(true);
    try {
      const result = await getPolicyTerminals(policy.id, meta.endpoint);
      setTerminalListItems(result.items || []);
    } catch (error) {
      Message.error(error.message);
      setTerminalListOpen(false);
    } finally {
      setTerminalListLoading(false);
    }
  }

  async function openPolicyAlerts(policy) {
    if (!policy.alert_count) return;
    setAlertListPolicy(policy);
    setAlertListOpen(true);
  }

  function removePolicy(policy) {
    Modal.confirm({
      title: "删除政策标签",
      content: `确定删除“${policy.display_name}”吗？已有终端历史标签将保留。`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          await deletePolicy(policy.id);
          Message.success("政策标签已删除");
          if (policies.items.length === 1 && policies.page > 1) {
            policies.changePage(policies.page - 1);
          } else {
            await policies.loadPolicies();
          }
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  const terminalMeta = TERMINAL_LIST_META[terminalListKind];

  return (
    <div className="policy-page">
      <div className="policy-filter-card table-page-filter-card">
        <SnowPolicyFilters
          values={filterValues}
          onDraftChange={policies.setFilterField}
          onYearMonthChange={handleYearMonthChange}
          onSearch={policies.applyFilters}
          onReset={policies.resetFilters}
          loading={policies.loading}
        />
      </div>

      <div className="policy-list-card table-page-list-card">
        <div className="policy-toolbar table-page-toolbar">
          <div className="table-page-toolbar-title">
            <strong>雪花政策明细</strong>
            <span>共 {policies.total} 条</span>
          </div>
          <div className="policy-latest-upload toolbar-center">
            <span>雪花出库最新更新时间</span>
            {latestUploadDate ? (
              <strong className="policy-date-display" aria-label={`${latestUploadDate.year}年${latestUploadDate.month}月${latestUploadDate.day}日`}>
                <span className="policy-date-tag">{latestUploadDate.year}</span><em>年</em>
                <span className="policy-date-tag">{latestUploadDate.month}</span><em>月</em>
                <span className="policy-date-tag">{latestUploadDate.day}</span><em>日</em>
              </strong>
            ) : (
              <strong className="policy-date-empty">暂无上传记录</strong>
            )}
          </div>
          <div className="policy-toolbar-actions">
            <Button className="snow-upload-button" onClick={() => setUploadOpen(true)}>雪花出库上传</Button>
            <Button className="policy-add-button" type="primary" onClick={openCreate}>新增政策标签</Button>
          </div>
        </div>
        <StatusAlert status={policies.status} className="table-page-status" />
        <div className="table-page-shell" ref={tableShellRef}>
          <SnowPolicyTable
            items={policies.items}
            total={policies.total}
            page={policies.page}
            pageSize={policies.pageSize}
            loading={policies.loading}
            scrollY={tableHeight}
            isAdmin={isAdmin}
            sortConfig={policies.sortConfig}
            exportingPolicyId={exportingPolicyId}
            onDetail={showPolicyDetail}
            onEdit={openEdit}
            onExport={exportPolicy}
            onDelete={removePolicy}
            onToggle={togglePolicy}
            onToggleSort={policies.toggleSort}
            onShippedClick={(policy) => openPolicyTerminals(policy, "shipped")}
            onPhotographedClick={(policy) => openPolicyTerminals(policy, "photographed")}
            onPendingClick={(policy) => openPolicyTerminals(policy, "pending")}
            onAlertClick={openPolicyAlerts}
            onReversedClick={(policy) => openPolicyTerminals(policy, "reversed")}
            onPageChange={policies.changePage}
            onPageSizeChange={policies.changePageSize}
          />
        </div>
      </div>

      <SnowPolicyFormModal
        visible={formOpen}
        policy={editingPolicy}
        onClose={() => setFormOpen(false)}
        onSaved={policies.loadPolicies}
      />

      <SnowOutboundUploadModal
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImported={async () => {
          policies.changePage(1);
          await policies.loadPolicies();
        }}
      />

      <TerminalListModal
        visible={terminalListOpen}
        title={`${terminalMeta.title} · ${terminalListPolicy?.display_name || ""}`}
        terminals={terminalListItems}
        loading={terminalListLoading}
        summaryLabel={terminalMeta.summaryLabel}
        emptyText={terminalMeta.emptyText}
        showReversalDetails={terminalListKind === "reversed"}
        onClose={() => setTerminalListOpen(false)}
      />

      <SnowPolicyAlertsModal
        visible={alertListOpen}
        policy={alertListPolicy}
        onClose={() => setAlertListOpen(false)}
      />
    </div>
  );
}

export default SnowPolicyPage;
