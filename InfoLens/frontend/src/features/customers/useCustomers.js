/**
 * 终端客户页数据 hook：筛选、分页、选项字典、竞态防护。
 */
import { useEffect, useRef, useState } from "../../lib/react.js";
import {
  getCustomerOptions,
  getPolicyOptions,
  listCustomers,
} from "../../api/customers.js";
import { getSnowOptions } from "../../api/snowPolicies.js";
import { EMPTY_CUSTOMER_FILTERS } from "./constants.js";

export function useCustomers() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({ ...EMPTY_CUSTOMER_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_CUSTOMER_FILTERS });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const [policyMonth, setPolicyMonth] = useState("");
  const [policyMonths, setPolicyMonths] = useState([]);
  const [policyTag, setPolicyTag] = useState("");
  const [policyTagOptions, setPolicyTagOptions] = useState([]);
  const [routeOptions, setRouteOptions] = useState([]);
  const [salespeople, setSalespeople] = useState([]);
  const [snowSalespeople, setSnowSalespeople] = useState([]);

  const requestSequence = useRef(0);

  async function loadCustomers() {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    const params = {
      terminal_code: appliedFilters.terminal_code,
      customer_name: appliedFilters.customer_name,
      policy_month: policyMonth,
      policy_tag: policyTag,
      page: String(page),
      page_size: String(pageSize),
      route: appliedFilters.route || [],
      person: appliedFilters.people || [],
    };
    try {
      const data = await listCustomers(params);
      if (sequence !== requestSequence.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
      setStatus(null);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setStatus({ type: "error", message: error.message });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, [page, pageSize, appliedFilters, policyMonth, policyTag]);

  useEffect(() => {
    loadSnowOptions();
    loadCustomerOptions();
  }, []);

  useEffect(() => {
    if (!policyMonth) {
      setPolicyTagOptions([]);
      setPolicyTag("");
      return;
    }
    loadPolicyTagOptions(policyMonth);
  }, [policyMonth]);

  async function loadSnowOptions(preferredMonth = "") {
    try {
      const data = await getSnowOptions();
      const months = Array.from(
        new Set([data.current_month, ...(data.months || [])].filter(Boolean))
      );
      setPolicyMonths(months);
      setPolicyMonth((current) => preferredMonth || current || data.current_month || months[0] || "");
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  async function loadCustomerOptions() {
    try {
      const data = await getCustomerOptions();
      setRouteOptions(data.routes || []);
      setSalespeople(data.salespeople || []);
      setSnowSalespeople(data.snow_salespeople || []);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  async function loadPolicyTagOptions(month) {
    try {
      const data = await getPolicyOptions(month);
      const options = data.items || [];
      setPolicyTagOptions(options);
      setPolicyTag((current) => (options.includes(current) ? current : ""));
    } catch (error) {
      setPolicyTagOptions([]);
      setPolicyTag("");
      setStatus({ type: "error", message: error.message });
    }
  }

  function searchCustomers() {
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  function resetSearch() {
    setFilters({ ...EMPTY_CUSTOMER_FILTERS });
    setPolicyTag("");
    setPage(1);
    setAppliedFilters({ ...EMPTY_CUSTOMER_FILTERS });
  }

  function setFilterField(name, value) {
    setFilters((current) => {
      const next = { ...current, [name]: value };
      if (name === "terminal_code") {
        next.terminal_code = String(value || "").replace(/\D/g, "");
      }
      return next;
    });
  }

  function changePolicyMonth(value) {
    setPage(1);
    setPolicyTag("");
    setPolicyMonth(value || "");
  }

  function changePolicyTag(value) {
    setPage(1);
    setPolicyTag(value || "");
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
    policyMonth,
    policyMonths,
    policyTag,
    policyTagOptions,
    routeOptions,
    salespeople,
    snowSalespeople,
    searchCustomers,
    resetSearch,
    setFilterField,
    changePolicyMonth,
    changePolicyTag,
    changePage: setPage,
    changePageSize: (next) => {
      setPage(1);
      setPageSize(next);
    },
    loadCustomers,
    loadCustomerOptions,
    loadSnowOptions,
  };
}

export default useCustomers;
