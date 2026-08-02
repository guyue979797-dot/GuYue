/**
 * 照片归档标签角标（图片处理业务组件）。
 */
import React from "../../lib/react.js";
import { Tag, Tooltip } from "../../lib/arco.js";

export function ImageArchiveBadges({ tags = [], expanded = false, onRemove }) {
  const seen = new Set();
  const normalized = tags.filter((tag) => {
    const key = tag.policy_id || tag.tag;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!normalized.length) return null;

  const content = (
    <div className="image-archive-tooltip">
      <strong>归档标签</strong>
      <div>
        {normalized.map((tag) => (
          <Tag key={tag.policy_id || tag.tag} className="tag-neutral">
            {tag.tag}
          </Tag>
        ))}
      </div>
    </div>
  );

  return (
    <Tooltip content={content} position="top" getPopupContainer={() => document.body}>
      <div
        className={
          expanded
            ? "image-archive-badges image-archive-badges-expanded"
            : "image-archive-badges"
        }
        aria-label={`归档标签：${normalized.map((tag) => tag.tag).join("、")}`}
        onClick={(event) => event.stopPropagation()}
      >
        {normalized.map((tag) => (
          <Tag
            key={tag.policy_id || tag.tag}
            className="tag-neutral image-archive-badge"
          >
            <span className="image-archive-badge-label">{tag.tag}</span>
            {onRemove ? (
              <button
                className="image-archive-remove"
                type="button"
                title={`删除标签“${tag.tag}”`}
                aria-label={`删除标签“${tag.tag}”`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(tag);
                }}
              >
                ×
              </button>
            ) : null}
          </Tag>
        ))}
      </div>
    </Tooltip>
  );
}

export default ImageArchiveBadges;
