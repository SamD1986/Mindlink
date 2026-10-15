/**
 * 用户自建 widget 的**纯函数**模型：创作、增删改、导出/导入。
 *
 * 这里不碰存储、不碰 React、不碰 DOM —— 全是可单测的纯数据变换。
 * 存储接缝见 `user-widget-store.ts`，界面见 `user-widgets/studio.tsx`。
 *
 * 红线同 `user-widget-format.ts`：产物是数据、永不执行、校验不过整份拒掉。
 */
import {
  USER_WIDGET_DEFAULT_VERSION,
  USER_WIDGET_FORMAT,
  USER_WIDGET_SCHEMA,
  isPlainObject,
  parseUserWidget,
  validateUserWidgetDSL,
  type UserWidget,
  type UserWidgetError,
  type UserWidgetResult,
} from './user-widget-format.js';
import type { WidgetDSL } from './dsl-format.js';
import { t } from '../../languages/index.js';

/** 导出文件的信封：元数据 + 版本 + 整条 widget 记录。 */
export type UserWidgetFile = {
  readonly format: typeof USER_WIDGET_FORMAT;
  readonly schema: number;
  readonly exportedAt: string;
  readonly widget: UserWidget;
};

function fail<T>(code: UserWidgetError['code'], message: string, path?: string): UserWidgetResult<T> {
  return { ok: false, errors: [path === undefined ? { code, message } : { code, message, path }] };
}

/** 校验一段 DSL JSON 文本（创作预览用）：JSON 合法 + 原子树合法才算过。 */
export function validateUserWidgetText(text: string): UserWidgetResult<WidgetDSL> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return validateUserWidgetDSL(parsed.value);
}

function parseJson(text: string): UserWidgetResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return fail('bad-json', t("DSL 不是合法 JSON"));
  }
}

/**
 * 创作：把「DSL JSON 文本 + 名称」变成一条可保存的 widget 记录。
 * 名称必填；DSL 必须整份通过校验。
 */
export function buildUserWidget(dslText: string, name: string, now: string): UserWidgetResult<UserWidget> {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') return fail('missing-field', t("请填写 widget 名称"), 'name');

  const parsed = parseJson(dslText);
  if (!parsed.ok) return parsed;

  const checked = validateUserWidgetDSL(parsed.value);
  if (!checked.ok) return checked;

  const dsl = checked.value;
  return {
    ok: true,
    value: {
      id: dsl.widgetId,
      name: trimmed,
      version: typeof dsl.version === 'string' && dsl.version !== '' ? dsl.version : USER_WIDGET_DEFAULT_VERSION,
      dsl,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function findUserWidget(list: readonly UserWidget[], id: string): UserWidget | undefined {
  return list.find((widget) => widget.id === id);
}

/** 入库：同 id 已存在则拒（不静默覆盖用户资产）。 */
export function addUserWidget(list: readonly UserWidget[], widget: UserWidget): UserWidgetResult<UserWidget[]> {
  if (list.some((item) => item.id === widget.id)) {
    return fail('duplicate-id', t("已存在同 id 的 widget：{0}", { 0: widget.id }), 'id');
  }
  return { ok: true, value: [...list, widget] };
}

export function removeUserWidget(list: readonly UserWidget[], id: string): UserWidget[] {
  return list.filter((widget) => widget.id !== id);
}

/** 改名（空名不改）。 */
export function renameUserWidget(list: readonly UserWidget[], id: string, name: string, now: string): UserWidget[] {
  const trimmed = name.trim();
  if (trimmed === '') return [...list];
  return list.map((widget) =>
    widget.id === id ? { ...widget, name: trimmed, updatedAt: now } : widget,
  );
}

/** 在库里为 `id-copy` 找一个还没被占用的名字。 */
function uniqueCopyId(list: readonly UserWidget[], id: string): string {
  const taken = new Set(list.map((widget) => widget.id));
  let candidate = `${id}-copy`;
  let index = 2;
  while (taken.has(candidate)) {
    candidate = `${id}-copy-${index}`;
    index += 1;
  }
  return candidate;
}

/** 复制（改名）：副本不继承 pin，产出一份新的、可独立编辑的资产。 */
export function copyUserWidget(list: readonly UserWidget[], id: string, now: string): UserWidgetResult<UserWidget[]> {
  const source = findUserWidget(list, id);
  if (!source) return fail('missing-field', t("找不到 widget：{0}", { 0: id }), 'id');
  const copy: UserWidget = {
    ...source,
    id: uniqueCopyId(list, id),
    name: t("{0} (副本)", { 0: source.name }),
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };
  return { ok: true, value: [...list, copy] };
}

export function buildUserWidgetFile(widget: UserWidget, now: string): UserWidgetFile {
  return { format: USER_WIDGET_FORMAT, schema: USER_WIDGET_SCHEMA, exportedAt: now, widget };
}

/** 序列化成 .widget.json 文本（人类可读，尾随换行）。 */
export function serializeUserWidgetFile(file: UserWidgetFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 导出单份 widget（含元数据与版本）。 */
export function exportUserWidget(widget: UserWidget, now: string): string {
  return serializeUserWidgetFile(buildUserWidgetFile(widget, now));
}

/** 解析 .widget.json 文本：格式、版本与 widget 记录三重校验，非法整份拒收。 */
export function parseUserWidgetFile(text: string): UserWidgetResult<UserWidgetFile> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  if (!isPlainObject(parsed.value)) return fail('not-an-object', t("文件内容必须是一个对象"));

  const envelope = parsed.value;
  if (envelope.format !== USER_WIDGET_FORMAT) {
    return fail('bad-envelope', t("不是 MindLink widget 文件（format 不匹配）"), 'format');
  }
  if (typeof envelope.schema !== 'number') {
    return fail('bad-envelope', t("文件缺少版本号 schema"), 'schema');
  }
  if (envelope.schema > USER_WIDGET_SCHEMA) {
    return fail('bad-envelope', t("文件版本 {0} 高于当前支持的 {1}", { 0: envelope.schema, 1: USER_WIDGET_SCHEMA }), 'schema');
  }

  const widgetResult = parseUserWidget(envelope.widget);
  if (!widgetResult.ok) return widgetResult;

  return {
    ok: true,
    value: {
      format: USER_WIDGET_FORMAT,
      schema: envelope.schema,
      exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : '',
      widget: widgetResult.value,
    },
  };
}

/** 导入：解出文件里的 widget（同样整份校验）。 */
export function importUserWidget(text: string): UserWidgetResult<UserWidget> {
  const parsed = parseUserWidgetFile(text);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value.widget };
}

/** 一步导入并入库：校验不过就拒，同 id 就拒。 */
export function importIntoLibrary(list: readonly UserWidget[], text: string): UserWidgetResult<UserWidget[]> {
  const imported = importUserWidget(text);
  if (!imported.ok) return imported;
  return addUserWidget(list, imported.value);
}
