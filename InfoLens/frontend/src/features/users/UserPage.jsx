/**
 * 权限管理页面入口。
 */
import React, { useState } from "../../lib/react.js";
import { Button, Message, Modal, Space } from "../../lib/arco.js";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { useContainerHeight } from "../../hooks/useContainerHeight.js";
import { deleteUser } from "../../api/users.js";
import { useUsers } from "./useUsers.js";
import { UserTable } from "./UserTable.jsx";
import { UserFormModal } from "./UserFormModal.jsx";

export function UserPage() {
  const users = useUsers();
  const [tableShellRef, tableHeight] = useContainerHeight(64);
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  function openCreate() {
    setEditingUser(null);
    setFormOpen(true);
  }

  function openEdit(user) {
    setEditingUser(user);
    setFormOpen(true);
  }

  function removeUser(user) {
    Modal.confirm({
      title: "删除用户",
      content: `确定删除账号 ${user.username} 吗？`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          await deleteUser(user.id);
          Message.success("用户已删除");
          await users.loadUsers();
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  return (
    <div className="user-page">
      <div className="user-card table-page-list-card">
        <div className="user-toolbar">
          <Button type="primary" onClick={openCreate}>新增用户</Button>
        </div>
        <StatusAlert status={users.status} className="table-page-status" />
        <div className="table-page-shell" ref={tableShellRef}>
          <UserTable
            users={users.users}
            loading={users.loading}
            scrollY={tableHeight}
            onEdit={openEdit}
            onDelete={removeUser}
          />
        </div>
      </div>

      <UserFormModal
        visible={formOpen}
        user={editingUser}
        onClose={() => setFormOpen(false)}
        onSaved={users.loadUsers}
      />
    </div>
  );
}

export default UserPage;
