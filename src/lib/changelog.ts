export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "0.4.1",
    date: "2026-03-28",
    changes: [
      "修复更新日志不显示 v0.4.0 新功能的问题",
      "新增 UI 样式统一：按钮、面板、对话框风格柔和化"
    ]
  },
  {
    version: "0.4.0",
    date: "2026-03-28",
    changes: [
      "新增 library.json 内存缓存层，大幅提升 Dashboard 加载速度",
      "新增 Toast 通知系统，所有操作均有即时反馈",
      "新增自定义确认对话框，替代原生 window.confirm",
      "Dashboard 新增可更新实例检测面板，支持一键全部更新",
      "项目页新增批量操作：多选实例 + 批量更新",
      "新增命令面板 (Ctrl+K)，快速搜索技能、工作区、命令",
      "Activity 日志增强：按类型过滤 + 关键词搜索"
    ]
  },
  {
    version: "0.3.8",
    date: "2026-03-27",
    changes: [
      "修复更新对话框关闭按钮样式",
      "修复更新日志不显示的问题"
    ]
  },
  {
    version: "0.3.7",
    date: "2026-03-27",
    changes: [
      "移除侧边栏顶部 HtyApp 标题区域，界面更简洁"
    ]
  },
  {
    version: "0.3.6",
    date: "2026-03-27",
    changes: [
      "新增版本更新独立对话框，替换原右下角浮窗通知",
      "新增更新日志功能，展示每个版本的变更内容"
    ]
  },
  {
    version: "0.3.5",
    date: "2026-03-27",
    changes: [
      "任务支持双击编辑标题和描述",
      "任务优先级支持随时点击切换",
      "新建任务时优先级选择器美化为彩色圆点"
    ]
  },
  {
    version: "0.3.4",
    date: "2026-03-27",
    changes: [
      "优化任务排序：非完成任务统一排序，已完成任务排到底部"
    ]
  },
  {
    version: "0.3.3",
    date: "2026-03-27",
    changes: [
      "新增任务组功能，支持按组归类管理任务",
      "任务进度系统：未开始→进行中→待测试→已完成",
      "支持任务回退和返工流程",
      "兼容旧版任务数据自动迁移"
    ]
  },
  {
    version: "0.3.2",
    date: "2026-03-26",
    changes: [
      "发布初始版本"
    ]
  }
];
