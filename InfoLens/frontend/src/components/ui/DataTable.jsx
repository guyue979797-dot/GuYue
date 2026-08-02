/**
 * 统一数据表格容器（重构要求 5.2 / 16.1）。
 * - 内部组合 Arco Table + Pagination
 * - 单一纵向滚动容器，Mac overscroll 边界控制
 * - 加载、空状态、分页统一承载
 * - 列宽校验：除最多一个弹性列外必须显式配置 width
 */
import React, { useMemo } from "../../lib/react.js";
import { Empty, Pagination, Select, Table } from "../../lib/arco.js";

const { Option } = Select;

function validateColumns(columns) {
  if (!columns?.length) return;
  const elastic = columns.filter((column) => !column.width && column.fixed !== "right");
  if (elastic.length > 1) {
    console.warn(
      "[DataTable] 除最多一个弹性列外，其余列必须显式配置 width（重构要求 5.2）",
    );
  }
}

export function DataTable({
  rowKey = "id",
  columns = [],
  data = [],
  loading = false,
  emptyText = "暂无数据",
  scrollX = "max-content",
  scrollY,
  pagination,
  onRow,
  rowClassName,
  size = "default",
  border = true,
  className = "",
  pageSizeOptions = [20, 50, 100],
}) {
  const stableColumns = useMemo(() => {
    validateColumns(columns);
    return columns.map((column) => ({ ...column }));
  }, [columns]);

  const empty = (
    <Empty description={emptyText} />
  );

  return (
    <div className={`data-table ${className}`.trim()}>
      <div className="data-table-scroll">
        <Table
          rowKey={rowKey}
          columns={stableColumns}
          data={data}
          loading={loading}
          empty={empty}
          scroll={{ x: scrollX, y: scrollY }}
          border={border}
          size={size}
          onRow={onRow}
          rowClassName={rowClassName}
          pagination={false}
          virtualized={false}
        />
      </div>
      {pagination ? (
        <div className="data-table-pagination">
          <span className="data-table-page-size">
            <span>每页</span>
            <Select
              size="small"
              value={pagination.pageSize}
              onChange={(value) => pagination.onPageSizeChange?.(value)}
            >
              {pageSizeOptions.map((size) => (
                <Option key={size} value={size}>{size} 条</Option>
              ))}
            </Select>
          </span>
          <Pagination
            current={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            size="small"
            disabled={loading}
            onChange={pagination.onChange}
          />
        </div>
      ) : null}
    </div>
  );
}

export default DataTable;
