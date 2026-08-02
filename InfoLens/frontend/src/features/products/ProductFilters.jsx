/**
 * 产品档案筛选条（统一 FilterBar）。
 */
import React from "../../lib/react.js";
import { FilterBar } from "../../components/ui/FilterBar.jsx";
import { PRODUCT_STATUSES } from "./constants.js";

export function ProductFilters({ values, onChange, onSearch, onReset, loading }) {
  const fields = [
    {
      name: "status",
      label: "档案状态",
      type: "select",
      placeholder: "档案状态",
      options: PRODUCT_STATUSES,
      width: 100,
    },
    {
      name: "name",
      label: "名称",
      type: "input",
      placeholder: "名称",
      width: 130,
    },
    {
      name: "product_code",
      label: "商品编码",
      type: "input",
      placeholder: "商品编码",
      width: 140,
    },
    {
      name: "housekeeper_code",
      label: "管家婆编码",
      type: "input",
      placeholder: "管家婆编码",
      width: 150,
    },
  ];

  return (
    <FilterBar
      fields={fields}
      values={values}
      onChange={onChange}
      onSearch={onSearch}
      onReset={onReset}
      loading={loading}
      className="product-filter-bar"
    />
  );
}

export default ProductFilters;
