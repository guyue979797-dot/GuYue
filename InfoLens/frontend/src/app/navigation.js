/**
 * 菜单与页面元数据（应用壳专用，不承载业务逻辑）。
 */

export const NAV_ITEMS = [
  {
    key: "library",
    label: "CRM图片处理",
    icon: "library",
  },
  {
    key: "customers",
    label: "客户档案",
    icon: "customers",
    sections: [
      { key: "terminals", label: "终端明细" },
      { key: "policies", label: "雪花出库政策" },
    ],
  },
  {
    key: "products",
    label: "产品档案",
    icon: "products",
    sections: [
      { key: "products", label: "产品明细" },
    ],
  },
  {
    key: "users",
    label: "权限管理",
    icon: "users",
    adminOnly: true,
  },
];

export function getPageTitle(activePage, customerSection) {
  if (activePage === "users") return "权限管理";
  if (activePage === "products") return "产品明细";
  if (activePage === "customers") {
    return customerSection === "policies" ? "雪花出库政策" : "终端明细";
  }
  return "CRM图片处理";
}
