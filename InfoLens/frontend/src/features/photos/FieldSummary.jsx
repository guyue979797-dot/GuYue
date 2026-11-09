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
        <div
          className={`field-item field-${
            field.label === "序号"
              ? "index"
              : field.label === "终端编码"
                ? "terminal-code"
                : field.label === "客户名字"
                  ? "customer"
                  : field.label === "业务"
                    ? "business"
                    : "default"
          }-item`}
          key={field.label}
        >
          {field.label === "序号" ? (
            <span
              className="field-index-value"
              title={`序号：${field.value || "-"}`}
              aria-label={`序号：${field.value || "-"}`}
            >
              {field.value || "-"}
            </span>
          ) : (
            <>
              <Text className="field-label">{field.label}：</Text>
              <span className="field-value" title={field.value || "-"}>
                {field.value || "-"}
              </span>
            </>
          )}
        </div>
      ))}
      {policyTags.length ? (
        <div className="field-item field-policy-item">
          <Text className="field-label">政策标签：</Text>
          <div className="field-policy-tags">
            {policyTags.map((policy) => (
              <span
                className="field-policy-tag"
                key={policy.policy_id || policy.tag}
                title={policy.tag || "-"}
              >
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
