/**
 * 照片归档标签角标（图片处理业务组件）。
 */
import React from "../../lib/react.js";
import { Tag, Tooltip } from "../../lib/arco.js";

const MORANDI_TAG_COLORS = [
  { hex: "#424ED6", rgba: "rgba(66, 78, 214, 0.86)" },
  { hex: "#2576D9", rgba: "rgba(37, 118, 217, 0.86)" },
  { hex: "#2294BB", rgba: "rgba(34, 148, 187, 0.86)" },
  { hex: "#24A085", rgba: "rgba(36, 160, 133, 0.86)" },
  { hex: "#7254D8", rgba: "rgba(114, 84, 216, 0.86)" },
  { hex: "#D1604C", rgba: "rgba(209, 96, 76, 0.86)" },
];
const DISABLED_TAG_COLOR = { hex: "#7A7A8C", rgba: "rgba(122, 122, 140, 0.86)" };

function stableColorIndex(value) {
  return Array.from(String(value || ""))
    .reduce((hash, character) => ((hash * 31 + character.charCodeAt(0)) >>> 0), 0)
    % MORANDI_TAG_COLORS.length;
}

function archiveTagStyle(tag) {
  const color = tag.enabled === false || tag.deleted
    ? DISABLED_TAG_COLOR
    : MORANDI_TAG_COLORS[stableColorIndex(tag.policy_id || tag.tag)];
  return {
    "--archive-tag-background": color.rgba,
    "--archive-tag-border": color.hex,
  };
}

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
          <Tag
            key={tag.policy_id || tag.tag}
            className="tag-neutral image-archive-tooltip-badge"
            style={archiveTagStyle(tag)}
          >
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
            style={archiveTagStyle(tag)}
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
