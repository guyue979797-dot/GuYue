export const EMPTY_PRODUCT_FILTERS = {
  name: "",
  product_code: "",
  housekeeper_code: "",
  status: "",
};

export const PRODUCT_STATUSES = ["正常", "待完善"];

export const AUXILIARY_UNITS = ["瓶", "听", "罐"];

export function emptyProductForm() {
  return {
    id: null,
    version: null,
    product_codes: [],
    short_name: "",
    product_name: "",
    snow_inventory: "0",
    housekeeper_codes: [],
    specification: "",
    auxiliary_unit: "",
    settlement_price: "",
  };
}
