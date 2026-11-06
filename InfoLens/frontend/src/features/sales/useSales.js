import { useEffect, useRef, useState } from "../../lib/react.js";
import { getSales, uploadSales, deleteSales, recalculateSalesCost } from "../../api/sales.js";

const emptyFilters = () => ({ document: "", document_type: "", dates: [], month: "", salesperson: "",
  terminal_code: "", customer_type: "", customer: "", product: "", category: [], category_mode: "include" });
function appliedFilters(draft) {
  const { dates, ...filters } = draft;
  return { ...filters, document: filters.document.trim(), date_start: dates[0] || "", date_end: dates[1] || "" };
}

export function useSales() {
  const [draft, setDraft] = useState(emptyFilters);
  const [query, setQuery] = useState({ ...appliedFilters(emptyFilters()), page: 1, page_size: 100, sort_by: "", sort_order: "" });
  const [data, setData] = useState({ items: [], columns: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [productSync, setProductSync] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [updatingCost, setUpdatingCost] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const version = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; version.current += 1; }; }, []);
  useEffect(() => {
    const current = ++version.current;
    setSelectedKeys([]);
    setLoading(true);
    getSales(query).then((result) => {
      if (version.current === current) { setData(result); setProductSync(result.product_sync || null); }
    }).catch((error) => {
      if (version.current === current) {
        setData({ items: [], columns: [], total: 0 });
        setStatus({ type: "error", message: error.message });
      }
    }).finally(() => { if (version.current === current) setLoading(false); });
  }, [query]);

  async function upload(file) {
    if (!file || uploading) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setStatus({ type: "error", message: "请选择 .xlsx 格式的销售明细表" });
      return;
    }
    setUploading(true);
    setStatus({ type: "info", message: "正在读取并分析销售明细，请稍候…" });
    try {
      const result = await uploadSales(file);
      if (!mounted.current) return;
      setProductSync(result.product_sync || null);
      const summary = result.product_sync
        ? ` 商品更新 ${result.product_sync.updated} 项，无变化 ${result.product_sync.unchanged} 项，跳过 ${result.product_sync.skipped} 项。`
        : "";
      setStatus({ type: result.product_sync_error ? "warning" : "success",
        message: `已处理 ${result.imported} 行。相同单据已更新，新单据已追加。${summary}${result.product_sync_error || ""}` });
      setDraft(emptyFilters());
      setQuery((q) => ({ ...q, ...appliedFilters(emptyFilters()), page: 1 }));
    } catch (error) {
      if (mounted.current) setStatus({ type: "error", message: error.message });
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  async function removeSelected(ids) {
    setDeleting(true);
    try {
      const result = await deleteSales(ids);
      if (!mounted.current) return;
      setSelectedKeys([]);
      setStatus({ type: "success", message: `已从数据库删除 ${result.deleted} 条明细，并重新计算分析结果` });
      setQuery((q) => ({ ...q, page: Math.max(1, Math.min(q.page, Math.ceil((data.total - result.deleted) / q.page_size))) }));
    } catch (error) {
      if (mounted.current) setStatus({ type: "error", message: error.message });
      throw error;
    } finally {
      if (mounted.current) setDeleting(false);
    }
  }
  async function updateCost(month) {
    setUpdatingCost(true);
    try {
      const result = await recalculateSalesCost(month);
      if (!mounted.current) return;
      setStatus({ type: 'success', message: `${result.month} 成本核算已完成，共 ${result.rows} 行，${result.costed} 行已确定成本；政策用量已更新` });
      setQuery((q) => ({ ...q, page: 1 }));
    } catch (error) {
      if (mounted.current) setStatus({ type: 'error', message: error.message });
      throw error;
    } finally {
      if (mounted.current) setUpdatingCost(false);
    }
  }
  return { updatingCost, updateCost, productSync, selectedKeys, setSelectedKeys, deleting, removeSelected, draft, setDraft, query, data, loading, uploading, status, upload,
    search: () => { setStatus(null); setQuery((q) => ({ ...q, ...appliedFilters(draft), page: 1 })); },
    reset: () => { setStatus(null); setDraft(emptyFilters()); setQuery((q) => ({ ...q, ...appliedFilters(emptyFilters()), page: 1 })); },
    changeSort: (sorter) => { setStatus(null); setQuery((q) => ({ ...q, page: 1,
      sort_by: sorter?.direction ? sorter.field : "",
      sort_order: sorter?.direction === "ascend" ? "asc" : sorter?.direction === "descend" ? "desc" : "",
    })); },
    changePage: (page) => setQuery((q) => ({ ...q, page })),
    changePageSize: (page_size) => setQuery((q) => ({ ...q, page_size, page: 1 })),
  };
}
