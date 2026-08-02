/**
 * 产品档案页面入口。
 */
import React, { useState } from "../../lib/react.js";
import { Button, Message, Modal, Select, Space } from "../../lib/arco.js";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { useContainerHeight } from "../../hooks/useContainerHeight.js";
import { getDateParts } from "../../utils/formatters.js";
import { deleteProduct } from "../../api/products.js";
import { useProducts } from "./useProducts.js";
import { ProductFilters } from "./ProductFilters.jsx";
import { ProductTable } from "./ProductTable.jsx";
import { ProductFormModal } from "./ProductFormModal.jsx";
import { ProductImportModal } from "./ProductImportModal.jsx";
import { showProductDetail } from "./ProductDetail.jsx";

const { Option } = Select;

export function ProductPage() {
  const products = useProducts();
  const [tableShellRef, tableHeight] = useContainerHeight(52);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const latestUploadDate = getDateParts(products.latestUploadAt);

  function openCreate() {
    setEditingProduct(null);
    setFormOpen(true);
  }

  function openEdit(product) {
    setEditingProduct(product);
    setFormOpen(true);
  }

  function removeProduct(product) {
    Modal.confirm({
      title: "删除产品档案",
      content: `确定删除“${product.short_name || product.product_name}”吗？`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          await deleteProduct(product.id);
          Message.success("产品档案已删除");
          if (products.items.length === 1 && products.page > 1) {
            products.changePage(products.page - 1);
          } else {
            await products.loadProducts();
          }
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  return (
    <div className="product-page">
      <div className="product-filter-card table-page-filter-card">
        <ProductFilters
          values={products.filters}
          onChange={products.setFilterField}
          onSearch={products.applySearch}
          onReset={products.resetSearch}
          loading={products.loading}
        />
      </div>

      <div className="product-list-card table-page-list-card">
        <div className="product-toolbar table-page-toolbar">
          <div className="table-page-toolbar-title">
            <strong>产品明细</strong>
            <span>本月共 {products.total} 条</span>
          </div>
          <div className="product-overview toolbar-center">
            <div className="product-latest-upload">
              <span>产品明细最新更新时间</span>
              {latestUploadDate ? (
                <strong
                  className="product-date-display"
                  aria-label={`${latestUploadDate.year}年${latestUploadDate.month}月${latestUploadDate.day}日`}
                >
                  <span className="product-date-tag">{latestUploadDate.year}</span><em>年</em>
                  <span className="product-date-tag">{latestUploadDate.month}</span><em>月</em>
                  <span className="product-date-tag">{latestUploadDate.day}</span><em>日</em>
                </strong>
              ) : (
                <strong className="product-date-empty">暂无上传记录</strong>
              )}
            </div>
            <div className="product-summary-metrics">
              <span className="product-summary-metric">
                <Select
                  className="product-month-select"
                  size="small"
                  value={products.summaryMonth || undefined}
                  placeholder="选择月份"
                  onChange={products.changeSummaryMonth}
                >
                  <Option value="all">所有</Option>
                  {products.summaryMonths.map((month) => (
                    <Option key={month} value={month}>{month}</Option>
                  ))}
                </Select>
                <span>已入库</span>
                <strong className="product-summary-tag inbound">
                  {products.monthlyInboundTons.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </strong>
                <span className="product-summary-unit">吨</span>
              </span>
              <span className="product-summary-metric">
                <span>现雪花库存</span>
                <strong className="product-summary-tag inventory">
                  {products.snowInventoryBoxes.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </strong>
                <span className="product-summary-unit">箱</span>
              </span>
            </div>
          </div>
          <Space>
            <Button onClick={() => setUploadOpen(true)}>上传产品明细</Button>
            <Button type="primary" onClick={openCreate}>新增商品</Button>
          </Space>
        </div>
        <StatusAlert status={products.status} className="table-page-status" />
        <div className="table-page-shell" ref={tableShellRef}>
          <ProductTable
            items={products.items}
            total={products.total}
            page={products.page}
            pageSize={products.pageSize}
            loading={products.loading}
            scrollY={tableHeight}
            inventorySort={products.inventorySort}
            onDetail={showProductDetail}
            onEdit={openEdit}
            onDelete={removeProduct}
            onToggleInventorySort={products.toggleInventorySort}
            onPageChange={products.changePage}
            onPageSizeChange={products.changePageSize}
          />
        </div>
      </div>

      <ProductFormModal
        visible={formOpen}
        product={editingProduct}
        onClose={() => setFormOpen(false)}
        onSaved={products.loadProducts}
      />

      <ProductImportModal
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImported={async () => {
          products.changePage(1);
          await products.loadProducts();
        }}
      />
    </div>
  );
}

export default ProductPage;
