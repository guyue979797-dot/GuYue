/**
 * 终端明细表（统一 Arco DataTable）。
 * 例外登记：终端明细页面按产品确认取消左右冻结列，仅固定表头、数据区滚动（重构要求 20.3）。
 */
import React from "../../lib/react.js";
import { Tag } from "../../lib/arco.js";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { TableRowActions } from "../../components/ui/TableRowActions.jsx";
import { TableText } from "../../components/ui/TableText.jsx";
import { PolicyTagList } from "../../components/business/PolicyTagList.jsx";

function PersonTag({ name }) {
  if (!name) return "-";
  return <span className="person-tag person-gray">{name}</span>;
}

export function CustomerTable({
  items,
  total,
  page,
  pageSize,
  loading,
  scrollY,
  isAdmin,
  onDetail,
  onEdit,
  onLogs,
  onDelete,
  onPageChange,
  onPageSizeChange,
}) {
  const columns = [
    {
      title: "终端编码",
      key: "terminal_code",
      width: 130,
      render: (value, customer) => (
        <button
          className="data-link"
          type="button"
          aria-label={`查看 ${customer.customer_name || customer.terminal_code} 详情`}
          onClick={() => onDetail(customer)}
        >
          {customer.terminal_code}
        </button>
      ),
    },
    {
      title: "客户全名",
      key: "customer_name",
      width: 220,
      render: (value, customer) => (
        <TableText value={customer.customer_name} maxWidth={216} />
      ),
    },
    {
      title: "线路归属",
      key: "route",
      width: 150,
      render: (value, customer) => <TableText value={customer.route} maxWidth={150} />,
    },
    {
      title: "业务员",
      key: "salesperson",
      width: 110,
      render: (value, customer) => <PersonTag name={customer.salesperson} />,
    },
    {
      title: "雪花业务员",
      key: "snow_salesperson",
      width: 110,
      render: (value, customer) => <PersonTag name={customer.snow_salesperson} />,
    },
    {
      title: "状态",
      key: "status",
      width: 80,
      render: (value, customer) => (
        <Tag className={`customer-status-tag ${customer.status === "运营" ? "active" : "inactive"}`}>
          {customer.status}
        </Tag>
      ),
    },
    {
      title: "雪花政策",
      key: "policy_tags",
      width: 360,
      render: (value, customer) => (
        <PolicyTagList tags={customer.policy_tag_details || []} limit={4} />
      ),
    },
    {
      title: "备注",
      key: "remark",
      width: 200,
      render: (value, customer) => <TableText value={customer.remark} maxWidth={190} />,
    },
    {
      title: "操作",
      key: "actions",
      width: 110,
      className: "table-actions-cell",
      render: (value, customer) => (
        <TableRowActions
          onDetail={() => onDetail(customer)}
          items={[
            { key: "edit", label: "编辑", onClick: () => onEdit(customer) },
            { key: "logs", label: "修改记录", onClick: () => onLogs(customer) },
            ...(isAdmin
              ? [{ key: "delete", label: "删除", danger: true, onClick: () => onDelete(customer) }]
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
      emptyText="暂无符合条件的客户档案"
      scrollY={scrollY}
      rowClassName={(customer) => (customer.status === "运营" ? "" : "disabled")}
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

export default CustomerTable;
