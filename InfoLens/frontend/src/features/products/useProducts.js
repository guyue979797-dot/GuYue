/**
 * 产品档案数据 hook：列表、筛选、库存排序、月度汇总、竞态防护。
 */
import { useEffect, useRef, useState } from "../../lib/react.js";
import { listProducts } from "../../api/products.js";
import { EMPTY_PRODUCT_FILTERS } from "./constants.js";

export function useProducts() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({ ...EMPTY_PRODUCT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_PRODUCT_FILTERS });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [latestUploadAt, setLatestUploadAt] = useState("");
  const [monthlyInboundTons, setMonthlyInboundTons] = useState(0);
  const [snowInventoryBoxes, setSnowInventoryBoxes] = useState(0);
  const [summaryMonth, setSummaryMonth] = useState("");
  const [summaryMonths, setSummaryMonths] = useState([]);
  const [inventorySort, setInventorySort] = useState("");
  const sequence = useRef(0);

  async function loadProducts() {
    const requestId = ++sequence.current;
    setLoading(true);
    const params = {
      ...appliedFilters,
      inventory_sort: inventorySort,
      summary_month: summaryMonth,
      page: String(page),
      page_size: String(pageSize),
    };
    try {
      const data = await listProducts(params);
      if (requestId !== sequence.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLatestUploadAt(data.latest_upload_at || "");
      setMonthlyInboundTons(Number(data.monthly_inbound_tons) || 0);
      setSnowInventoryBoxes(Number(data.snow_inventory_boxes) || 0);
      setSummaryMonth(data.summary_month || "");
      setSummaryMonths(data.summary_months || []);
      setStatus(null);
    } catch (error) {
      if (requestId === sequence.current) {
        setStatus({ type: "error", message: error.message });
      }
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, [page, pageSize, appliedFilters, inventorySort, summaryMonth]);

  function applySearch() {
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  function resetSearch() {
    setFilters({ ...EMPTY_PRODUCT_FILTERS });
    setPage(1);
    setAppliedFilters({ ...EMPTY_PRODUCT_FILTERS });
  }

  function setFilterField(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function toggleInventorySort() {
    setPage(1);
    setInventorySort((current) =>
      current === "" ? "desc" : current === "desc" ? "asc" : ""
    );
  }

  function changeSummaryMonth(value) {
    setSummaryMonth(value || "");
  }

  return {
    items,
    total,
    page,
    pageSize,
    loading,
    status,
    filters,
    appliedFilters,
    latestUploadAt,
    monthlyInboundTons,
    snowInventoryBoxes,
    summaryMonth,
    summaryMonths,
    inventorySort,
    loadProducts,
    applySearch,
    resetSearch,
    setFilterField,
    toggleInventorySort,
    changeSummaryMonth,
    changePage: setPage,
    changePageSize: (next) => {
      setPage(1);
      setPageSize(next);
    },
  };
}

export default useProducts;
