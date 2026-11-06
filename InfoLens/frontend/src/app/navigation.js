/**
 * 菜单与页面元数据（应用壳专用，不承载业务逻辑）。
 */

export const NAV_ITEMS = [
  { key: "sales", label: "销售", icon: "sales" },
  {
    key: "products",
    label: "商品",
    icon: "products",
    sections: [
      { key: "products", label: "明细" },
      { key: "outbound-policies", label: "政策" },
      { key: "product-policies", label: "价格与用量" },
    ],
  },
  {
    key: "customers",
    label: "客户",
    icon: "customers",
    sections: [
      { key: "terminals", label: "明细" },
    ],
  },
  {
    key: "library",
    label: "照片",
    icon: "library",
  },
  {
    key: "users",
    label: "权限",
    icon: "users",
    adminOnly: true,
  },
];

export function getPageTitle(activePage, customerSection, productSection) {
  const page = NAV_ITEMS.find((item) => item.key === activePage);
  const section = activePage === 'products' ? productSection : customerSection;
  return page?.sections?.find((item) => item.key === section)?.label || page?.label || '照片';
}
