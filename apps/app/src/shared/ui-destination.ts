/**
 * 导航目标：一个**类型接缝**，用来支撑旧件向新结构的过渡。
 *
 * 旧实现把它定义在 `src/ui-registry.ts`（已归档）。渲染层里仍在用的展示件
 * （如 `shared/app-icon.tsx`）需要这个联合类型，因此单独留在 `shared/`。
 * 左栏的入口清单会在 UI-05 重新定义，届时以那里为准，本文件随之下线。
 */
export type UiDestination = 'work' | 'assistant' | 'skills' | 'schedules' | 'knowledge' | 'settings';
