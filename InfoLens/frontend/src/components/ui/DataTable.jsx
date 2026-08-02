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
    // 所有列表默认左对齐，确保表头与单元格使用同一条左侧基线。
    // 如未来确有例外，必须同时在需求与列定义中明确说明。
    return columns.map((column) => ({ align: "left", ...column }));
  }, [columns]);

  const resolvedScrollX = useMemo(() => {
    if (scrollX !== "max-content") return scrollX;
    const widths = stableColumns.map((column) => Number(column.width));
    // 所有列均有明确宽度时，按列宽精确求和，禁止浏览器用内容重新测量。
    // 这可保证 Arco 分离渲染的表头与表体使用同一个横向基准。
    return widths.every((width) => Number.isFinite(width) && width > 0)
      ? widths.reduce((total, width) => total + width, 0)
      : "max-content";
  }, [scrollX, stableColumns]);

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
          tableLayoutFixed
          scroll={{ x: resolvedScrollX, y: scrollY }}
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
