/**
 * 产品档案 API。
 */
import { apiRequest, buildQuery } from "./http.js";

export async function listProducts(params) {
  const query = buildQuery(params);
  return apiRequest(`/api/products?${query.toString()}`, { csrf: false });
}

export async function getProductOptions() {
  return apiRequest("/api/products/options", { csrf: false });
}

export async function createProduct(payload) {
  return apiRequest("/api/products", {
    method: "POST",
    json: payload,
    csrfInBody: true,
  });
}

export async function updateProduct(id, payload) {
  return apiRequest(`/api/products/${id}`, {
    method: "PATCH",
    json: payload,
    csrfInBody: true,
  });
}

export async function deleteProduct(id) {
  return apiRequest(`/api/products/${id}`, { method: "DELETE" });
}

export async function previewProductImport(file) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest("/api/products/import/preview", {
    method: "POST",
    form,
    csrfInBody: true,
  });
}

export async function commitProductImport(previewId) {
  return apiRequest("/api/products/import", {
    method: "POST",
    json: { preview_id: previewId },
    csrfInBody: true,
  });
}
