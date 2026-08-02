/**
 * 图片卡片标题字段摘要（图片处理 feature 内部组件）。
 */
import React from "../../lib/react.js";
import { Typography } from "../../lib/arco.js";

const { Text } = Typography;

export function FieldSummary({ fields, policyTags = [] }) {
  return (
    <div className="field-summary">
      {fields.map((field) => (
        <div className="field-item" key={field.label}>
          <Text className="field-label">{field.label}：</Text>
          <span className="field-value" title={field.value || "-"}>
            {field.value || "-"}
          </span>
        </div>
      ))}
      {policyTags.length ? (
        <div className="field-item field-policy-item">
          <Text className="field-label">政策标签：</Text>
          <div className="field-policy-tags">
            {policyTags.map((policy) => (
              <span className="tag-neutral" key={policy.policy_id || policy.tag}>
                {policy.tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default FieldSummary;
