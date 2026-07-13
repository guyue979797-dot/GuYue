import "./styles.css";

const React = window.React;
const { useEffect, useState } = React;
const { createRoot } = window.ReactDOMClient;
const {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Empty,
  Image,
  Input,
  Layout,
  Message,
  Modal,
  Progress,
  Select,
  Space,
  Tag,
  Tabs,
  Typography,
  Upload,
} = window.arco;

const { Header, Content, Sider } = Layout;
const { Text } = Typography;
const Option = Select.Option;
const TabPane = Tabs.TabPane;

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function latestCsrfToken(fallback = "") {
  try {
    const session = await jsonFetch("/api/session");
    return session.csrf_token || fallback;
  } catch (_error) {
    return fallback;
  }
}

function downloadFile(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function Status({ status }) {
  if (!status?.message) return null;
  return (
    <Alert
      className="status-alert"
      type={status.type || "info"}
      content={status.message}
      showIcon
    />
  );
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <rect className="mark-bg" x="5" y="5" width="54" height="54" rx="16" />
        <path className="mark-mountain" d="M12 35 24 21l8 9 7-7 13 12" />
        <path className="mark-road" d="M13 43c7-4 14-5 22-3 6 1.5 10 1 16-2" />
        <path className="mark-bottle" d="M41 18h7v6l3 5v12a5 5 0 0 1-5 5 5 5 0 0 1-5-5V29l3-5v-6Z" />
        <path className="mark-cap" d="M41 15h7" />
        <path className="mark-label" d="M42 33h8" />
        <text className="mark-text" x="13" y="52">XXC</text>
      </svg>
    </div>
  );
}

function NavIcon({ type }) {
  if (type === "users") {
    return (
      <span className="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
          <path d="M16 10a2.5 2.5 0 1 0 0-5" />
          <path d="M15 14.5a4 4 0 0 1 5.5 3.8" />
        </svg>
      </span>
    );
  }
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M7.5 7.5 9 5h6l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5Z" />
        <path d="M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M18 10h.01" />
      </svg>
    </span>
  );
}

function EmptyBox({ text }) {
  return (
    <div className="empty-box">
      <Empty description={text} />
    </div>
  );
}

function FieldSummary({ fields }) {
  return (
    <div className="field-summary">
      {fields.map((field) => (
        <div className="field-item" key={field.label}>
          <Text className="field-label">{field.label}：</Text>
          <span className="field-value" title={field.value || "-"}>
            {field.value || "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

function SingleExtract({ csrfToken, onRefreshResults }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const canSubmit = Boolean(url.trim()) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setStatus({ type: "info", message: "正在读取拜访信息并下载图片，请稍候" });
    try {
      const token = await latestCsrfToken(csrfToken);
      const data = await jsonFetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ url: url.trim(), csrf_token: token }),
      });
      setUrl("");
      setStatus({ type: "success", message: `完成：已提取 ${data.images.length} 张图片` });
      await onRefreshResults();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="extract-pane">
      <div className="extract-input-group">
        <Input
          size="large"
          value={url}
          placeholder="链接"
          onChange={setUrl}
          onPressEnter={submit}
        />
        <Button size="large" type="primary" loading={busy} disabled={!canSubmit} onClick={submit}>
          提取
        </Button>
      </div>
      <Status status={status} />
    </div>
  );
}

function BatchExtract({ csrfToken, onRefreshResults }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState(null);

  function selectFile(nextFile) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".xlsx")) {
      setFile(null);
      setStatus({ type: "error", message: "请选择有效的 .xlsx 文件" });
      return;
    }
    setFile(nextFile);
    setProgress(null);
    setStatus(null);
  }

  async function waitForJob(jobId, initialJob) {
    let job = initialJob;
    while (true) {
      setProgress(job);
      if (job.status === "completed") return job.result;
      if (job.status === "failed") throw new Error(job.error || "批量提取失败");
      await new Promise((resolve) => setTimeout(resolve, 650));
      job = await jsonFetch(`/api/batch-extract/${encodeURIComponent(jobId)}`);
    }
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setStatus({ type: "info", message: "处理中" });
    try {
      const token = await latestCsrfToken(csrfToken);
      const form = new FormData();
      form.append("file", file);
      form.append("csrf_token", token);
      const started = await jsonFetch("/api/batch-extract", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
        body: form,
      });
      const data = await waitForJob(started.job_id, started);
      setStatus({
        type: "success",
        message: `完成：${data.succeeded}/${data.total}，${data.image_count} 张`,
      });
      await onRefreshResults();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const percent = progress?.total ? Math.round((Number(progress.processed || 0) / Number(progress.total)) * 100) : 0;

  return (
    <div className="extract-pane">
      <Upload
        drag
        limit={1}
        autoUpload={false}
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fileList={file ? [{ uid: file.name, name: file.name }] : []}
        onChange={(_, currentFile) => selectFile(currentFile?.originFile || currentFile)}
        onDrop={(event) => selectFile(event.dataTransfer.files?.[0])}
      />
      <Space className="form-actions">
        <Button type="primary" loading={busy} disabled={!file} onClick={submit}>
          提取
        </Button>
      </Space>
      <Status status={status} />
      {progress ? (
        <Card className="sub-card" bordered>
          <div className="progress-head">
            <Text>
              已处理 {progress.processed || 0}/{progress.total || 0} 条 · 成功 {progress.succeeded || 0} · 失败 {progress.failed || 0}
            </Text>
            <Text type="secondary">{percent}%</Text>
          </div>
          <Progress percent={percent} />
        </Card>
      ) : null}
    </div>
  );
}

function ImageLibrary({ csrfToken, activeMonth, onMonthsChange }) {
  const [business, setBusiness] = useState("");
  const [fields, setFields] = useState("");
  const [queriedFields, setQueriedFields] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [data, setData] = useState({
    items: [],
    months: [],
    businesses: [],
    customer_names: [],
    field_count: 0,
    image_count: 0,
    missing_fields: [],
  });
  const [selected, setSelected] = useState(new Set());
  const [status, setStatus] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  async function load(overrides = {}) {
    const query = {
      month: overrides.month ?? activeMonth,
      business: overrides.business ?? business,
      fields: overrides.fields ?? fields,
      customerName: overrides.customerName ?? customerName,
    };
    const params = new URLSearchParams();
    if (query.month) params.set("month", query.month);
    if (query.business) params.set("business", query.business);
    if (query.fields.trim()) params.set("fields", query.fields.trim());
    if (query.customerName.trim()) params.set("customer_name", query.customerName.trim());
    try {
      const next = await jsonFetch(`/api/image-library?${params.toString()}`);
      setData(next);
      onMonthsChange?.(next.months || []);
      setQueriedFields(query.fields);
      setStatus(null);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  useEffect(() => {
    load({ month: activeMonth || "" });
  }, [activeMonth]);

  useEffect(() => {
    if (!previewImage) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPreviewImage(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  function toggleImage(imageId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  }

  function setGroupSelected(group, checked) {
    setSelected((current) => {
      const next = new Set(current);
      group.images.forEach((image) => {
        if (checked) next.add(image.id);
        else next.delete(image.id);
      });
      return next;
    });
  }

  async function exportSelected() {
    const imageIds = [...selected];
    if (!imageIds.length) return;
    setExporting(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const result = await jsonFetch("/api/image-library/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ image_ids: imageIds, csrf_token: token }),
      });
      downloadFile(result.archive_url, result.archive_name);
      Message.success(`已导出 ${result.field_count} 个终端编码、${result.image_count} 张照片`);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setExporting(false);
    }
  }

  function selectCurrentPage() {
    const next = new Set(selected);
    (data.items || []).forEach((group) => group.images.forEach((image) => next.add(image.id)));
    setSelected(next);
  }

  async function copyMissingFields() {
    if (!missingFields.length) return;
    try {
      await navigator.clipboard.writeText(missingFields.join("\n"));
      Message.success("已复制全部未找到终端编码");
    } catch {
      Message.error("复制失败，请手动选择标签内容");
    }
  }

  const hasFieldQuery = Boolean(queriedFields.trim());
  const missingFields = hasFieldQuery ? data.missing_fields || [] : [];
  const shouldShowMissingFields = missingFields.length > 0;

  return (
    <div className="crm-page">
      <div className="crm-header-layout">
        <Card bordered className="filter-module">
          <div className="filter-grid">
            <Select placeholder="业务" value={business || undefined} allowClear onChange={(value) => setBusiness(value || "")}>
              {(data.businesses || []).map((value) => (
                <Option key={value} value={value}>
                  {value}
                </Option>
              ))}
            </Select>
            <Input
              value={fields}
              onChange={setFields}
              placeholder="批量终端编码"
              onPressEnter={() => load()}
            />
            <Select
              placeholder="客户名字"
              value={customerName || undefined}
              allowClear
              showSearch
              filterOption={(inputValue, option) =>
                String(option.props.children || "")
                  .toLowerCase()
                  .includes(String(inputValue || "").toLowerCase())
              }
              onChange={(value) => setCustomerName(value || "")}
            >
              {(data.customer_names || []).map((value) => (
                <Option key={value} value={value}>
                  {value}
                </Option>
              ))}
            </Select>
            <div className="filter-actions">
              <Button type="primary" onClick={() => load()}>
                查询
              </Button>
              <Button
                onClick={() => {
                  setBusiness("");
                  setFields("");
                  setCustomerName("");
                  setSelected(new Set());
                  load({ business: "", fields: "", customerName: "" });
                }}
              >
                清空
              </Button>
              <Button className="add-button" onClick={() => setCreateOpen(true)}>
                新增
              </Button>
            </div>
          </div>
          {shouldShowMissingFields ? (
            <div className="query-result-panel">
              <div className="query-result-row">
                <Text type="secondary">未找到</Text>
                <Text bold>{missingFields.length} 家</Text>
                <div className="query-tags">
                  {missingFields.map((field) => (
                    <Tag key={field} color="orangered">
                      {field}
                    </Tag>
                  ))}
                </div>
                <Button size="small" type="secondary" onClick={copyMissingFields}>
                  复制全部
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <Card bordered className="crm-operation-module">
        <div className="operation-toolbar">
          <Space wrap>
            <Button onClick={selectCurrentPage}>全选当前结果</Button>
            <Button onClick={() => setSelected(new Set())}>取消选择</Button>
          </Space>
          <Button type="primary" loading={exporting} disabled={!selected.size} onClick={exportSelected}>
            导出选中照片{selected.size ? `（${selected.size}）` : ""}
          </Button>
        </div>
        <Status status={status} />
        {!data.items?.length ? (
          <EmptyBox text="没有查询到符合条件的图片" />
        ) : (
          <div className="library-list">
            {data.items.map((group) => {
              const selectedCount = group.images.filter((image) => selected.has(image.id)).length;
              const allSelected = selectedCount === group.images.length && group.images.length > 0;
              const indeterminate = selectedCount > 0 && !allSelected;
              return (
                <Card
                  key={`${group.month}-${group.field}-${group.business}-${group.customer_name}`}
                  bordered
                  className="terminal-card"
                  title={
                    <FieldSummary
                      fields={[
                        { label: "终端编码", value: group.field },
                        { label: "客户名字", value: group.customer_name },
                        { label: "业务", value: group.business },
                        { label: "数量", value: `${group.images.length} 张` },
                      ]}
                    />
                  }
                  extra={
                    <Checkbox
                      checked={allSelected}
                      indeterminate={indeterminate}
                      onChange={(checked) => setGroupSelected(group, checked)}
                    >
                      全选
                    </Checkbox>
                  }
                >
                  <div className="responsive-image-grid library-grid">
                    {group.images.map((image) => {
                      const isSelected = selected.has(image.id);
                      return (
                        <div key={image.id}>
                          <Card
                            bordered
                            className={isSelected ? "image-card selected" : "image-card"}
                            bodyStyle={{ padding: 0 }}
                          >
                            <Image
                              src={image.url}
                              width="100%"
                              height="100%"
                              fit="contain"
                              preview={false}
                              onClick={() => setPreviewImage(image)}
                            />
                            <div className="image-actions">
                              <Button type={isSelected ? "primary" : "secondary"} long onClick={() => toggleImage(image.id)}>
                                {isSelected ? "已选中" : "选择"}
                              </Button>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        title="新增"
        visible={createOpen}
        footer={null}
        onCancel={() => setCreateOpen(false)}
        className="create-modal"
        unmountOnExit
      >
        <Tabs defaultActiveTab="single">
          <TabPane key="single" title="单链接提取">
            <SingleExtract csrfToken={csrfToken} onRefreshResults={load} />
          </TabPane>
          <TabPane key="batch" title="批量提取">
            <BatchExtract csrfToken={csrfToken} onRefreshResults={load} />
          </TabPane>
        </Tabs>
      </Modal>

      {previewImage ? (
        <div className="fullscreen-preview" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <button className="fullscreen-close" type="button" onClick={() => setPreviewImage(null)}>
            关闭
          </button>
          <img
            className="fullscreen-image"
            src={previewImage.url}
            alt={previewImage.filename || "图片预览"}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_USER_FORM = {
  id: null,
  username: "",
  display_name: "",
  password: "",
  role: "user",
  status: "enabled",
};

function UserManagement({ csrfToken }) {
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
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          body: JSON.stringify(payload),
        });
        Message.success("用户已更新");
      } else {
        await jsonFetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
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
          <Button type="primary" onClick={openCreate}>
            新增用户
          </Button>
        </div>
        <Status status={status} />
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
              <tr>
                <th>账号</th>
                <th>用户名称</th>
                <th>角色</th>
                <th>状态</th>
                <th>最近登录</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="user-account-cell">
                      <Text bold>{user.username}</Text>
                      {user.is_super_admin ? <Tag color="gold">超级管理员</Tag> : null}
                    </span>
                  </td>
                  <td>{user.display_name}</td>
                  <td>{user.role === "admin" ? "管理员" : "普通用户"}</td>
                  <td>
                    <Tag color={user.status === "enabled" ? "green" : "gray"}>
                      {user.status === "enabled" ? "启用" : "禁用"}
                    </Tag>
                  </td>
                  <td>{user.last_login_at || "-"}</td>
                  <td>{user.created_at}</td>
                  <td>
                    <Space>
                      <Button size="small" onClick={() => openEdit(user)}>
                        编辑
                      </Button>
                      <Button
                        size="small"
                        status="danger"
                        disabled={user.is_super_admin}
                        onClick={() => deleteUser(user)}
                      >
                        删除
                      </Button>
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
          <Input
            value={form.username}
            disabled={Boolean(form.id)}
            placeholder="登录账号"
            onChange={(value) => setForm({ ...form, username: value })}
          />
          <label>用户名称</label>
          <Input
            value={form.display_name}
            placeholder="用户名称"
            onChange={(value) => setForm({ ...form, display_name: value })}
          />
          <label>{form.id ? "重置密码" : "初始密码"}</label>
          <Input
            value={form.password}
            type="password"
            placeholder={form.id ? "不填写则不修改密码" : "至少 6 位"}
            onChange={(value) => setForm({ ...form, password: value })}
          />
          <div className="user-form-grid">
            <div>
              <label>角色</label>
              <Select
                value={form.role}
                disabled={form.is_super_admin}
                onChange={(value) => setForm({ ...form, role: value })}
              >
                <Option value="user">普通用户</Option>
                <Option value="admin">管理员</Option>
              </Select>
            </div>
            <div>
              <label>状态</label>
              <Select
                value={form.status}
                disabled={form.is_super_admin}
                onChange={(value) => setForm({ ...form, status: value })}
              >
                <Option value="enabled">启用</Option>
                <Option value="disabled">禁用</Option>
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function App() {
  const [session, setSession] = useState({ user: "", display_name: "", csrf_token: "", is_admin: false });
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState("library");
  const [libraryMonths, setLibraryMonths] = useState([]);
  const [activeLibraryMonth, setActiveLibraryMonth] = useState("");

  async function loadSession() {
    try {
      setSession(await jsonFetch("/api/session"));
    } catch {
      window.location.href = "/login";
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  function updateLibraryMonths(months) {
    const nextMonths = Array.isArray(months) ? months : [];
    setLibraryMonths(nextMonths);
    setActiveLibraryMonth((current) => {
      if (current && nextMonths.includes(current)) return current;
      return nextMonths[0] || "";
    });
  }

  const pageTitle = activePage === "users" ? "权限管理" : "CRM图片处理";
  const displayName = session.display_name || session.user || "用户";

  return (
    <ConfigProvider>
      <Layout className="app-shell">
        <Sider className={collapsed ? "app-sider collapsed" : "app-sider"} width={244}>
          <div className="sider-brand">
            <BrandMark />
            {!collapsed ? (
              <div className="brand-copy">
                <Text bold>贵州鑫向晨商贸工作台</Text>
              </div>
            ) : null}
          </div>
          <nav className="side-nav">
            <button
              type="button"
              className={activePage === "library" ? "nav-item active" : "nav-item"}
              title={collapsed ? "CRM图片处理" : undefined}
              onClick={() => setActivePage("library")}
            >
              <NavIcon type="library" />
              {!collapsed ? (
                <span className="nav-copy">
                  <span>CRM图片处理</span>
                </span>
              ) : null}
            </button>
            {activePage === "library" && !collapsed && libraryMonths.length ? (
              <div className="sub-nav">
                {libraryMonths.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={activeLibraryMonth === value ? "sub-nav-item active" : "sub-nav-item"}
                    onClick={() => setActiveLibraryMonth(value)}
                  >
                    {value.replace("-", "")}
                  </button>
                ))}
              </div>
            ) : null}
            {session.is_admin ? (
              <button
                type="button"
                className={activePage === "users" ? "nav-item active" : "nav-item"}
                title={collapsed ? "权限管理" : undefined}
                onClick={() => setActivePage("users")}
              >
                <NavIcon type="users" />
                {!collapsed ? (
                  <span className="nav-copy">
                    <span>权限管理</span>
                  </span>
                ) : null}
              </button>
            ) : null}
          </nav>
          <div className="sider-toggle">
            <Button
              className="sider-toggle-button"
              type="secondary"
              title={collapsed ? "展开侧边栏" : "收起侧边栏"}
              onClick={() => setCollapsed((value) => !value)}
            >
              <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
            </Button>
          </div>
        </Sider>
        <Layout className="workspace-layout">
          <Header className="app-header">
            <div className="header-inner">
              <div className="top-title">{pageTitle}</div>
              <Space>
                <Tag color="green">欢迎您，{displayName}</Tag>
                <Button type="text" href="/logout">
                  退出
                </Button>
              </Space>
            </div>
          </Header>
          <Content className="app-content">
            {activePage === "users" ? (
              <UserManagement csrfToken={session.csrf_token} />
            ) : (
              <ImageLibrary
                csrfToken={session.csrf_token}
                activeMonth={activeLibraryMonth}
                onMonthsChange={updateLibraryMonths}
              />
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
