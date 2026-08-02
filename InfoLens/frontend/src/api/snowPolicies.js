/**
 * 雪花出库政策 API。
 */
import { apiRequest, buildQuery, downloadPostFile } from "./http.js";
import { saveBlobDownload } from "../utils/browser.js";

export async function getSnowOptions() {
  return apiRequest("/api/snow-outbound/options", { csrf: false });
}

export async function previewSnowOutbound(file, updatePolicy) {
  const form = new FormData();
  form.append("file", file);
  form.append("update_policy", String(updatePolicy));
  return apiRequest("/api/snow-outbound/preview", {
    method: "POST",
    form,
    csrfInBody: true,
  });
}

export async function importSnowOutbound(previewId) {
  return apiRequest("/api/snow-outbound/import", {
    method: "POST",
    json: { preview_id: previewId },
    csrfInBody: true,
  });
}

export async function listPolicies(params) {
  const query = buildQuery(params);
  return apiRequest(`/api/snow-outbound/policies?${query.toString()}`, { csrf: false });
}

export async function getPolicyOptions(params) {
  const query = buildQuery(params);
  return apiRequest(`/api/snow-outbound/policies/options?${query.toString()}`, { csrf: false });
}

export async function createPolicy(payload) {
  return apiRequest("/api/snow-outbound/policies", {
    method: "POST",
    json: payload,
    csrfInBody: true,
  });
}

export async function updatePolicy(id, payload) {
  return apiRequest(`/api/snow-outbound/policies/${id}`, {
    method: "PATCH",
    json: payload,
    csrfInBody: true,
  });
}

export async function togglePolicyStatus(id, enabled) {
  return apiRequest(`/api/snow-outbound/policies/${id}/status`, {
    method: "POST",
    json: { enabled },
    csrfInBody: true,
  });
}

export async function deletePolicy(id) {
  return apiRequest(`/api/snow-outbound/policies/${id}`, { method: "DELETE" });
}

export async function getPolicyTerminals(id, endpoint) {
  return apiRequest(
    `/api/snow-outbound/policies/${encodeURIComponent(id)}/${endpoint}`,
    { csrf: false },
  );
}

export async function getPolicyAlerts(id) {
  return apiRequest(
    `/api/snow-outbound/policies/${encodeURIComponent(id)}/alerts`,
    { csrf: false },
  );
}

export async function exportPolicyArchive(policyId, onProgress) {
  const { blob, filename } = await downloadPostFile(
    `/api/snow-outbound/policies/${encodeURIComponent(policyId)}/export`,
  );
  await saveBlobDownload(blob, filename);
  onProgress?.();
}
