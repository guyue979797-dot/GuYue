/**
 * 统一行操作（重构要求 16.3 / 原则十）。
 * - 只渲染“详情”按钮与“更多”下拉
 * - Dropdown 固定 trigger="click" / position="br"
 * - getPopupContainer 统一 document.body，业务页面不重复配置
 */
import React from "../../lib/react.js";
import { Dropdown, Menu } from "../../lib/arco.js";

const { Item: MenuItem } = Menu;

export function TableRowActions({ onDetail, items = [], detailLabel = "详情" }) {
  return (
    <div className="table-row-actions">
      <button className="action-detail" type="button" onClick={onDetail}>
        {detailLabel}
      </button>
      <Dropdown
        droplist={(
          <Menu>
            {items.map((item) => (
              <MenuItem
                key={item.key}
                className={item.danger ? "row-action-danger" : ""}
                disabled={item.disabled}
                onClick={item.onClick}
              >
                {item.label}
              </MenuItem>
            ))}
          </Menu>
        )}
        trigger="click"
        position="br"
        getPopupContainer={() => document.body}
      >
        <button
          className="action-kebab"
          type="button"
          aria-label="更多操作"
          title="更多操作"
        >
          ⋯
        </button>
      </Dropdown>
    </div>
  );
}

export default TableRowActions;
