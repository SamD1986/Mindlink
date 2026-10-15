/**
 * Widget 清单：白名单注册表
 * 
 * 每个 widget 必须在此注册，声明其能力和约束。
 * 声明能力不等于授予权限，授权仍由 Runtime 决定。
 */

export interface WidgetCapabilities {
  /** 是否可读取用户数据 */
  readonly readUserData?: boolean;
  /** 是否可调用工具 */
  readonly callTools?: boolean;
  /** 是否可访问网络 */
  readonly network?: boolean;
  /** 是否需要文件系统访问 */
  readonly filesystem?: boolean;
}

export interface WidgetSizeConstraints {
  /** 最小宽度（格子数） */
  readonly minWidth?: number;
  /** 最小高度（格子数） */
  readonly minHeight?: number;
  /** 最大宽度（格子数） */
  readonly maxWidth?: number;
  /** 最大高度（格子数） */
  readonly maxHeight?: number;
  /** 默认宽度（格子数） */
  readonly defaultWidth?: number;
  /** 默认高度（格子数） */
  readonly defaultHeight?: number;
}

export interface WidgetRegistration {
  /** widget 唯一标识符 */
  readonly id: string;
  /** 显示标题（支持 i18n key） */
  readonly title: string;
  /** 简短描述 */
  readonly description?: string;
  /** 尺寸约束 */
  readonly size?: WidgetSizeConstraints;
  /** 能力声明 */
  readonly capabilities?: WidgetCapabilities;
  /** 版本号 */
  readonly version?: string;
}

/**
 * Widget 白名单注册表
 * 
 * 已注册的 4 个过渡 widget：
 * - skills: 技能列表
 * - work-tree: 工作树
 * - scheduled-tasks: 定时任务
 * - settings: 设置面板
 */
export const WIDGET_REGISTRY: ReadonlyMap<string, WidgetRegistration> = new Map([
  [
    'skills',
    {
      id: 'skills',
      title: 'Skills',
      description: '技能列表与管理',
      size: {
        minWidth: 2,
        minHeight: 2,
        defaultWidth: 3,
        defaultHeight: 4,
      },
      capabilities: {
        readUserData: true,
      },
      version: '1.0.0',
    },
  ],
  [
    'work-tree',
    {
      id: 'work-tree',
      title: 'Work Tree',
      description: '工作树：文件夹与对话',
      size: {
        minWidth: 2,
        minHeight: 3,
        defaultWidth: 3,
        defaultHeight: 6,
      },
      capabilities: {
        readUserData: true,
      },
      version: '1.0.0',
    },
  ],
  [
    'scheduled-tasks',
    {
      id: 'scheduled-tasks',
      title: 'Scheduled Tasks',
      description: '定时任务列表',
      size: {
        minWidth: 2,
        minHeight: 2,
        defaultWidth: 4,
        defaultHeight: 3,
      },
      capabilities: {
        readUserData: true,
      },
      version: '1.0.0',
    },
  ],
  [
    'settings',
    {
      id: 'settings',
      title: 'Settings',
      description: '设置面板',
      size: {
        minWidth: 2,
        minHeight: 2,
        defaultWidth: 3,
        defaultHeight: 4,
      },
      capabilities: {
        readUserData: true,
      },
      version: '1.0.0',
    },
  ],
]);

/**
 * 检查 widget 是否已注册
 */
export function isRegisteredWidget(id: string): boolean {
  return WIDGET_REGISTRY.has(id);
}

/**
 * 获取 widget 注册信息
 */
export function getWidgetRegistration(id: string): WidgetRegistration | undefined {
  return WIDGET_REGISTRY.get(id);
}
