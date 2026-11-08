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
      { key: "products", label: "明细", title: "商品档案" },
      { key: "outbound-policies", label: "政策", title: "雪花政策" },
      { key: "product-policies", label: "价格与用量" },
    ],
  },
  {
    key: "customers",
    label: "客户",
    icon: "customers",
    sections: [
      { key: "terminals", label: "明细", title: "终端明细" },
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
  const selected = page?.sections?.find((item) => item.key === section);
  return selected?.title || selected?.label || page?.label || '照片';
}
