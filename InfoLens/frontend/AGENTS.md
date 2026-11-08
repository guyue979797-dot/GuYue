# 前端开发要求

修改本目录代码前，依次阅读 ../docs/前端开发原则.md、../docs/设计规范.md 和 ../docs/页面复测清单.md；涉及表格必须同时阅读 ../docs/表格设计规范.md。

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

## 输入控件焦点

- 遵守../docs/输入控件焦点设计规范.md。一个输入控件只允许一层焦点外框；由Arco本身或data-focus-owner负责，内部编辑器不重复绘制outline、边框及阴影。
- 所有通用输入焦点规则集中在styles/focus.css，禁止业务页面补丁和失效的.arco-input-wrapper选择器。保留错误、警告、禁用、只读及键盘焦点语义。
- 原生文本控件及自定义组合输入必须声明data-focus-owner；执行npm run check:focus和真实浏览器焦点回归。

## 全站样板规范（2026-11-08）

- 以docs/设计规范.md 3.0为视觉与开发契约：8px左右外边距、14px页面标题、可见筛选标签、文字行操作、列宽撑满。
- 顶栏只放导航、通知、头像；业务按钮放内容工具栏。
- 抽屉默认允许遮罩关闭，使用同一取消保护；可编辑表单传入dirty，保存中禁止关闭。新表单用useDraftState初始化/重置基线，不靠DOM猜测dirty。
- 变更后运行npm run check（包含check:ui）与npm run build，并按页面复测清单记录实测/未测；禁止用构建结果代替浏览器回归。
