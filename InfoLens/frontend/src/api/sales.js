import { apiRequest, buildQuery, downloadPostFile } from "./http.js";
import { saveBlobDownload } from "../utils/browser.js";

export async function exportSales(month) {
  const { blob, filename } = await downloadPostFile(`/api/sales/export?${buildQuery({ month })}`);
  await saveBlobDownload(blob, filename);
}

async function salesRequest(url, options) {
  try {
    return await apiRequest(url, options);
  } catch (error) {
    if (error.status === 404) throw new Error("销售接口尚未加载，请重启后端服务后重试");
    if (error.status === 413) throw new Error("销售表超过上传大小限制，请拆分文件后重试");
    if (error.status >= 500) throw new Error("销售数据处理失败，请稍后重试或检查服务日志");
    throw error;
  }
}

export function getSales(params) {
  return salesRequest(`/api/sales?${buildQuery(params)}`);
}

export function uploadSales(file) {
  const form = new FormData();
  form.append("file", file);
  return salesRequest("/api/sales/upload", { method: "POST", form });
}

export function deleteSales(ids) {
  return salesRequest("/api/sales/delete", { method: "POST", json: { ids } });
}

export function recalculateSalesCost(month) {
  return salesRequest("/api/sales/recalculate-cost", { method: "POST", json: { month } });
}
