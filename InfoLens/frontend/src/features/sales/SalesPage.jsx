import React, { useRef, useState } from "../../lib/react.js";
import { Button, Modal, Space, DatePicker } from "../../lib/arco.js";
import { FilterBar } from "../../components/ui/FilterBar.jsx";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { useContainerHeight } from "../../hooks/useContainerHeight.js";
import { useSales } from "./useSales.js";
import { FormDrawer } from "../../components/ui/FormDrawer.jsx";
import { TableText } from "../../components/ui/TableText.jsx";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { SalesTable } from "./SalesTable.jsx";
import "./sales.css";

function filterFields(options = {}) {
  const select = (name, label) => ({ name, label, type: "select", placeholder: label,
    showSearch: true, options: options[name] || [], width: 180 });
  return [
    select("document_type", "单据类型"),
    { name: "dates", label: "单据日期", type: "date-range", width: 300 },
    select("month", "年月"), select("salesperson", "经办人"),
    select("customer_type", "客户类型"), select("product", "存货全名"),
    { name: "category_mode", label: "分类条件", type: "select", allowClear: false,
      group: "sales-category-filter", width: 120,
      options: [{ value: "include", label: "包含" }, { value: "exclude", label: "不包含" }] },
    { ...select("category", "分类"), type: "multi-select", group: "sales-category-filter", maxTagCount: "responsive" },
    { name: "document", type: "input", label: "单据查找", placeholder: "单据编号", width: 220 },
    { name: "terminal_code", type: "input", label: "终端编码", placeholder: "终端编码", width: 180 },
    { name: "customer", type: "input", label: "客户全名", placeholder: "客户全名（模糊匹配）", width: 240 },
  ];
}

export function SalesPage() {
  const sales = useSales();
  const fields = filterFields(sales.data.options);
  const layoutFields = [
    ...fields.slice(0, 5),
    ...[...fields.slice(8), ...fields.slice(5, 8)].map((field) => ({
      ...field, row: 1,
      ...(field.name === 'product' ? { weight: 360 } : {}),
      ...(field.group === 'sales-category-filter' ? { groupWeight: 480 } : {}),
      ...(['terminal_code', 'customer'].includes(field.name) ? { group: 'sales-terminal-filter', groupWeight: 420 } : {}),
    })),
  ];
  const input = useRef(null);
  const [syncVisible, setSyncVisible] = useState(false);
  const [costVisible, setCostVisible] = useState(false);
  const [costMonth, setCostMonth] = useState('');
  const [shell, height] = useContainerHeight(64);
  function confirmDelete() {
    const ids = [...sales.selectedKeys];
    if (!ids.length) return;
    Modal.confirm({
      title: "确认删除销售明细",
      content: `将从数据库永久删除选中的 ${ids.length} 条明细，并重新计算剩余数据。此操作不可撤销，是否继续？`,
      okText: "确认删除", cancelText: "取消", okButtonProps: { status: "danger" },
      onOk: () => sales.removeSelected(ids),
    });
  }
  return <div className="sales-page">
    <section className="table-page-filter-card" aria-label="销售数据筛选区">
      <FilterBar fields={layoutFields} values={sales.draft} onChange={sales.setDraft}
        onSearch={sales.search} onReset={sales.reset} loading={sales.loading || sales.uploading} />
    </section>
    <section className="table-page-list-card" aria-label="销售单据明细">
      <div className="table-page-toolbar">
        <div className="table-page-toolbar-title"><strong>单据明细</strong><span>共 {sales.data.total} 条</span></div>
        <Space>
          <Button disabled={sales.uploading || sales.deleting || sales.updatingCost} onClick={() => {
            setCostMonth(sales.query.month || sales.data.options?.month?.[0] || '');
            setCostVisible(true);
          }}>更新商品成本</Button>
          {sales.productSync ? <Button onClick={() => setSyncVisible(true)}>商品同步结果</Button> : null}
          <span>已选 {sales.selectedKeys.length} 条</span>
          <Button status="danger" loading={sales.deleting}
            disabled={!sales.selectedKeys.length || sales.loading || sales.uploading || sales.deleting || sales.updatingCost}
            onClick={confirmDelete}>删除</Button>
        <Button type="primary" loading={sales.uploading} disabled={sales.uploading || sales.deleting || sales.updatingCost} onClick={() => input.current?.click()}>上传销售表</Button>
        </Space>
        <input ref={input} type="file" accept=".xlsx" hidden aria-label="选择销售明细表" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          sales.upload(file);
        }} />
      </div>
      <div className="sales-feedback">
      <StatusAlert status={sales.status} className="table-page-status" /></div>
      <div className="table-page-shell" ref={shell}><SalesTable sales={sales} scrollY={height} /></div>
    </section>
    <FormDrawer visible={costVisible} title="更新商品成本" size="small" okText="开始计算"
      loading={sales.updatingCost} okDisabled={!costMonth || sales.updatingCost}
      onCancel={() => { if (!sales.updatingCost) setCostVisible(false); }}
      onSubmit={async () => { try { await sales.updateCost(costMonth); setCostVisible(false); } catch {} }}>
      <label htmlFor="sales-cost-month">选择月份</label>
      <DatePicker.MonthPicker id="sales-cost-month" aria-label="成本重算月份" value={costMonth || undefined}
        onChange={setCostMonth} disabled={sales.updatingCost} getPopupContainer={() => document.body} />
      <p>按所选月份重新分配政策成本，额度不足部分使用商品成本；已手动结束的政策保留原有分配。</p>
    </FormDrawer>
    <FormDrawer visible={syncVisible} title="商品同步结果" footer={null} onCancel={() => setSyncVisible(false)} size="large">
      <DataTable rowKey="product_id" scrollY={360} data={sales.productSync?.details || []} columns={[
        { title: '商品名称', key: 'product_name', render: (_, item) => <TableText value={item.product_name} /> },
        { title: '结果', dataIndex: 'result', width: 100 },
        { title: '更新内容或跳过原因', key: 'reason', width: 360,
          render: (_, item) => <TableText value={item.reason || `${item.short_name} / ${item.stock_code} / 存货规格 ${item.specification}`} /> },
      ]} />
    </FormDrawer>
  </div>;
}
