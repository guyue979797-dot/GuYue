/**
 * 雪花政策筛选条（统一 FilterBar，年份动态生成）。
 */
import React from "../../lib/react.js";
import { FilterBar } from "../../components/ui/FilterBar.jsx";
import { getPolicyMonthOptions } from "./constants.js";

export function SnowPolicyFilters({
  values,
  onDraftChange,
  onYearMonthChange,
  onSearch,
  onReset,
  loading,
}) {
  const fields = [
    {
      name: "yearMonth",
      label: "年月",
      type: "select",
      placeholder: "年月",
      options: getPolicyMonthOptions(),
      width: 112,
    },
    {
      name: "enabled",
      label: "是否启用",
      type: "select",
      placeholder: "是否启用",
      options: [
        { value: "true", label: "已启用" },
        { value: "false", label: "已停用" },
      ],
      width: 100,
    },
    {
      name: "outbound_code",
      label: "出库编码搜索",
      type: "input",
      placeholder: "出库编码搜索",
      width: 170,
    },
    {
      name: "name",
      label: "标签名搜索",
      type: "input",
      placeholder: "标签名搜索",
      width: 140,
    },
  ];

  function handleChange(nextValues) {
    if (nextValues.yearMonth !== values.yearMonth) {
      onYearMonthChange?.(nextValues.yearMonth || "");
      return;
    }
    const changed = fields.find(
      (field) => field.name !== "yearMonth" && nextValues[field.name] !== values[field.name],
    );
    if (changed) onDraftChange?.(changed.name, nextValues[changed.name]);
  }

  return (
    <FilterBar
      fields={fields}
      values={values}
      onChange={handleChange}
      onSearch={onSearch}
      onReset={onReset}
      loading={loading}
      className="policy-filter-bar"
    />
  );
}

export default SnowPolicyFilters;
