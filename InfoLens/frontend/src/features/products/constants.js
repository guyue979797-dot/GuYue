export const PRODUCT_STATUSES = ["正常", "待处理", "下线"];
export const PRODUCT_BRANDS = ["雪花啤酒", "百事可乐", "蜂解", "娃哈哈", "牛栏山", "红星", "唯怡", "汾酒", "郎酒", "朝日", "加多宝", "王老吉", "椰汁"];
export const PRODUCT_GRADES = ["大高档", "高档", "中档", "底部", "白酒", "衍生品", "饮料"];

export const AUXILIARY_UNITS = ["瓶", "听", "罐"];

export function emptyProductForm() {
  return {
    id: null,
    status: "正常",
    version: null,
    product_codes: [],
    short_name: "",
    product_name: "",
    brand: "",
    grade: "",
    snow_inventory: "0",
    housekeeper_codes: [],
    specification: "",
    auxiliary_unit: "",
    cost_price: "",
    settlement_price: "",
  };
}
