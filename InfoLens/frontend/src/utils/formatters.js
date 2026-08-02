/**
 * 统一格式化工具。
 */

export function maskPhone(phone) {
  const value = String(phone || "");
  if (value.length < 7) return value || "-";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const compactDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

export function formatCompactDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return compactDateTimeFormatter.format(date);
}

export function formatPolicyQuantity(value) {
  return Number(value || 0).toLocaleString("zh-CN", {
    maximumFractionDigits: 6,
  });
}

export function formatPolicyAmount(value) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getDateParts(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return null;
  return { year, month, day };
}
