# Widgets 目录

这里放置可以在 workbench 中打开的 widget 组件。

## 当前状态

**过渡包装**：以下四个 widget 是旧页面的过渡包装层，保持原有功能不变，暂未按新架构重写：

- `skills/` - 技能管理（包装 `_legacy-ui/modules/skills.tsx`）
- `work-tree/` - 工作树（包装 `_legacy-ui/modules/work-tree.tsx`）
- `scheduled-tasks/` - 定时任务（包装 `_legacy-ui/management.tsx` 中的 ScheduleManagement）
- `settings/` - 设置（包装 `_legacy-ui/modules/settings.tsx`）

这四个是 **reexport 包装**，不是真正的 DSL widget。后续会按新架构逐个重写。

## 未来规划

真正的 widget 应该：
- 符合 widget DSL 规范
- 可独立打开、关闭、最小化
- 支持在 workbench 中管理
- 遵循统一的生命周期和状态管理
