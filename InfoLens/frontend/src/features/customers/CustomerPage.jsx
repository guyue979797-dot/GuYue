/**
 * 终端明细页面入口（feature 只暴露页面组件）。
 */
import React, { useState } from "../../lib/react.js";
import { Button, Message, Modal, Space } from "../../lib/arco.js";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { useContainerHeight } from "../../hooks/useContainerHeight.js";
import { deleteCustomer } from "../../api/customers.js";
import { useCustomers } from "./useCustomers.js";
import { CustomerFilters } from "./CustomerFilters.jsx";
import { CustomerTable } from "./CustomerTable.jsx";
import { CustomerFormModal } from "./CustomerFormModal.jsx";
import { CustomerImportModal } from "./CustomerImportModal.jsx";
import { CustomerLogsModal } from "./CustomerLogsModal.jsx";
import { showCustomerDetail } from "./CustomerDetail.jsx";

export function CustomerPage({ isAdmin }) {
  const customers = useCustomers();
  const [tableShellRef, tableHeight] = useContainerHeight(52);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsCustomer, setLogsCustomer] = useState(null);

  const peopleOptions = [
    ...new Set([...(customers.salespeople || []), ...(customers.snowSalespeople || [])]),
  ];

  const filterValues = {
    ...customers.filters,
    policyMonth: customers.policyMonth,
    policyTag: customers.policyTag,
  };

  function openCreate() {
    setEditingCustomer(null);
    setFormOpen(true);
  }

  function openEdit(customer) {
    setEditingCustomer(customer);
    setFormOpen(true);
  }

  function removeCustomer(customer) {
    Modal.confirm({
      title: "删除客户档案",
      content: `确定删除 ${customer.terminal_code}｜${customer.customer_name} 吗？删除后终端编码不可重新使用。`,
      okText: "确认删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          await deleteCustomer(customer.id);
          Message.success("客户档案已删除");
          if (customers.items.length === 1 && customers.page > 1) {
            customers.changePage(customers.page - 1);
          } else {
            await customers.loadCustomers();
          }
          await customers.loadCustomerOptions();
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  return (
    <div className="customer-page">
      <div className="customer-filter-card page-card-flat">
        <CustomerFilters
          values={filterValues}
          onDraftChange={customers.setFilterField}
          onPolicyMonthChange={customers.changePolicyMonth}
          onPolicyTagChange={(value) => {
            customers.changePolicyTag(value);
          }}
          onSearch={customers.searchCustomers}
          onReset={customers.resetSearch}
          loading={customers.loading}
          policyMonths={customers.policyMonths}
          policyTagOptions={customers.policyTagOptions}
          routeOptions={customers.routeOptions}
          peopleOptions={peopleOptions}
        />
      </div>

      <div className="customer-list-card page-card-flat">
        <div className="customer-toolbar">
          <div>
            <strong>终端明细</strong>
            <span className="customer-total">共 {customers.total} 条</span>
          </div>
          <Space wrap>
            <Button className="add-button" type="primary" onClick={openCreate}>新增客户</Button>
            {isAdmin ? (
              <Button onClick={() => setImportOpen(true)}>
                批量新增
              </Button>
            ) : null}
          </Space>
        </div>
        <StatusAlert status={customers.status} />
        <div className="customer-table-shell" ref={tableShellRef}>
          <CustomerTable
            items={customers.items}
            total={customers.total}
            page={customers.page}
            pageSize={customers.pageSize}
            loading={customers.loading}
            scrollY={tableHeight}
            isAdmin={isAdmin}
            onDetail={showCustomerDetail}
            onEdit={openEdit}
            onLogs={(customer) => {
              setLogsCustomer(customer);
              setLogsOpen(true);
            }}
            onDelete={removeCustomer}
            onPageChange={customers.changePage}
            onPageSizeChange={customers.changePageSize}
          />
        </div>
      </div>

      <CustomerFormModal
        visible={formOpen}
        customer={editingCustomer}
        salespeople={customers.salespeople}
        snowSalespeople={customers.snowSalespeople}
        onClose={() => setFormOpen(false)}
        onSaved={async () => {
          await customers.loadCustomers();
          await customers.loadCustomerOptions();
        }}
      />

      <CustomerImportModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          await customers.loadCustomers();
          await customers.loadCustomerOptions();
        }}
      />

      <CustomerLogsModal
        visible={logsOpen}
        customer={logsCustomer}
        onClose={() => setLogsOpen(false)}
      />
    </div>
  );
}

export default CustomerPage;
