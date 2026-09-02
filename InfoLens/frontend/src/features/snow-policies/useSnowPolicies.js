/**
 * 雪花政策数据 hook：列表、筛选、排序、分页、竞态防护。
 */
import { useEffect, useRef, useState } from "../../lib/react.js";
import { listPolicies } from "../../api/snowPolicies.js";
import { EMPTY_POLICY_FILTERS } from "./constants.js";

export function useSnowPolicies() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortConfig, setSortConfig] = useState({ field: "", order: "desc" });
  const [filters, setFilters] = useState({ ...EMPTY_POLICY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_POLICY_FILTERS });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [latestUploadAt, setLatestUploadAt] = useState("");
  const sequence = useRef(0);

  async function loadPolicies() {
    const requestId = ++sequence.current;
    setLoading(true);
    const params = {
      ...appliedFilters,
      sort_by: sortConfig.field,
      sort_order: sortConfig.order,
      page: String(page),
      page_size: String(pageSize),
    };
    try {
      const data = await listPolicies(params);
      if (requestId !== sequence.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLatestUploadAt(data.latest_upload_at || "");
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
    loadPolicies();
  }, [page, pageSize, appliedFilters, sortConfig]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  function resetFilters() {
    setFilters({ ...EMPTY_POLICY_FILTERS });
    setPage(1);
    setAppliedFilters({ ...EMPTY_POLICY_FILTERS });
  }

  function setFilterField(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function toggleSort(field) {
    setPage(1);
    setSortConfig((current) => ({
      field,
      order: current.field === field && current.order === "desc" ? "asc" : "desc",
    }));
  }

  function changePage(nextPage) {
    setPage(nextPage);
  }

  function changePageSize(nextPageSize) {
    setPage(1);
    setPageSize(nextPageSize);
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
    sortConfig,
    latestUploadAt,
    loadPolicies,
    applyFilters,
    resetFilters,
    setFilterField,
    toggleSort,
    changePage,
    changePageSize,
  };
}

export default useSnowPolicies;
