/**
 * 新增/编辑用户弹窗表单。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Input, Message, Select } from "../../lib/arco.js";
import { FormModal } from "../../components/ui/FormModal.jsx";
import { createUser, updateUser } from "../../api/users.js";
import { EMPTY_USER_FORM, USER_ROLES } from "./constants.js";

const { Option } = Select;

export function UserFormModal({ visible, user, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_USER_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (user) {
      setForm({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        password: "",
        role: user.role,
        status: user.status,
        is_super_admin: user.is_super_admin,
      });
    } else {
      setForm({ ...EMPTY_USER_FORM });
    }
  }, [visible, user]);

  const canSave = form.username.trim() && (form.id || form.password.trim());

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        username: form.username,
        display_name: form.display_name,
        password: form.password,
        role: form.role,
        status: form.status,
      };
      if (form.id) {
        await updateUser(form.id, payload);
      } else {
        await createUser(payload);
      }
      Message.success(form.id ? "用户已更新" : "用户已新增");
      onClose();
      await onSaved?.();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      size="small"
      title={form.id ? "编辑用户" : "新增用户"}
      visible={visible}
      loading={saving}
      okDisabled={!canSave}
      okText={form.id ? "保存" : "新增"}
      onCancel={onClose}
      onSubmit={save}
      className="user-modal"
    >
      <div className="user-form">
        <label>账号</label>
        <Input
          value={form.username}
          disabled={Boolean(form.id)}
          placeholder="登录账号"
          onChange={(value) => setField("username", value)}
        />
        <label>用户名称</label>
        <Input
          value={form.display_name}
          placeholder="用户名称"
          onChange={(value) => setField("display_name", value)}
        />
        <label>{form.id ? "重置密码" : "初始密码"}</label>
        <Input
          value={form.password}
          type="password"
          placeholder={form.id ? "不填写则不修改密码" : "至少 6 位"}
          onChange={(value) => setField("password", value)}
        />
        <div className="user-form-grid">
          <div>
            <label>角色</label>
            <Select
              value={form.role}
              disabled={form.is_super_admin}
              onChange={(value) => setField("role", value)}
            >
              {USER_ROLES.map((role) => (
                <Option key={role.value} value={role.value}>{role.label}</Option>
              ))}
            </Select>
          </div>
          <div>
            <label>状态</label>
            <Select
              value={form.status}
              disabled={form.is_super_admin}
              onChange={(value) => setField("status", value)}
            >
              <Option value="enabled">启用</Option>
              <Option value="disabled">禁用</Option>
            </Select>
          </div>
        </div>
      </div>
    </FormModal>
  );
}

export default UserFormModal;
