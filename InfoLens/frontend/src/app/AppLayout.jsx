/**
 * 应用布局：侧栏 / 顶栏 / 面包屑（应用壳职责）。
 */
import React from "../lib/react.js";
import { Button, ConfigProvider, Dropdown, Layout, Menu, Message } from "../lib/arco.js";
import { NAV_ITEMS, getPageTitle } from "./navigation.js";

const { Header, Content, Sider } = Layout;
const { Item: MenuItem } = Menu;

function BrandMark() {
  return (
    <div className="brand-mark">
      <img src="/assets/xinxiangchen-logo.png" alt="鑫向晨" />
    </div>
  );
}

function NavIcon({ type }) {
  let paths = (
    <>
      <path d="M7.5 7.5 9 5h6l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5Z" />
      <path d="M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M18 10h.01" />
    </>
  );
  if (type === "products") {
    paths = (
      <>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        <path d="m8 5.2 8 4.5" />
      </>
    );
  } else if (type === "customers") {
    paths = (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    );
  } else if (type === "users") {
    paths = (
      <>
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
        <path d="M16 10a2.5 2.5 0 1 0 0-5" />
        <path d="M15 14.5a4 4 0 0 1 5.5 3.8" />
      </>
    );
  }
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">{paths}</svg>
    </span>
  );
}

export function AppLayout({
  activePage,
  customerSection,
  collapsed,
  isAdmin,
  displayName,
  libraryMonths,
  activeLibraryMonth,
  onNavigate,
  onSelectLibraryMonth,
  onToggleCollapse,
  children,
}) {
  const pageTitle = getPageTitle(activePage, customerSection);
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <ConfigProvider>
      <Layout className="app-shell">
        <Sider className={collapsed ? "app-sider collapsed" : "app-sider"} width={220}>
          <div className="sider-brand">
            <BrandMark />
          </div>
          <nav className="side-nav">
            {visibleItems.map((item) => (
              <React.Fragment key={item.key}>
                <button
                  type="button"
                  className={activePage === item.key ? "nav-item active" : "nav-item"}
                  title={collapsed ? item.label : undefined}
                  onClick={() => onNavigate(item.key)}
                >
                  <NavIcon type={item.icon} />
                  {!collapsed ? (
                    <span className="nav-copy">
                      <span>{item.label}</span>
                    </span>
                  ) : null}
                </button>
                {activePage === item.key && !collapsed && item.sections?.length ? (
                  <div className={`sub-nav ${item.key === "customers" ? "customer-sub-nav" : ""}`}>
                    {item.sections.map((section) => (
                      <button
                        key={section.key}
                        type="button"
                        className={
                          (item.key === "products" && activePage === "products")
                          || (item.key === "customers" && customerSection === section.key)
                            ? "sub-nav-item active"
                            : "sub-nav-item"
                        }
                        onClick={() => onNavigate(item.key, section.key)}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {activePage === "library" && item.key === "library" && !collapsed && libraryMonths.length ? (
                  <div className="sub-nav">
                    {libraryMonths.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={activeLibraryMonth === value ? "sub-nav-item active" : "sub-nav-item"}
                        onClick={() => onSelectLibraryMonth(value)}
                      >
                        {value.replace("-", "")}
                      </button>
                    ))}
                  </div>
                ) : null}
              </React.Fragment>
            ))}
          </nav>
          <div className="sider-toggle">
            <Button
              className="sider-toggle-button"
              type="secondary"
              title={collapsed ? "展开侧边栏" : "收起侧边栏"}
              onClick={onToggleCollapse}
            >
              <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
            </Button>
          </div>
        </Sider>
        <Layout className="workspace-layout">
          <Header className="app-header">
            <div className="topbar">
              <nav className="breadcrumbs" aria-label="当前位置">
                <button type="button" className="breadcrumb-link" onClick={() => onNavigate("library")}>首页</button>
                <span className="breadcrumb-separator" aria-hidden="true">›</span>
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => onNavigate(activePage === "customers" ? "customers" : activePage)}
                >
                  {activePage === "products" ? "产品档案" : activePage === "users" ? "权限管理" : activePage === "customers" ? "客户档案" : "CRM图片处理"}
                </button>
                <span className="breadcrumb-separator" aria-hidden="true">›</span>
                <span className="breadcrumb-current">{pageTitle}</span>
              </nav>
              <div className="topbar-actions">
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="帮助"
                  title="帮助"
                  onClick={() => Message.info("可使用左侧导航切换模块")}
                >
                  ?
                </button>
                <button
                  className="icon-btn notification-btn"
                  type="button"
                  aria-label="通知"
                  title="通知"
                  onClick={() => Message.info("暂无新的系统通知")}
                >
                  ♢
                  <span className="notification-dot" aria-hidden="true" />
                </button>
                <Dropdown
                  droplist={(
                    <Menu>
                      <MenuItem disabled>{displayName}</MenuItem>
                      <MenuItem onClick={() => { window.location.href = "/logout"; }}>退出登录</MenuItem>
                    </Menu>
                  )}
                  trigger="click"
                  position="br"
                  getPopupContainer={() => document.body}
                >
                  <button className="user-chip" type="button" aria-label="打开用户菜单">
                    <span className="user-avatar" aria-hidden="true">{displayName.slice(0, 1)}</span>
                    <span>{displayName}</span>
                    <span aria-hidden="true">⌄</span>
                  </button>
                </Dropdown>
              </div>
            </div>
          </Header>
          <Content
            className={
              activePage === "library"
                ? "app-content library-content"
                : activePage === "customers" || activePage === "products"
                  ? "app-content customer-content"
                  : "app-content"
            }
          >
            {children}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default AppLayout;
