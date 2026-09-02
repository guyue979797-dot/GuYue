/**
 * 终端客户 API。
 */
import { apiRequest, buildQuery } from "./http.js";
import { saveBlobDownload } from "../utils/browser.js";

export async function listCustomers(params) {
  const query = buildQuery(params);
  return apiRequest(`/api/customers?${query.toString()}`, { csrf: false });
}

export async function getCustomerOptions() {
  return apiRequest("/api/customers/options", { csrf: false });
}

export async function getPolicyOptions(month) {
  return apiRequest(
    `/api/customers/policy-options?month=${encodeURIComponent(month)}`,
    { csrf: false },
  );
}

export async function createCustomer(payload) {
  return apiRequest("/api/customers", {
    method: "POST",
    json: payload,
    csrfInBody: true,
  });
}

export async function updateCustomer(id, payload) {
  return apiRequest(`/api/customers/${id}`, {
    method: "PATCH",
    json: payload,
    csrfInBody: true,
  });
}

export async function deleteCustomer(id) {
  return apiRequest(`/api/customers/${id}`, { method: "DELETE" });
}

export async function getCustomerLogs(id) {
  return apiRequest(`/api/customers/${id}/logs`, { csrf: false });
}

export async function importCustomers(file) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest("/api/customers/import", {
    method: "POST",
    form,
    csrfInBody: true,
  });
}

export async function downloadImportTemplate() {
  await saveBlobDownload(await fetch("/api/customers/import-template").then((r) => r.blob()), "客户档案导入模板.xlsx");
}

export async function downloadImportErrorReport(url) {
  const blob = await fetch(url).then((r) => r.blob());
  await saveBlobDownload(blob, "客户档案导入失败明细.xlsx");
}
