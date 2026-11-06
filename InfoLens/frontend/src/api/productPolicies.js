import { apiRequest, buildQuery } from "./http.js";
export const listProductPolicies = (params) => apiRequest(`/api/product-cost-policies?${buildQuery(params)}`, { csrf: false });
export const getPolicyProducts = () => apiRequest("/api/product-cost-policies/options", { csrf: false });
export const createProductPolicy = (payload) => apiRequest("/api/product-cost-policies", { method: "POST", json: payload, csrfInBody: true });
export const endProductPolicy = (id) => apiRequest(`/api/product-cost-policies/${id}/end`, { method: "POST" });
