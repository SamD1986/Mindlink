/**
 * Widget DSL 解释器
 * 
 * 只渲染数据，永不 eval 或动态 import。
 * 符合 CSP script-src 'self' 约束。
 */

import { type ReactNode } from 'react';
import { WIDGET_REGISTRY } from './registry';
import {
  type WidgetDSL,
  type AtomicProps,
  type DSLValidationError,
  validateDSL,
  isValidAtomicType,
} from './dsl-format';

/**
 * 解释器错误
 */
export class DSLInterpreterError extends Error {
  constructor(
    message: string,
    public readonly errors: DSLValidationError[],
  ) {
    super(message);
    this.name = 'DSLInterpreterError';
  }
}

/**
 * 原子组件渲染映射
 * 
 * 这里只使用静态导入的组件，不做动态加载。
 * 所有组件都是纯数据驱动，不接受函数 props。
 */
const ATOMIC_COMPONENTS = {
  Button: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <button
      type="button"
      disabled={props?.disabled as boolean | undefined}
      style={props?.style as React.CSSProperties | undefined}
      data-variant={props?.variant as string | undefined}
    >
      {children}
    </button>
  ),
  Text: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <span
      style={props?.style as React.CSSProperties | undefined}
      data-variant={props?.variant as string | undefined}
    >
      {props?.content as string | undefined || children}
    </span>
  ),
  Panel: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <div
      style={props?.style as React.CSSProperties | undefined}
      data-variant={props?.variant as string | undefined}
    >
      {children}
    </div>
  ),
  Tree: ({ props }: { props?: Record<string, unknown> }) => (
    <div
      style={props?.style as React.CSSProperties | undefined}
      data-component="tree"
      data-placeholder="Tree component"
    >
      [Tree: {props?.items ? String(props.items) : 'empty'}]
    </div>
  ),
  List: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <ul
      style={props?.style as React.CSSProperties | undefined}
      data-variant={props?.variant as string | undefined}
    >
      {children}
    </ul>
  ),
  Input: ({ props }: { props?: Record<string, unknown> }) => (
    <input
      type="text"
      placeholder={props?.placeholder as string | undefined}
      value={props?.value as string | undefined}
      disabled={props?.disabled as boolean | undefined}
      style={props?.style as React.CSSProperties | undefined}
      readOnly
    />
  ),
  Checkbox: ({ props }: { props?: Record<string, unknown> }) => (
    <input
      type="checkbox"
      checked={props?.checked as boolean | undefined}
      disabled={props?.disabled as boolean | undefined}
      style={props?.style as React.CSSProperties | undefined}
      readOnly
    />
  ),
  Select: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <select
      value={props?.value as string | undefined}
      disabled={props?.disabled as boolean | undefined}
      style={props?.style as React.CSSProperties | undefined}
    >
      {children}
    </select>
  ),
  Divider: ({ props }: { props?: Record<string, unknown> }) => (
    <hr style={props?.style as React.CSSProperties | undefined} />
  ),
  Icon: ({ props }: { props?: Record<string, unknown> }) => (
    <span
      style={props?.style as React.CSSProperties | undefined}
      data-icon={props?.name as string | undefined}
      aria-label={props?.label as string | undefined}
    >
      {/* Icon placeholder */}
    </span>
  ),
  Link: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <a
      href={props?.href as string | undefined}
      style={props?.style as React.CSSProperties | undefined}
      target={props?.target as string | undefined}
      rel={props?.target === '_blank' ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  Badge: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <span
      style={props?.style as React.CSSProperties | undefined}
      data-component="badge"
      data-variant={props?.variant as string | undefined}
    >
      {children}
    </span>
  ),
  Tag: ({ props, children }: { props?: Record<string, unknown>; children?: ReactNode }) => (
    <span
      style={props?.style as React.CSSProperties | undefined}
      data-component="tag"
      data-variant={props?.variant as string | undefined}
    >
      {children}
    </span>
  ),
  Progress: ({ props }: { props?: Record<string, unknown> }) => (
    <progress
      value={props?.value as number | undefined}
      max={props?.max as number | undefined}
      style={props?.style as React.CSSProperties | undefined}
    />
  ),
  Spinner: ({ props }: { props?: Record<string, unknown> }) => (
    <div
      style={props?.style as React.CSSProperties | undefined}
      data-component="spinner"
      aria-label="Loading"
    >
      ⏳
    </div>
  ),
} as const;

/**
 * 渲染原子组件
 */
function renderAtomic(atomic: AtomicProps | string, index: number): ReactNode {
  // 字符串节点直接返回
  if (typeof atomic === 'string') {
    return atomic;
  }

  // 检查类型有效性
  if (!isValidAtomicType(atomic.type)) {
    return (
      <div key={atomic.key || index} style={{ color: 'red' }}>
        [Unknown atomic type: {atomic.type}]
      </div>
    );
  }

  // 获取对应的组件
  const Component = ATOMIC_COMPONENTS[atomic.type];

  // 渲染子组件
  const children = atomic.children?.map((child, idx) => renderAtomic(child, idx));

  return (
    <Component key={atomic.key || index} props={atomic.props}>
      {children}
    </Component>
  );
}

/**
 * 解释并渲染 Widget DSL
 *
 * @param allowedWidgetIds 额外放行的 widget id 集合（用户自建 widget 不在内置注册表里，
 *   由调用方显式放行它自己的 id）。不传则只认内置注册表。
 * @throws {DSLInterpreterError} 当 DSL 格式无效时
 */
export function interpretDSL(dsl: WidgetDSL, allowedWidgetIds?: ReadonlySet<string>): ReactNode {
  // 1. 校验 widget 是否被放行（内置注册表 ∪ 调用方显式放行的 id）
  const allowed = WIDGET_REGISTRY.has(dsl.widgetId) || (allowedWidgetIds?.has(dsl.widgetId) ?? false);
  if (!allowed) {
    throw new DSLInterpreterError(`Unknown widget: ${dsl.widgetId}`, [
      { type: 'unknown-widget', widgetId: dsl.widgetId },
    ]);
  }

  // 2. 校验 DSL 格式
  const errors = validateDSL(dsl);
  if (errors.length > 0) {
    throw new DSLInterpreterError(
      `DSL validation failed with ${errors.length} error(s)`,
      errors,
    );
  }

  // 3. 渲染根组件
  return (
    <div data-widget-id={dsl.widgetId} data-widget-version={dsl.version}>
      {renderAtomic(dsl.root, 0)}
    </div>
  );
}

/**
 * 放行并渲染一份**用户自建** widget 的 DSL。
 *
 * 只放行它自己的 id —— 这是"数据不是代码"的落点：用户定义带来的只是一个 id 与一棵原子树，
 * 没有可执行钩子，也没有第二个执行环境。
 */
export function interpretUserWidgetDSL(dsl: WidgetDSL): ReactNode {
  return interpretDSL(dsl, new Set([dsl.widgetId]));
}

/**
 * 安全地尝试解释 DSL，失败时返回错误信息
 */
export function safeInterpretDSL(dsl: WidgetDSL): ReactNode {
  try {
    return interpretDSL(dsl);
  } catch (error) {
    if (error instanceof DSLInterpreterError) {
      return (
        <div style={{ padding: '1rem', color: 'red', border: '1px solid red' }}>
          <strong>DSL Interpreter Error:</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
            {error.message}
            {'\n\n'}
            {JSON.stringify(error.errors, null, 2)}
          </pre>
        </div>
      );
    }
    throw error;
  }
}
