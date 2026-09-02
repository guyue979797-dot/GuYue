/**
 * 图片处理与归档 API。
 */
import { apiRequest, buildQuery, downloadPostFile } from "./http.js";
import { saveBlobDownload } from "../utils/browser.js";

export async function searchLibrary(query) {
  return apiRequest("/api/image-library/search", {
    method: "POST",
    json: query,
    csrf: false,
  });
}

export async function extractSingle(url) {
  return apiRequest("/api/extract", {
    method: "POST",
    json: { url },
    csrfInBody: true,
  });
}

export async function startBatchExtract(file) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest("/api/batch-extract", {
    method: "POST",
    form,
    csrfInBody: true,
  });
}

export async function getBatchJob(jobId) {
  return apiRequest(`/api/batch-extract/${encodeURIComponent(jobId)}`, { csrf: false });
}

export async function getArchiveOptions(month) {
  return apiRequest(
    `/api/photo-archive/options?month=${encodeURIComponent(month)}`,
    { csrf: false },
  );
}

export async function archivePhotos(payload) {
  return apiRequest("/api/photo-archive", {
    method: "POST",
    json: payload,
    csrfInBody: true,
  });
}

export async function getPhotoArchivePolicies(params) {
  const query = buildQuery(params);
  return apiRequest(`/api/photo-archive/policies?${query.toString()}`, { csrf: false });
}

export async function getPolicyMissing(policyId) {
  return apiRequest(
    `/api/photo-archive/policies/${encodeURIComponent(policyId)}/missing`,
    { csrf: false },
  );
}

export async function deleteArchiveTag(imageId, policyId) {
  return apiRequest(
    `/api/photo-archive/images/${encodeURIComponent(imageId)}/policies/${encodeURIComponent(policyId)}`,
    { method: "DELETE" },
  );
}

export async function getExtractionRecords() {
  return apiRequest("/api/extraction-records", { csrf: false });
}

export async function exportPhotoArchive(policyId) {
  const { blob, filename } = await downloadPostFile(
    `/api/photo-archive/policies/${encodeURIComponent(policyId)}/export`,
  );
  await saveBlobDownload(blob, filename);
}
