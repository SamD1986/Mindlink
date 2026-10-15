/**
 * 用户自建 widget：格式定义与「整份」校验。
 *
 * ── 红线（不可动摇，改动前先读 ARCHITECTURE「三条不可动摇的约束」）──
 *   1. DSL 是**数据不是代码**：本模块只做 JSON → 纯数据的搬运与检查，永不 eval、
 *      永不 new Function、永不动态求值，也不引入任意模块路径。JSON 文本里就算写着
 *      动态求值、脚本标签、require 之类，也只是普通字符串，不会被当成代码执行。
 *   2. **不引入沙箱 iframe / webview**：预览走的就是同一渲染进程里的原子组件白名单，
 *      没有第二个执行环境，也就没有"逃逸"可言。
 *   3. **校验失败一律拒掉整份**：任何一条错误都让整份 DSL 不通过，不做"猜一半"的容错，
 *      避免半成品被保存进用户资产。
 *
 * 原子白名单与属性约束在 `dsl-format.ts`；这里补上用户资产特有的字段、命名与体积上限。
 */
import {
  type AtomicProps,
  type WidgetDSL,
  validateDSL,
} from './dsl-format.js';
import { isRegisteredWidget } from './registry.js';
import { t } from '../../languages/index.js';

/** 单份 widget 的原子节点上限（防止 LLM 产出的巨型声明拖垮渲染）。 */
export const USER_WIDGET_MAX_NODES = 200;
/** 原子树的嵌套深度上限。 */
export const USER_WIDGET_MAX_DEPTH = 24;
/** DSL 未声明版本时的兜底版本号。 */
export const USER_WIDGET_DEFAULT_VERSION = '1.0.0';

/** 导出文件的格式标识（导入时据此判断是不是本产品的 widget 文件里）。 */
export const USER_WIDGET_FORMAT = 'mindlink.widget';
/** 文件 schema 版本号；高版本文件一律拒收（不做向下兼容的猜测）。 */
export const USER_WIDGET_SCHEMA = 1;

/** 用户自建 widget 记录：一份纯数据资产。 */
export type UserWidget = {
  /** widget 唯一标识（= 其 DSL 的 widgetId）。 */
  readonly id: string;
  /** 用户可读名称。 */
  readonly name: string;
  /** 语义化版本号。 */
  readonly version: string;
  /** 纯数据视图声明。 */
  readonly dsl: WidgetDSL;
  /** 创建时间（ISO 字符串）。 */
  readonly createdAt: string;
  /** 最近更新时间（ISO 字符串）。 */
  readonly updatedAt: string;
  /** 是否已固定到左栏（随 widget 一起持久化，是用户资产的一部分）。 */
  readonly pinned?: boolean;
};

export type UserWidgetErrorCode =
  | 'bad-json'
  | 'not-an-object'
  | 'missing-field'
  | 'invalid-field'
  | 'duplicate-id'
  | 'unknown-atomic'
  | 'invalid-prop'
  | 'too-large'
  | 'reserved-id'
  | 'bad-envelope';

/** 可读错误：`code` 供机核与分支判断，`message` 供界面展示。 */
export type UserWidgetError = {
  readonly code: UserWidgetErrorCode;
  readonly message: string;
  readonly path?: string;
};

export type UserWidgetResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: UserWidgetError[] };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail<T>(code: UserWidgetErrorCode, message: string, path?: string): UserWidgetResult<T> {
  return { ok: false, errors: [path === undefined ? { code, message } : { code, message, path }] };
}

/** 统计原子树的节点数与最大深度（字符串节点不计入）。 */
function measure(node: AtomicProps | string, depth: number): { nodes: number; depth: number } {
  if (typeof node === 'string') return { nodes: 0, depth };
  let nodes = 1;
  let maxDepth = depth;
  for (const child of node.children ?? []) {
    const child1 = measure(child, depth + 1);
    nodes += child1.nodes;
    if (child1.depth > maxDepth) maxDepth = child1.depth;
  }
  return { nodes, depth: maxDepth };
}

/**
 * 校验一份 DSL 是否为合法的用户 widget 声明。
 *
 * 通过 = 返回被收窄的 `WidgetDSL`；不通过 = 返回逐条可读的错误，调用方**必须整份拒掉**。
 */
export function validateUserWidgetDSL(input: unknown): UserWidgetResult<WidgetDSL> {
  if (!isPlainObject(input)) return fail('not-an-object', t("widget 定义必须是一个对象"));

  const errors: UserWidgetError[] = [];
  const widgetId = input.widgetId;
  if (typeof widgetId !== 'string' || widgetId.trim() === '') {
    errors.push({ code: 'missing-field', message: t("缺少 widgetId"), path: 'widgetId' });
  }
  if (input.version !== undefined && typeof input.version !== 'string') {
    errors.push({ code: 'invalid-field', message: t("version 必须是字符串"), path: 'version' });
  }

  const root = input.root;
  if (!isPlainObject(root)) {
    errors.push({ code: 'missing-field', message: t("缺少 root（根组件必须是对象）"), path: 'root' });
    return { ok: false, errors };
  }

  // widgetId 不能占用内置 widget 的 id，否则会和注册表撞车。
  if (typeof widgetId === 'string' && isRegisteredWidget(widgetId)) {
    errors.push({ code: 'reserved-id', message: t("widgetId \"{0}\" 已被内置 widget 占用", { 0: widgetId }), path: 'widgetId' });
  }

  // 原子树：未知原子 / 函数或对象属性，一律来自白名单校验器。
  for (const error of validateDSL(input as unknown as WidgetDSL)) {
    if (error.type === 'unknown-atomic') {
      errors.push({ code: 'unknown-atomic', message: t("未知原子：{0}", { 0: error.atomicType }), path: error.path });
    } else if (error.type === 'invalid-prop') {
      errors.push({
        code: 'invalid-prop',
        message: t("{0}.{1} 的属性不是纯数据（函数/对象一律不收）", { 0: error.atomicType, 1: error.propName }),
        path: error.path,
      });
    } else if (error.type === 'size-constraint-violation') {
      errors.push({ code: 'too-large', message: t("{0} 违反尺寸约束：{1}", { 0: error.widgetId, 1: error.constraint }), path: 'root' });
    } else if (error.type === 'unknown-widget') {
      errors.push({ code: 'invalid-field', message: t("未放行的 widget：{0}", { 0: error.widgetId }), path: 'widgetId' });
    } else {
      errors.push({ code: 'invalid-field', message: t("未声明能力：{0}", { 0: error.capability }), path: 'root' });
    }
  }

  const size = measure(root as unknown as AtomicProps, 1);
  if (size.nodes > USER_WIDGET_MAX_NODES) {
    errors.push({ code: 'too-large', message: t("原子节点 {0} 个，超过上限 {1}", { 0: size.nodes, 1: USER_WIDGET_MAX_NODES }), path: 'root' });
  }
  if (size.depth > USER_WIDGET_MAX_DEPTH) {
    errors.push({ code: 'too-large', message: t("嵌套深度 {0} 层，超过上限 {1}", { 0: size.depth, 1: USER_WIDGET_MAX_DEPTH }), path: 'root' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as WidgetDSL };
}

/**
 * 解析一条已保存/导入的 widget 记录。
 *
 * 与 `validateUserWidgetDSL` 的区别：这里连记录级字段（id / name / 版本）一起校验，
 * 用于从存储或文件还原时做「防坏」检查 —— 坏掉的一条会被丢弃而不是污染列表。
 */
export function parseUserWidget(input: unknown): UserWidgetResult<UserWidget> {
  if (!isPlainObject(input)) return fail('not-an-object', t("widget 记录必须是一个对象"));

  const errors: UserWidgetError[] = [];
  const id = input.id;
  const name = input.name;
  if (typeof id !== 'string' || id.trim() === '') {
    errors.push({ code: 'missing-field', message: t("缺少 id"), path: 'id' });
  }
  if (typeof name !== 'string' || name.trim() === '') {
    errors.push({ code: 'missing-field', message: t("缺少 name"), path: 'name' });
  }

  const version = typeof input.version === 'string' && input.version !== ''
    ? input.version
    : USER_WIDGET_DEFAULT_VERSION;
  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : '';
  const updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : '';

  const dslResult = validateUserWidgetDSL(input.dsl);
  if (!dslResult.ok) {
    errors.push(...dslResult.errors);
  } else if (typeof id === 'string' && dslResult.value.widgetId !== id) {
    errors.push({ code: 'invalid-field', message: t("dsl.widgetId 与记录 id 不一致"), path: 'dsl.widgetId' });
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: UserWidget = {
    id: id as string,
    name: name as string,
    version,
    dsl: (dslResult as { ok: true; value: WidgetDSL }).value,
    createdAt,
    updatedAt,
  };
  // pinned 逐字保留：缺键就是缺键，避免往返（导出→导入）时凭空多出一个字段。
  if (typeof input.pinned === 'boolean') {
    return { ok: true, value: { ...value, pinned: input.pinned } };
  }
  return { ok: true, value };
}
