/**
 * 统一 HTTP 请求层。
 * - jsonFetch：原始请求 + 错误归一化（可展示的 Error.message）
 * - apiRequest：CSRF 获取与请求头拼装集中于此，页面不再重复
 * - downloadPostFile：POST 导出下载（CSRF + blob + 文件名解析）
 */

export async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求失败");
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * 构造查询串：数组值展开为重复参数（后端 getlist 语义）。
 */
export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)));
    } else {
      query.append(key, String(value));
    }
  });
  return query.toString();
}

let sessionCache = null;

export async function getSession({ force = false } = {}) {
  if (sessionCache && !force) return sessionCache;
  const session = await jsonFetch("/api/session");
  sessionCache = session;
  return session;
}

export function clearSessionCache() {
  sessionCache = null;
}

export async function latestCsrfToken(fallback = "") {
  try {
    const session = await getSession();
    return session.csrf_token || fallback;
  } catch {
    return fallback;
  }
}

function attachCsrfBody(body, token, isFormData) {
  if (isFormData) {
    const nextBody = new FormData();
    for (const [key, value] of body.entries()) {
      if (key !== "csrf_token") nextBody.append(key, value);
    }
    nextBody.append("csrf_token", token);
    return nextBody;
  }
  const parsed = JSON.parse(body);
  parsed.csrf_token = token;
  return JSON.stringify(parsed);
}

/**
 * 统一请求入口。
 * @param {string} url
 * @param {object} options
 * @param {"GET"|"POST"|"PATCH"|"DELETE"} [options.method]
 * @param {object} [options.json]  JSON body
 * @param {FormData} [options.form] FormData body
 * @param {boolean} [options.csrf=true] 是否附带 X-CSRF-Token
 * @param {boolean} [options.csrfInBody=false] 是否同时把 token 写入 body
 * @param {object} [options.headers] 额外请求头
 */
export async function apiRequest(
  url,
  { method = "GET", json, form, csrf = true, csrfInBody = false, headers = {} } = {},
) {
  const requestHeaders = { ...headers };
  const options = { method };
  let body;
  let isFormData = false;

  if (json !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form;
    isFormData = true;
  }

  if (csrf) {
    const token = await latestCsrfToken();
    requestHeaders["X-CSRF-Token"] = token;
    if (csrfInBody && body !== undefined) {
      body = attachCsrfBody(body, token, isFormData);
    }
  }

  options.headers = requestHeaders;
  if (body !== undefined) options.body = body;

  try {
    return await jsonFetch(url, options);
  } catch (error) {
    // 令牌失效时刷新会话重试一次，避免“安全令牌无效”误报。
    if (error.status === 403 && csrf) {
      clearSessionCache();
      const retryToken = await latestCsrfToken();
      requestHeaders["X-CSRF-Token"] = retryToken;
      if (csrfInBody && body !== undefined) {
        body = attachCsrfBody(body, retryToken, isFormData);
        options.body = body;
      }
      return jsonFetch(url, options);
    }
    throw error;
  }
}

/**
 * POST 下载（导出文件）：CSRF 头 + blob + Content-Disposition 文件名解析。
 */
export async function downloadPostFile(url) {
  let token = await latestCsrfToken();
  let response = await fetch(url, {
    method: "POST",
    headers: { "X-CSRF-Token": token },
  });
  if (response.status === 403) {
    clearSessionCache();
    token = await latestCsrfToken();
    response = await fetch(url, {
      method: "POST",
      headers: { "X-CSRF-Token": token },
    });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "下载失败");
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename = encodedMatch
    ? decodeURIComponent(encodedMatch[1])
    : plainMatch?.[1] || "照片档案.zip";
  const blob = await response.blob();
  return { blob, filename };
}
