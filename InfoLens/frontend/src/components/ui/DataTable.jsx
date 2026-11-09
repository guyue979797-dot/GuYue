/**
 * 统一数据表格容器（重构要求 5.2 / 16.1）。
 * - 内部组合 Arco Table + Pagination
 * - 单一纵向滚动容器，Mac overscroll 边界控制
 * - 加载、空状态、分页统一承载
 * - 内容自适应列宽、自动上限、拖动调整、双击恢复
 */
import React, { useMemo } from "../../lib/react.js";
import { useTableColumnWidths } from "./useTableColumnWidths.js";
import { useTableViewportWidth } from "./useTableViewportWidth.js";
import { useTableBodyHeight } from "./useTableBodyHeight.js";
import { TableText } from "./TableText.jsx";
import { columnValue, columnKey } from "./tableColumnSizing.js";
import { Empty, Pagination, Select, Table } from "../../lib/arco.js";

const { Option } = Select;

export function DataTable({
  rowKey = "id",
  columns = [],
  data = [],
  loading = false,
  emptyText = "暂无数据",
  scrollX = "max-content",
  scrollY,
  pagination,
  fitContainer = Boolean(pagination),
  onRow,
  onChange,
  rowClassName,
  rowSelection,
  size = "default",
  border = true,
  className = "",
  pageSizeOptions = [20, 50, 100],
}) {
  const [viewportRef, bodyHeight] = useTableBodyHeight(scrollY, fitContainer);
  const viewportWidth = useTableViewportWidth(viewportRef, loading);
  const selectionWidth = rowSelection ? Number(rowSelection.columnWidth || 40) : 0;
  const sizing = useTableColumnWidths(columns, data, Math.max(0, viewportWidth - selectionWidth));
  const stableColumns = useMemo(() => {
    // 所有列表默认左对齐，确保表头与单元格使用同一条左侧基线。
    // 如未来确有例外，必须同时在需求与列定义中明确说明。
    return columns.map((column, index) => {
      const key = columnKey(column, index);
      return { align: "left", ...column, key, width: sizing.width(key),
        render: (value, record, rowIndex) => {
          const cell = column.render ? column.render(value, record, rowIndex) : columnValue(record, column);
          return typeof cell === 'string' || typeof cell === 'number' ? <TableText value={cell} /> : cell;
        }, title: <>
        {column.title}<span className="table-column-resize" {...sizing.handleProps(key)} />
      </> };
    });
  }, [columns, sizing]);

  const resolvedScrollX = useMemo(() => {
    if (scrollX !== "max-content") return scrollX;
    const widths = stableColumns.map((column) => Number(column.width));
    // 所有列均有明确宽度时，按列宽精确求和，禁止浏览器用内容重新测量。
    // 这可保证 Arco 分离渲染的表头与表体使用同一个横向基准。
    return widths.every((width) => Number.isFinite(width) && width > 0)
      ? widths.reduce((total, width) => total + width, rowSelection ? Number(rowSelection.columnWidth || 40) : 0)
      : "max-content";
  }, [scrollX, stableColumns, rowSelection]);

  const empty = (
    <Empty description={emptyText} />
  );

  return (
    <div className={`data-table ${className}`.trim()}>
      <div className="data-table-scroll" ref={viewportRef}>
        <Table
          rowKey={rowKey}
          columns={stableColumns}
          data={data}
          loading={loading}
          noDataElement={empty}
          tableLayoutFixed
          scroll={{ x: resolvedScrollX, y: bodyHeight }}
          border={border}
          size={size}
          onRow={onRow}
          onChange={onChange}
          rowClassName={rowClassName}
          rowSelection={rowSelection}
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
              aria-label="每页条数"
              disabled={loading}
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
