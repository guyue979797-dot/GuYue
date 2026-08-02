/**
 * 用户列表（统一 Arco DataTable）。
 */
import React from "../../lib/react.js";
import { Button, Space, Tag } from "../../lib/arco.js";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { TableRowActions } from "../../components/ui/TableRowActions.jsx";
import { TableText } from "../../components/ui/TableText.jsx";

export function UserTable({
  users,
  loading,
  scrollY,
  onEdit,
  onDelete,
}) {
  const columns = [
    {
      title: "账号",
      key: "username",
      width: 200,
      render: (value, user) => (
        <span className="user-account-cell">
          <span className="user-account-name">{user.username}</span>
          {user.is_super_admin ? <Tag className="tag-neutral">超级管理员</Tag> : null}
        </span>
      ),
    },
    {
      title: "用户名称",
      key: "display_name",
      width: 180,
      render: (value, user) => <TableText value={user.display_name} maxWidth={160} />,
    },
    {
      title: "角色",
      key: "role",
      width: 100,
      render: (value, user) => (user.role === "admin" ? "管理员" : "普通用户"),
    },
    {
      title: "状态",
      key: "status",
      width: 90,
      render: (value, user) => (
        <Tag color={user.status === "enabled" ? "green" : "gray"}>
          {user.status === "enabled" ? "启用" : "禁用"}
        </Tag>
      ),
    },
    {
      title: "最近登录",
      key: "last_login_at",
      width: 180,
      render: (value, user) => user.last_login_at || "-",
    },
    {
      title: "创建时间",
      key: "created_at",
      width: 180,
      render: (value, user) => user.created_at,
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      className: "table-actions-cell",
      render: (value, user) => (
        <TableRowActions
          onDetail={() => onEdit(user)}
          detailLabel="编辑"
          items={[
            {
              key: "delete",
              label: "删除",
              danger: true,
              disabled: user.is_super_admin,
              onClick: () => onDelete(user),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable
      rowKey="id"
      columns={columns}
      data={users}
      loading={loading}
      emptyText="暂无用户"
      scrollY={scrollY}
      rowClassName={(user) => (user.status === "enabled" ? "" : "disabled")}
    />
  );
}

export default UserTable;
