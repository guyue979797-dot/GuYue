/**
 * 产品明细表（统一 Arco DataTable）。
 */
import React from "../../lib/react.js";
import { Tag } from "../../lib/arco.js";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { TableRowActions } from "../../components/ui/TableRowActions.jsx";
import { TableText } from "../../components/ui/TableText.jsx";
import { formatCompactDateTime } from "../../utils/formatters.js";

function ProductCodeTags({ values }) {
  const items = values || [];
  if (!items.length) return <span className="product-empty-value">-</span>;
  return (
    <span
      className="product-code-tags"
      title={items.join("、")}
      aria-label={items.join("、")}
    >
      {items.map((value) => (
        <span className="product-code-tag" key={value}>{value}</span>
      ))}
    </span>
  );
}

function SortableInventoryHeader({ sort, onClick }) {
  return (
    <button
      className={sort ? "product-sort-button active" : "product-sort-button"}
      type="button"
      title="点击切换雪花库存排序"
      aria-label={`雪花库存排序：${sort === "asc" ? "升序" : sort === "desc" ? "降序" : "默认"}`}
      onClick={onClick}
    >
      <span>雪花库存（箱）</span>
      <span className="product-sort-arrows" aria-hidden="true">
        <i className={sort === "asc" ? "selected" : ""}>▲</i>
        <i className={sort === "desc" ? "selected" : ""}>▼</i>
      </span>
    </button>
  );
}

export function ProductTable({
  items,
  total,
  page,
  pageSize,
  loading,
  scrollY,
  inventorySort,
  onDetail,
  onEdit,
  onDelete,
  onToggleInventorySort,
  onPageChange,
  onPageSizeChange,
}) {
  const columns = [
    {
      title: "商品简称",
      key: "short_name",
      width: 130,
      render: (value, product) =>
        product.short_name ? (
          <span className="product-short-tag tag-neutral">{product.short_name}</span>
        ) : (
          <span className="product-empty-value">待补充</span>
        ),
    },
    {
      title: "商品名称",
      key: "product_name",
      width: 320,
      render: (value, product) => (
        <TableText value={product.product_name} maxWidth={320} />
      ),
    },
    {
      title: <SortableInventoryHeader sort={inventorySort} onClick={onToggleInventorySort} />,
      key: "snow_inventory",
      width: 150,
      render: (value, product) => (
        <button
          className="data-link product-inventory-link"
          type="button"
          onClick={() => onDetail(product)}
          aria-label={`查看 ${product.short_name || product.product_name} 库存明细`}
        >
          {Number(product.snow_inventory).toLocaleString("zh-CN", { maximumFractionDigits: 6 })}
        </button>
      ),
    },
    {
      title: "结算价",
      key: "settlement_price",
      width: 110,
      render: (value, product) =>
        product.settlement_price === null
          ? "-"
          : <span className="product-number">¥{Number(product.settlement_price).toFixed(2)}</span>,
    },
    {
      title: "商品编码",
      key: "product_codes",
      width: 220,
      render: (value, product) => <ProductCodeTags values={product.product_codes} />,
    },
    {
      title: "管家婆编码",
      key: "housekeeper_codes",
      width: 220,
      render: (value, product) => <ProductCodeTags values={product.housekeeper_codes} />,
    },
    {
      title: "规格",
      key: "specification",
      width: 120,
      render: (value, product) =>
        product.specification !== null && product.auxiliary_unit
          ? `1箱 = ${product.specification}${product.auxiliary_unit}`
          : <span className="product-empty-value">待补充</span>,
    },
    {
      title: "档案状态",
      key: "status",
      width: 100,
      render: (value, product) => (
        <Tag color={product.status === "正常" ? "green" : "gold"}>
          {product.status}
        </Tag>
      ),
    },
    {
      title: "最后修改",
      key: "updated_at",
      width: 170,
      render: (value, product) => (
        <span className="updated-cell" title={formatCompactDateTime(product.updated_at)}>
          <span className="updated-time">{formatCompactDateTime(product.updated_at)}</span>
          <span className="updated-user">{product.updated_by_name || "-"}</span>
        </span>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 110,
      className: "table-actions-cell",
      render: (value, product) => (
        <TableRowActions
          onDetail={() => onDetail(product)}
          items={[
            { key: "edit", label: "编辑", onClick: () => onEdit(product) },
            { key: "delete", label: "删除", danger: true, onClick: () => onDelete(product) },
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
      emptyText="暂无符合条件的产品档案"
      scrollY={scrollY}
      rowClassName={(product) => (product.status === "正常" ? "" : "disabled")}
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

export default ProductTable;
