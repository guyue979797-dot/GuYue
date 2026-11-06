/**
 * 商品档案数据 hook：固定列表、库存排序、汇总、竞态防护。
 */
import { useEffect, useRef, useState } from "../../lib/react.js";
import { listProducts } from "../../api/products.js";

export function useProducts() {
  const [brandKey, setBrandKey] = useState("all");
  const [brands, setBrands] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [latestUploadAt, setLatestUploadAt] = useState("");
  const [monthlyInboundTons, setMonthlyInboundTons] = useState(0);
  const [snowInventoryBoxes, setSnowInventoryBoxes] = useState(0);
  const [inventorySort, setInventorySort] = useState("");
  const sequence = useRef(0);

  async function loadProducts() {
    const requestId = ++sequence.current;
    setLoading(true);
    const params = {
      brand: brandKey.startsWith("brand:") ? brandKey.slice(6) : "",
      unbranded: brandKey === "unbranded" ? "true" : "",
      inventory_sort: inventorySort,
      page: String(page),
      page_size: String(pageSize),
    };
    try {
      const data = await listProducts(params);
      if (requestId !== sequence.current) return;
      setItems(data.items || []);
      setBrands(data.brands || []);
      setTotal(data.total || 0);
      setLatestUploadAt(data.latest_upload_at || "");
      setMonthlyInboundTons(Number(data.monthly_inbound_tons) || 0);
      setSnowInventoryBoxes(Number(data.snow_inventory_boxes) || 0);
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
  }, [page, pageSize, inventorySort, brandKey]);

  function toggleInventorySort() {
    setPage(1);
    setInventorySort((current) =>
      current === "" ? "desc" : current === "desc" ? "asc" : ""
    );
  }

  return {
    brands, brandKey,
    selectBrand: key => { setPage(1); setBrandKey(key); },
    items,
    total,
    page,
    pageSize,
    loading,
    status,
    latestUploadAt,
    monthlyInboundTons,
    snowInventoryBoxes,
    inventorySort,
    loadProducts,
    toggleInventorySort,
    changePage: setPage,
    changePageSize: (next) => {
      setPage(1);
      setPageSize(next);
    },
  };
}

export default useProducts;
