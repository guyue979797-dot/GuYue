/**
 * 政策标签列表（跨业务组件）。
 * 默认最多展示 2 个，+N 提示；页面级例外通过 limit 参数配置。
 */
import React from "../../lib/react.js";
import { Tooltip } from "../../lib/arco.js";
import { TableText } from "../ui/TableText.jsx";

export function PolicyTagList({ tags = [], limit = 2 }) {
  if (!tags.length) return "-";
  const visible = tags.slice(0, limit);
  const hiddenCount = tags.length - visible.length;
  const content = tags.map((tag) => tag.name).join("、");
  return (
    <span className="policy-tags-cell policy-tags-cell-compact" aria-label={content}>
      {visible.map((tag) => (
        <span
          className="customer-policy-badge"
          key={`${tag.policy_id}-${tag.name}`}
        >
          <TableText value={tag.name} />
        </span>
      ))}
      {hiddenCount > 0 ? (
        <Tooltip content={content} getPopupContainer={() => document.body}>
          <span className="table-tag-more" tabIndex={0} aria-label={`还有 ${hiddenCount} 个政策标签`}>+{hiddenCount}</span>
        </Tooltip>
      ) : null}
    </span>
  );
}

export default PolicyTagList;
