# InfoLens 前端开发入口

开始任何前端功能开发、缺陷修复或重构前，必须依次阅读：

1. [`../docs/前端开发原则.md`](../docs/前端开发原则.md)
2. [`../docs/前端代码重构要求.md`](../docs/前端代码重构要求.md)
3. [`../docs/设计规范.md`](../docs/设计规范.md) 与 [`../docs/页面复测清单.md`](../docs/页面复测清单.md)

开发任务必须完成《前端开发原则》中的“开发前置检查”，提交前必须完成“开发完成检查”。

禁止继续向 `src/App.jsx` 和 `src/styles/legacy.css` 增加新的业务实现；新功能应进入对应的 `features/`、`components/`、`api/` 或 `utils/` 目录。


表格开发必须遵守[表格设计规范](../docs/表格设计规范.md)，并运行 `npm run check`。

业务表单、详情及钻取遵守[抽屉与确认弹窗设计规范](../docs/抽屉与确认弹窗设计规范.md)，执行 `npm run check:drawers`；确认弹窗保留用于删除等二次确认。

所有输入框遵守[输入控件焦点设计规范](../docs/输入控件焦点设计规范.md)，焦点规则集中在`styles/focus.css`，执行`npm run check:focus`，不得在业务页面叠加第二层焦点外框。

## UI 整改交互样板

在本目录运行 `npm run demo`，打开 <http://127.0.0.1:5180/>。
样板复用现有公共组件，使用本地模拟数据，修改刷新后恢复。
实现与验收记录见 [`../docs/ui-demo-round1/README.md`](../docs/ui-demo-round1/README.md)。
