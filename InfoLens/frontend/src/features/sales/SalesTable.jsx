import React, { useMemo, useState } from "../../lib/react.js";
import { Tag, Tooltip } from "../../lib/arco.js";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { TableRowActions } from "../../components/ui/TableRowActions.jsx";
import { TableText } from "../../components/ui/TableText.jsx";
import { SALES_COLUMNS, salesCellValue } from "./columns.js";
import { SalesDetail } from "./SalesDetail.jsx";

const sortFields = { 单件利润: 'unit_profit', 利润率: 'profit_rate', 折后单价: 'unit_price', 真实单价: 'real_price', 分类: 'category',
  单据日期: 'date', 经办人全名: 'salesperson', 客户备用2: 'terminal_code' };

const sortField = column => column.calculation === 'profit' ? 'profit' : sortFields[column.source];

export function SalesTable({ sales, scrollY }) {
  const [detail, setDetail] = useState(null);
  const columns = useMemo(() => [
    ...SALES_COLUMNS.map((column) => ({
      title: column.title,
      // Arco 的排序回调使用列 key，必须与后端白名单字段一致。
      key: sortField(column) || column.source || column.calculation || 'calculated-box-total',

      dataIndex: sortField(column) || column.source,
      sorter: Boolean(sortField(column)),
      sortOrder: sortField(column) && sales.query.sort_by === sortField(column)
        ? (sales.query.sort_order === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (_, record) => {
        if (column.source === '成本来源') {
          const policies = record.cost_sources || [];
          return policies.length ? <div className="sales-policy-sources">
            {policies.map((policy) => <Tooltip key={policy.id} content={<div><strong>{policy.label}</strong><div>{policy.remarks || '暂无政策备注'}</div></div>}
              getPopupContainer={() => document.body}>
              <Tag tabIndex={0}><span className="sales-policy-source-name">{policy.label}</span></Tag>
            </Tooltip>)}
          </div> : null;
        }
        const raw = salesCellValue(record.values, column);
        if (['折后单价', '真实单价'].includes(column.source) && raw != null && raw !== '') {
          return <Tooltip trigger={['hover', 'focus']} content={String(raw)} getPopupContainer={() => document.body}>
            <span tabIndex={0} aria-label={String(raw)}>{Number(raw).toFixed(2)}</span>
          </Tooltip>;
        }
        const value = raw == null ? raw : column.source === '利润率'
          ? `${(Number(raw) * 100).toFixed(2)}%` : (column.calculation === 'profit' || ['单件利润', '利润参考成本价'].includes(column.source)) ? Number(raw).toFixed(2) : raw;
        if (column.source === '分类' && value) return <Tag color={value === '无法分类' ? 'orange' : undefined}>{value}</Tag>;
        return <TableText value={value} />;
      },
    })),
    { title: '操作', key: 'detail', render: (_, record) => (
      <TableRowActions onDetail={() => setDetail(record)} />
    ) },
  ], [sales.query.sort_by, sales.query.sort_order]);
  return <>
    <DataTable pageSizeOptions={[20, 50, 100, 500, 1000]} rowSelection={{ type: 'checkbox', selectedRowKeys: sales.selectedKeys,
      onChange: sales.setSelectedKeys, checkAll: true, fixed: false,
      checkboxProps: () => ({ disabled: sales.loading || sales.uploading || sales.deleting || sales.updatingCost }),
    }} onChange={(_, sorter, __, extra) => { if (extra?.action === 'sort') sales.changeSort(sorter); }} columns={columns} data={sales.data.items} loading={sales.loading || sales.uploading || sales.deleting || sales.updatingCost}
      scrollY={scrollY} emptyText={sales.data.filename ? "未找到符合筛选条件的明细" : "请上传销售明细表"}
      pagination={{ page: sales.query.page, pageSize: sales.query.page_size, total: sales.data.total,
        onChange: sales.changePage, onPageSizeChange: sales.changePageSize }} />
    <SalesDetail record={detail} fields={sales.data.columns} onClose={() => setDetail(null)} />
  </>;
}
