/**
 * 雪花政策常量与配置。
 * 年份动态生成（修复硬编码 2026 问题），不写死具体年份。
 */

export const EMPTY_POLICY_FILTERS = {
  year: "",
  month: "",
  outbound_code: "",
  name: "",
  enabled: "",
};

export const SNOW_RULE_FIELDS = [
  { value: "outbound_remark", label: "出库单备注", operators: ["equals", "contains"] },
  { value: "sale_type", label: "售卖类型", operators: ["equals", "contains"] },
  { value: "converted_boxes", label: "折合箱数", operators: ["equals", "greater_than", "less_than"] },
];

export const SNOW_RULE_OPERATORS = {
  equals: "等于",
  contains: "包含",
  greater_than: "大于",
  less_than: "小于",
};

export const POLICY_GIFT_TYPES = [
  "试业用酒-协议终端",
  "促销赠酒-临时搭赠",
  "促销赠酒-渠道营销",
  "促销赠酒-置换用酒",
  "陈列赠酒",
];

export function getPolicyYears() {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1];
}

export function getPolicyMonthOptions() {
  const options = [];
  getPolicyYears().forEach((year) => {
    for (let month = 1; month <= 12; month += 1) {
      options.push({
        value: `${year}-${String(month).padStart(2, "0")}`,
        label: `${year}年${month}月`,
        year,
        month,
      });
    }
  });
  return options;
}

export function emptyPolicyForm() {
  const now = new Date();
  return {
    id: "",
    name: "",
    outbound_code: "",
    explanation: "",
    requires_photo: false,
    set_limit: "",
    month_target: "",
    conflict_policy_ids: [],
    normal_sale_product_ids: [],
    gift_product_ids: [],
    gift_type: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    conditions: [
      {
        field: "outbound_remark",
        operator: "contains",
        value: "",
        auto_code: true,
      },
    ],
  };
}

export const TERMINAL_LIST_META = {
  shipped: {
    countField: "shipped_count",
    endpoint: "shipped-terminals",
    title: "已出库终端",
    summaryLabel: "家已出库终端",
    emptyText: "暂无已出库终端",
  },
  reversed: {
    countField: "reversed_count",
    endpoint: "reversed-terminals",
    title: "已冲销终端",
    summaryLabel: "家已冲销终端",
    emptyText: "暂无已冲销终端",
  },
  photographed: {
    countField: "photographed_count",
    endpoint: "photographed-terminals",
    title: "已拍照终端",
    summaryLabel: "家已拍照终端",
    emptyText: "暂无已拍照终端",
  },
  pending: {
    countField: "pending_outbound_count",
    endpoint: "pending-outbound",
    title: "待出库终端",
    summaryLabel: "家待出库终端",
    emptyText: "暂无待出库终端",
  },
};

export function policyAlertTypeClass(name) {
  const variants = {
    雪花政策冲突告警: "conflict",
    政策重复出库告警: "duplicate",
    正常销售产品错误告警: "normal-product",
    赠送产品错误告警: "gift-product",
    售卖类型错误告警: "sale-type",
  };
  return `policy-alert-type policy-alert-type-${variants[name] || "default"}`;
}
