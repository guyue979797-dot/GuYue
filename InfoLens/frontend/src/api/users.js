/**
 * 用户管理 API。
 */
import { apiRequest } from "./http.js";

export async function listUsers() {
  return apiRequest("/api/users", { csrf: false });
}

export async function createUser(payload) {
  return apiRequest("/api/users", {
    method: "POST",
    json: payload,
    csrfInBody: true,
  });
}

export async function updateUser(id, payload) {
  return apiRequest(`/api/users/${id}`, {
    method: "PATCH",
    json: payload,
    csrfInBody: true,
  });
}

export async function deleteUser(id) {
  return apiRequest(`/api/users/${id}`, { method: "DELETE" });
}
