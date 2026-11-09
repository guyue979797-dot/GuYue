/**
 * 商品档案页面入口。
 */
import React, { useState } from "../../lib/react.js";
import { Button, Message, Modal, Space } from "../../lib/arco.js";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { useContainerHeight } from "../../hooks/useContainerHeight.js";
import { getDateParts } from "../../utils/formatters.js";
import { deleteProduct } from "../../api/products.js";
import { useProducts } from "./useProducts.js";
import { ProductBrandTree } from "./ProductBrandTree.jsx";
import { ProductTable } from "./ProductTable.jsx";
import { ProductDrawer } from "./ProductDrawer.jsx";
import { ProductImportModal } from "./ProductImportModal.jsx";


export function ProductPage() {
  const products = useProducts();
  const [tableShellRef, tableHeight] = useContainerHeight(64);
  const [formOpen, setFormOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("detail");
  const [editingProduct, setEditingProduct] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const latestUploadDate = getDateParts(products.latestUploadAt);

  function openCreate() {
    setEditingProduct(null);
    setDrawerMode("create");
    setFormOpen(true);
  }

  function openEdit(product) {
    setEditingProduct(product);
    setDrawerMode("edit");
    setFormOpen(true);
  }

  function openDetail(product) {
    setEditingProduct(product);
    setDrawerMode('detail');
    setFormOpen(true);
  }

  function removeProduct(product) {
    Modal.confirm({
      title: "删除商品档案",
      content: `确定删除“${product.short_name || product.product_name}”吗？`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          await deleteProduct(product.id);
          Message.success("商品档案已删除");
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
    <div className="product-catalog">
      <ProductBrandTree brands={products.brands} selectedKey={products.brandKey} onSelect={products.selectBrand} />
      <div className="product-page">
      <div className="product-list-card table-page-list-card">
        <div className="product-toolbar table-page-toolbar">
          <div className="table-page-toolbar-title">
            <strong>商品档案</strong>
            <span>共 {products.total} 条</span>
          </div>
          <div className="product-overview toolbar-center">
            <div className="product-latest-upload">
              <span>更新于</span>
              {latestUploadDate ? (
                <time className="product-date-display" dateTime={`${latestUploadDate.year}-${latestUploadDate.month}-${latestUploadDate.day}`}>
                  {latestUploadDate.year}-{latestUploadDate.month}-{latestUploadDate.day}
                </time>
              ) : (
                <strong className="product-date-empty">暂无上传记录</strong>
              )}
            </div>
            <div className="product-summary-metrics">
              <span className="product-summary-metric">
                <span>累计入库</span>
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
            <Button onClick={() => setUploadOpen(true)}>上传商品</Button>
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
            onDetail={openDetail}
            onEdit={openEdit}
            onDelete={removeProduct}
            onToggleInventorySort={products.toggleInventorySort}
            onPageChange={products.changePage}
            onPageSizeChange={products.changePageSize}
          />
        </div>
      </div>

      </div>
      <ProductDrawer
        visible={formOpen}
        product={editingProduct}
        mode={drawerMode}
        onModeChange={setDrawerMode}
        onClose={() => setFormOpen(false)}
        onSaved={async saved => {
          setEditingProduct(saved);
          setDrawerMode('detail');
          await products.loadProducts();
        }}
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
