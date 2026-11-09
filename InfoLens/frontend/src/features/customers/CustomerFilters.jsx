/**
 * 终端明细筛选条（统一 FilterBar）。
 */
import React from "../../lib/react.js";
import { FilterBar, sameFilterValue } from "../../components/ui/FilterBar.jsx";

export function CustomerFilters({
  values,
  onDraftChange,
  onPolicyTagChange,
  onSearch,
  onReset,
  loading,
  policyTagOptions,
  routeOptions,
  peopleOptions,
}) {
  const fields = [
    {
      name: "policyTag",
      label: "政策",
      type: "select",
      placeholder: "政策",
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
      placeholder: "输入编码",
      maxLength: 10,
      width: 112,
    },
    {
      name: "customer_name",
      label: "客户全名",
      type: "input",
      placeholder: "输入名称",
      width: 120,
    },
  ];

  function handleChange(nextValues) {
    const changed = fields.find((field) => !sameFilterValue(values[field.name], nextValues[field.name]));
    if (!changed) return;
    const key = changed.name;
    if (key === "policyTag") {
      onPolicyTagChange?.(nextValues.policyTag);
    } else {
      onDraftChange?.(key, nextValues[key]);
    }
  }

  return (
    <FilterBar
      fields={fields.map((field) => ({ ...field,
        ...(['terminal_code', 'customer_name'].includes(field.name) ? { row: 1, group: 'customer-identity-filter' } : {}),
      }))}
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
