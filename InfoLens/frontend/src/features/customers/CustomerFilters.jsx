/**
 * 终端明细筛选条（统一 FilterBar）。
 */
import React from "../../lib/react.js";
import { FilterBar } from "../../components/ui/FilterBar.jsx";

function shallowEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return false;
}

export function CustomerFilters({
  values,
  onDraftChange,
  onPolicyMonthChange,
  onPolicyTagChange,
  onSearch,
  onReset,
  loading,
  policyMonths,
  policyTagOptions,
  routeOptions,
  peopleOptions,
}) {
  const fields = [
    {
      name: "policyMonth",
      label: "雪花政策月份",
      type: "select",
      placeholder: "雪花政策月份",
      options: policyMonths,
      width: 112,
    },
    {
      name: "policyTag",
      label: "雪花政策",
      type: "select",
      placeholder: "雪花政策",
      options: policyTagOptions,
      className: "customer-policy-filter",
      width: 140,
    },
    {
      name: "route",
      label: "线路归属",
      type: "multi-select",
      placeholder: "线路归属",
      options: routeOptions,
      showSearch: true,
      className: "customer-route-filter",
      width: 132,
    },
    {
      name: "people",
      label: "业务员 / 雪花业务员",
      type: "multi-select",
      placeholder: "业务员 / 雪花业务员",
      options: peopleOptions,
      showSearch: true,
      className: "customer-people-filter",
      width: 140,
    },
    {
      name: "terminal_code",
      label: "终端编码",
      type: "input",
      placeholder: "终端编码",
      maxLength: 10,
      width: 112,
    },
    {
      name: "customer_name",
      label: "客户全名",
      type: "input",
      placeholder: "客户全名",
      width: 120,
    },
  ];

  function handleChange(nextValues) {
    const changed = fields.find((field) => !shallowEqual(values[field.name], nextValues[field.name]));
    if (!changed) return;
    const key = changed.name;
    if (key === "policyMonth") {
      onPolicyMonthChange?.(nextValues.policyMonth);
    } else if (key === "policyTag") {
      onPolicyTagChange?.(nextValues.policyTag);
    } else {
      onDraftChange?.(key, nextValues[key]);
    }
  }

  return (
    <FilterBar
      fields={fields}
      values={values}
      onChange={handleChange}
      onSearch={onSearch}
      onReset={onReset}
      loading={loading}
      className="customer-filter-bar"
    />
  );
}

export default CustomerFilters;
