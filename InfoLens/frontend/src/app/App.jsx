/**
 * 应用壳（重构要求 4.1）：仅负责会话、权限、应用布局和页面组合。
 */
import "../styles.css";
import React, { useEffect, useState } from "../lib/react.js";
import { getSession } from "../api/http.js";
import { AppLayout } from "./AppLayout.jsx";
import { PhotoLibraryPage } from "../features/photos/PhotoLibraryPage.jsx";
import { CustomerPage } from "../features/customers/CustomerPage.jsx";
import { SnowPolicyPage } from "../features/snow-policies/SnowPolicyPage.jsx";
import { ProductPage } from "../features/products/ProductPage.jsx";
import { UserPage } from "../features/users/UserPage.jsx";

export function App() {
  const [session, setSession] = useState({
    user: "",
    display_name: "",
    csrf_token: "",
    is_admin: false,
  });
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState("library");
  const [customerSection, setCustomerSection] = useState("terminals");
  const [libraryMonths, setLibraryMonths] = useState([]);
  const [activeLibraryMonth, setActiveLibraryMonth] = useState("");

  async function loadSession() {
    try {
      setSession(await getSession({ force: true }));
    } catch {
      window.location.href = "/login";
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  function navigate(page, section) {
    if (page === "customers") {
      setCustomerSection(section || "terminals");
    }
    setActivePage(page);
  }

  function updateLibraryMonths(months) {
    const nextMonths = Array.isArray(months) ? months : [];
    setLibraryMonths(nextMonths);
    setActiveLibraryMonth((current) => {
      if (current && nextMonths.includes(current)) return current;
      return nextMonths[0] || "";
    });
  }

  const displayName = session.display_name || session.user || "用户";

  let content;
  if (activePage === "users") {
    content = <UserPage />;
  } else if (activePage === "products") {
    content = <ProductPage />;
  } else if (activePage === "customers") {
    content =
      customerSection === "policies"
        ? <SnowPolicyPage isAdmin={session.is_admin} />
        : <CustomerPage isAdmin={session.is_admin} />;
  } else {
    content = (
      <PhotoLibraryPage
        activeMonth={activeLibraryMonth}
        onMonthsChange={updateLibraryMonths}
      />
    );
  }

  return (
    <AppLayout
      activePage={activePage}
      customerSection={customerSection}
      collapsed={collapsed}
      isAdmin={session.is_admin}
      displayName={displayName}
      libraryMonths={libraryMonths}
      activeLibraryMonth={activeLibraryMonth}
      onNavigate={navigate}
      onSelectLibraryMonth={setActiveLibraryMonth}
      onToggleCollapse={() => setCollapsed((value) => !value)}
    >
      {content}
    </AppLayout>
  );
}

export default App;
