/**
 * 政策标签列表（跨业务组件）。
 * 默认最多展示 2 个，+N 提示；页面级例外通过 limit 参数配置。
 */
import React from "../../lib/react.js";

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
          style={{
            display: "inline-flex",
            alignItems: "center",
            flex: "0 0 auto",
            minHeight: 22,
            padding: "1px 7px",
            border: "1px solid #c7d2fe",
            borderRadius: 4,
            backgroundColor: "#eef2ff",
            color: "#4338ca",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: "18px",
            whiteSpace: "nowrap",
          }}
        >
          {tag.name}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="table-tag-more" aria-label={`还有 ${hiddenCount} 个政策标签`}>+{hiddenCount}</span>
      ) : null}
    </span>
  );
}

export default PolicyTagList;
