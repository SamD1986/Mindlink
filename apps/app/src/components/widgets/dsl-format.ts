/**
 * Widget DSL 格式定义与 schema 校验
 * 
 * DSL 是纯数据声明，只包含原子白名单内的组件。
 * 解释器只渲染数据，永不 eval 或动态 import。
 */

/**
 * 原子白名单：允许的基础 UI 组件类型
 */
export const ATOMIC_WHITELIST = [
  'Button',
  'Text',
  'Panel',
  'Tree',
  'List',
  'Input',
  'Checkbox',
  'Select',
  'Divider',
  'Icon',
  'Link',
  'Badge',
  'Tag',
  'Progress',
  'Spinner',
] as const;

export type AtomicType = (typeof ATOMIC_WHITELIST)[number];

/**
 * 原子组件的属性约束
 */
export interface AtomicProps {
  /** 组件类型（必须在白名单内） */
  readonly type: AtomicType;
  /** 属性字典（纯数据，不含函数） */
  readonly props?: Record<string, string | number | boolean | null>;
  /** 子组件列表 */
  readonly children?: ReadonlyArray<AtomicProps | string>;
  /** 组件 key（用于 React 渲染） */
  readonly key?: string;
}

/**
 * Widget DSL 根结构
 */
export interface WidgetDSL {
  /** widget ID（必须在注册表内） */
  readonly widgetId: string;
  /** DSL 版本号 */
  readonly version: string;
  /** 根组件 */
  readonly root: AtomicProps;
  /** 可选的样式声明（内联样式对象） */
  readonly styles?: Record<string, Record<string, string | number>>;
}

/**
 * DSL 校验错误类型
 */
export type DSLValidationError =
  | { type: 'unknown-widget'; widgetId: string }
  | { type: 'unknown-atomic'; atomicType: string; path: string }
  | { type: 'invalid-prop'; atomicType: string; propName: string; propValue: unknown; path: string }
  | { type: 'size-constraint-violation'; widgetId: string; constraint: string; value: number }
  | { type: 'undeclared-capability'; widgetId: string; capability: string };

/**
 * 校验 DSL 是否符合格式规范
 */
export function validateDSL(dsl: WidgetDSL): DSLValidationError[] {
  const errors: DSLValidationError[] = [];

  // 1. 校验 widget 是否在注册表内（需要在运行时导入 registry）
  // 这里只做类型检查，运行时校验在 interpreter 中进行
  
  // 2. 校验原子组件树
  function validateAtomic(atomic: AtomicProps | string, path: string): void {
    if (typeof atomic === 'string') return;

    // 检查类型是否在白名单内
    if (!ATOMIC_WHITELIST.includes(atomic.type as AtomicType)) {
      errors.push({
        type: 'unknown-atomic',
        atomicType: atomic.type,
        path,
      });
      return; // 不继续检查子组件
    }

    // 检查 props 是否只包含纯数据
    if (atomic.props) {
      for (const [key, value] of Object.entries(atomic.props)) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'object' && value !== null && !Array.isArray(value)) {
          errors.push({
            type: 'invalid-prop',
            atomicType: atomic.type,
            propName: key,
            propValue: value,
            path,
          });
        }
      }
    }

    // 递归检查子组件
    if (atomic.children) {
      atomic.children.forEach((child, index) => {
        validateAtomic(child, `${path}.children[${index}]`);
      });
    }
  }

  validateAtomic(dsl.root, 'root');

  return errors;
}

/**
 * 检查类型是否在原子白名单内
 */
export function isValidAtomicType(type: string): type is AtomicType {
  return ATOMIC_WHITELIST.includes(type as AtomicType);
}

/**
 * 创建一个基础的 DSL 模板
 */
export function createEmptyDSL(widgetId: string): WidgetDSL {
  return {
    widgetId,
    version: '1.0.0',
    root: {
      type: 'Panel',
      children: [
        {
          type: 'Text',
          props: { content: 'Empty Widget' },
        },
      ],
    },
  };
}
