export const EMPTY_USER_FORM = {
  id: null,
  username: "",
  display_name: "",
  password: "",
  role: "user",
  status: "enabled",
};

export const USER_ROLES = [
  { value: "user", label: "普通用户" },
  { value: "admin", label: "管理员" },
];
