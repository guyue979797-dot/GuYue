/**
 * 桥接模块：从运行时全局 Arco 暴露标准命名导出。
 * 业务代码统一从此模块导入 Arco 组件，禁止直接访问 window.arco。
 */
const arco = window.arco;

export default arco;
export const {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Grid,
  Image,
  Input,
  Layout,
  Menu,
  Message,
  Modal,
  Pagination,
  Popover,
  Progress,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} = arco;

export const Text = arco.Typography.Text;
