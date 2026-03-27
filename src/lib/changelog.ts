export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
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
