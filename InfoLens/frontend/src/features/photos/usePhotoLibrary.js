/**
 * 图片库数据 hook：筛选、分页、缓存、预取、竞态防护。
 */
import { useEffect, useRef, useState } from "../../lib/react.js";
import { searchLibrary } from "../../api/photos.js";

const EMPTY_LIBRARY = {
  items: [],
  months: [],
  businesses: [],
  customer_names: [],
  policy_options: [],
  archive_policy_options: [],
  field_count: 0,
  image_count: 0,
  missing_fields: [],
  pagination: {
    page: 1,
    page_size: 12,
    total_groups: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false,
  },
};

export function usePhotoLibrary({ activeMonth, onMonthsChange }) {
  const [businesses, setBusinesses] = useState([]);
  const [fields, setFields] = useState("");
  const [queriedFields, setQueriedFields] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [policyIds, setPolicyIds] = useState([]);
  const [policyMatch, setPolicyMatch] = useState("include");
  const [archivePolicyIds, setArchivePolicyIds] = useState([]);
  const [archivePolicyMatch, setArchivePolicyMatch] = useState("archived");
  const [data, setData] = useState({ ...EMPTY_LIBRARY });
  const [selected, setSelected] = useState(new Set());
  const [selectedImageFields, setSelectedImageFields] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const libraryCacheRef = useRef(new Map());
  const loadRequestRef = useRef(0);
  const libraryScrollRef = useRef(null);

  function libraryCacheKey(query) {
    return JSON.stringify([
      query.month,
      query.businesses,
      query.fields.trim(),
      query.customerName.trim(),
      query.policyIds,
      query.policyMatch,
      query.archivePolicyIds,
      query.archivePolicyMatch,
      query.page,
      query.pageSize,
    ]);
  }

  async function requestLibrary(query, { force = false } = {}) {
    const key = libraryCacheKey(query);
    if (!force && libraryCacheRef.current.has(key)) {
      return libraryCacheRef.current.get(key);
    }
    const next = await searchLibrary({
      month: query.month,
      businesses: query.businesses,
      fields: query.fields,
      customer_name: query.customerName,
      policy_ids: query.policyIds,
      policy_match: query.policyMatch,
      archive_policy_ids: query.archivePolicyIds,
      archive_policy_match: query.archivePolicyMatch,
      page: query.page,
      page_size: query.pageSize,
    });
    if (libraryCacheRef.current.size >= 24) {
      libraryCacheRef.current.delete(libraryCacheRef.current.keys().next().value);
    }
    libraryCacheRef.current.set(key, next);
    return next;
  }

  function prefetchAdjacentPages(query, response) {
    const pages = [query.page - 1, query.page + 1].filter(
      (page) => page >= 1 && page <= response.pagination.total_pages,
    );
    if (!pages.length) return;
    const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 200));
    schedule(() => {
      pages.forEach((page) => {
        requestLibrary({ ...query, page }).catch(() => undefined);
      });
    });
  }

  async function load(overrides = {}) {
    const query = {
      month: overrides.month ?? activeMonth,
      businesses: overrides.businesses ?? businesses,
      fields: overrides.fields ?? fields,
      customerName: overrides.customerName ?? customerName,
      policyIds: overrides.policyIds ?? policyIds,
      policyMatch: overrides.policyMatch ?? policyMatch,
      archivePolicyIds: overrides.archivePolicyIds ?? archivePolicyIds,
      archivePolicyMatch: overrides.archivePolicyMatch ?? archivePolicyMatch,
      page: overrides.page ?? data.pagination?.page ?? 1,
      pageSize: overrides.pageSize ?? data.pagination?.page_size ?? 12,
    };
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const next = await requestLibrary(query, { force: Boolean(overrides.force) });
      if (requestId !== loadRequestRef.current) return null;
      setData(next);
      onMonthsChange?.(next.months || []);
      setQueriedFields(query.fields);
      setStatus(null);
      prefetchAdjacentPages(query, next);
      return next;
    } catch (error) {
      if (requestId === loadRequestRef.current) {
        setStatus({ type: "error", message: error.message });
      }
      return null;
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }

  function runSearch(overrides = {}) {
    setSelected(new Set());
    setSelectedImageFields(new Map());
    libraryCacheRef.current.clear();
    return load({ ...overrides, page: 1, force: true });
  }

  useEffect(() => {
    setSelected(new Set());
    setSelectedImageFields(new Map());
    setBusinesses([]);
    setPolicyIds([]);
    setPolicyMatch("include");
    setArchivePolicyIds([]);
    setArchivePolicyMatch("archived");
    setFields("");
    setCustomerName("");
    libraryCacheRef.current.clear();
    load({
      month: activeMonth || "",
      businesses: [],
      fields: "",
      customerName: "",
      policyIds: [],
      policyMatch: "include",
      archivePolicyIds: [],
      archivePolicyMatch: "archived",
      page: 1,
      force: true,
    });
  }, [activeMonth]);

  function toggleImage(image, field) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(image.id)) next.delete(image.id);
      else next.add(image.id);
      return next;
    });
    setSelectedImageFields((current) => {
      const next = new Map(current);
      if (next.has(image.id)) next.delete(image.id);
      else next.set(image.id, field);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectedImageFields(new Map());
  }

  async function changePage(page) {
    if (loading || page === data.pagination.page) return;
    const next = await load({ page });
    if (!next) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        libraryScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    });
  }

  function refreshLibrary() {
    libraryCacheRef.current.clear();
    return load({ force: true });
  }

  function resetAllFilters() {
    setBusinesses([]);
    setFields("");
    setCustomerName("");
    setPolicyIds([]);
    setPolicyMatch("include");
    setArchivePolicyIds([]);
    setArchivePolicyMatch("archived");
    runSearch({
      businesses: [],
      fields: "",
      customerName: "",
      policyIds: [],
      policyMatch: "include",
      archivePolicyIds: [],
      archivePolicyMatch: "archived",
    });
  }

  return {
    data,
    businesses,
    fields,
    queriedFields,
    customerName,
    policyIds,
    policyMatch,
    archivePolicyIds,
    archivePolicyMatch,
    selected,
    selectedImageFields,
    loading,
    status,
    setStatus,
    libraryScrollRef,
    setBusinesses,
    setFields,
    setCustomerName,
    setPolicyIds,
    setPolicyMatch,
    setArchivePolicyIds,
    setArchivePolicyMatch,
    runSearch,
    load,
    changePage,
    refreshLibrary,
    toggleImage,
    clearSelection,
    resetAllFilters,
  };
}

export default usePhotoLibrary;
