/**
 * 统一表格截断文本（重构要求 16.2）。
 * - 内部使用 Typography.Text ellipsis
 * - 只有实际截断时展示 Arco 原生 Tooltip，弹层挂载 document.body
 * - null / 空字符串统一展示 "-"
 */
import React from "../../lib/react.js";
import { Typography } from "../../lib/arco.js";

const { Ellipsis } = Typography;

export function TableText({
  value,
  children,
  className = "",
  maxWidth = "100%",
  tooltip,
}) {
  const normalized = value == null || value === "" ? "-" : String(value);
  const tooltipContent = tooltip || normalized;
  const isPlaceholder = tooltipContent === "-";
  return (
    <Ellipsis
      className={`table-text ${className}`.trim()}
      rows={1}
      showTooltip={
        isPlaceholder
          ? false
          : {
              content: tooltipContent,
              getPopupContainer: () => document.body,
            }
      }
      aria-label={isPlaceholder ? undefined : tooltipContent}
      style={{ width: "100%", maxWidth: typeof maxWidth === "number" ? `min(100%, ${maxWidth}px)` : maxWidth, display: "block", minWidth: 0, boxSizing: "border-box" }}
    >
      {children ?? normalized}
    </Ellipsis>
  );
}

export default TableText;
