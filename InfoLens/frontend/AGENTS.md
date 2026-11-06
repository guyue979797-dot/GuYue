# 前端开发要求

修改本目录代码前，阅读 ../docs/前端开发原则.md；涉及表格必须同时阅读 ../docs/表格设计规范.md。

- 所有新表格使用 components/ui/DataTable.jsx；禁止直接写原生table或绕过容器使用Arco Table。
- 内容自适应、自动宽度上限、拖动、双击恢复由共用组件负责，不复制业务页面实现。
- 自定义复杂单元格提供 widthText，必要时显式声明 minWidth/maxAutoWidth；不硬编码普通固定列宽。
- 保留原有排序、选择、分页、导出、钻取及权限行为。
- 修改完成运行 npm run check 与 npm run build，完成对应交互验证。

## 新增、编辑、详情与确认

- 所有业务表单/详情遵守 ../docs/抽屉与确认弹窗设计规范.md，使用FormDrawer或AppDrawer。
- 禁止新建居中业务Modal、Modal.info详情或直接使用Drawer；Modal仅用于短二次确认。
- 保留权限、必填校验、版本号、预览确认、复制/导出/钻取；保存期间禁止关闭和重复提交。
- 运行npm run check:drawers并完成对应浏览器回归。

- 新增/编辑抽屉的独立字段必须单列，容器使用drawer-field-stack；禁止用双列表单栅格。仅同一逻辑字段的组合控件可同行。

- 应用完整颜色使用--brand-*及语义Token；Arco的--primary-*为RGB通道，仅通过rgb()/rgba()使用，不可重定义或直接用作颜色。
