const React = window.React;
const { useEffect, useState } = React;
const {
  Button,
  Card,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} = window.arco;
const { Text } = Typography;
const Option = Select.Option;

const EMPTY_USER_FORM = {
  id: null,
  username: "",
  display_name: "",
  password: "",
  role: "user",
  status: "enabled",
};

export function Users({ csrfToken, jsonFetch, Status, TableEllipsis }) {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [saving, setSaving] = useState(false);

  async function latestCsrfToken() {
    try {
      const nextSession = await jsonFetch("/api/session");
      return nextSession.csrf_token || csrfToken;
    } catch {
      return csrfToken;
    }
  }

  async function loadUsers() {
    try {
      const data = await jsonFetch("/api/users");
      setUsers(data.items || []);
      setStatus(null);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function openCreate() {
    setForm(EMPTY_USER_FORM);
    setModalOpen(true);
  }

  function openEdit(user) {
    setForm({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      password: "",
      role: user.role,
      status: user.status,
      is_super_admin: user.is_super_admin,
    });
    setModalOpen(true);
  }

  async function saveUser() {
    setSaving(true);
    try {
      const token = await latestCsrfToken();
      const payload = {
        username: form.username,
        display_name: form.display_name,
        password: form.password,
        role: form.role,
        status: form.status,
        csrf_token: token,
      };
      if (form.id) {
        await jsonFetch(`/api/users/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          body: JSON.stringify(payload),
        });
        Message.success("用户已更新");
      } else {
        await jsonFetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          body: JSON.stringify(payload),
        });
        Message.success("用户已新增");
      }
      setModalOpen(false);
      await loadUsers();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  function deleteUser(user) {
    Modal.confirm({
      title: "删除用户",
      content: `确定删除账号 ${user.username} 吗？`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          const token = await latestCsrfToken();
          await jsonFetch(`/api/users/${user.id}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": token },
          });
          Message.success("用户已删除");
          await loadUsers();
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  const canSave = form.username.trim() && (form.id || form.password.trim());

  return (
    <div className="user-page">
      <Card bordered className="user-card">
        <div className="user-toolbar">
          <Button type="primary" onClick={openCreate}>新增用户</Button>
        </div>
        <Status status={status} />
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
              <tr>
                <th>账号</th><th>用户名称</th><th>角色</th><th>状态</th>
                <th>最近登录</th><th>创建时间</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={user.status === "enabled" ? "" : "disabled"}>
                  <td>
                    <span className="user-account-cell">
                      <Text bold className="user-account-name">{user.username}</Text>
                      {user.is_super_admin ? <Tag className="tag-neutral">超级管理员</Tag> : null}
                    </span>
                  </td>
                  <td><TableEllipsis value={user.display_name} maxWidth={160} /></td>
                  <td>{user.role === "admin" ? "管理员" : "普通用户"}</td>
                  <td><Tag color={user.status === "enabled" ? "green" : "gray"}>{user.status === "enabled" ? "启用" : "禁用"}</Tag></td>
                  <td>{user.last_login_at || "-"}</td>
                  <td>{user.created_at}</td>
                  <td>
                    <Space>
                      <Button size="small" onClick={() => openEdit(user)}>编辑</Button>
                      <Button size="small" status="danger" disabled={user.is_super_admin} onClick={() => deleteUser(user)}>删除</Button>
                    </Space>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        title={form.id ? "编辑用户" : "新增用户"}
        visible={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={saveUser}
        okButtonProps={{ loading: saving, disabled: !canSave }}
        okText={form.id ? "保存" : "新增"}
        className="user-modal"
        unmountOnExit
      >
        <div className="user-form">
          <label>账号</label>
          <Input value={form.username} disabled={Boolean(form.id)} placeholder="登录账号" onChange={(value) => setForm({ ...form, username: value })} />
          <label>用户名称</label>
          <Input value={form.display_name} placeholder="用户名称" onChange={(value) => setForm({ ...form, display_name: value })} />
          <label>{form.id ? "重置密码" : "初始密码"}</label>
          <Input value={form.password} type="password" placeholder={form.id ? "不填写则不修改密码" : "至少 6 位"} onChange={(value) => setForm({ ...form, password: value })} />
          <div className="user-form-grid">
            <div>
              <label>角色</label>
              <Select value={form.role} disabled={form.is_super_admin} onChange={(value) => setForm({ ...form, role: value })}>
                <Option value="user">普通用户</Option><Option value="admin">管理员</Option>
              </Select>
            </div>
            <div>
              <label>状态</label>
              <Select value={form.status} disabled={form.is_super_admin} onChange={(value) => setForm({ ...form, status: value })}>
                <Option value="enabled">启用</Option><Option value="disabled">禁用</Option>
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
