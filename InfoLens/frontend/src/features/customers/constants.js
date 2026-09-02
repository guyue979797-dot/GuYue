export const EMPTY_CUSTOMER_FORM = {
  id: null,
  terminal_code: "",
  customer_name: "",
  terminal_business_type: "",
  status: "运营",
  route: "",
  salesperson: "",
  snow_salesperson: "",
  contact: "",
  address: "",
  phone: "",
  remark: "",
  version: 0,
};

export const EMPTY_CUSTOMER_FILTERS = {
  terminal_code: "",
  customer_name: "",
  route: [],
  people: [],
};

export const CUSTOMER_STATUSES = ["运营", "停用"];

export const PAGE_SIZE_OPTIONS = [20, 50, 100];
