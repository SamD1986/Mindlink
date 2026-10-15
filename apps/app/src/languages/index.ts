/**
 * 语言包：**消息即键**（gettext 风格）。
 *
 * 取值口径：
 *   - 键就是中文原串本身，`zh-CN.json` 的 value 与 key 相同
 *   - 所以 `t('关闭')` 在 zh 下必然逐字节返回 `'关闭'`：抽取是**行为不变**的重构，
 *     不存在「串↔键」映射错位导致界面变字的可能
 *   - 换语言时只改 `CURRENT_LOCALE` 并补一份同键的 en-US.json（键不动，只填 value），
 *     不需要重命名任何键 —— 这是英文包后置也不返工的原因
 *
 * 类型安全：`LocaleKey` 由 zh-CN.json 的键联合而成，写错键名是编译期错误，不做运行时兑底。
 * 品牌串**不进语言包**（换语言时品牌名不变）：单一来源见 `src/shared/brand.ts`。
 */

import zhCN from './zh-CN.json';

export type SupportedLocale = 'zh-CN';

/** 当前语言：暂时只有中文残留，英文包后置（UI-15 二期）。 */
export const CURRENT_LOCALE: SupportedLocale = 'zh-CN';

const LOCALES: Record<SupportedLocale, Record<string, string>> = {
  'zh-CN': zhCN as Record<string, string>,
};

/** 合法键名 = 语言包里的键（漏键 = 编译期报错）。 */
export type LocaleKey = keyof typeof zhCN;

/** 插值参数：模板串里的 `{0}` `{1}` 由这里的同名键填充；缺值时保留占位原样。 */
export type TParams = Record<number, string | number | undefined>;

/**
 * `t(key)` —— 按当前语言取消息；`t(key, params)` —— 顺手填 `{n}` 占位。
 *
 * 示例：
 *   t('关闭')                          // → '关闭'
 *   t('你在 {0} 后停止了', { 0: '3 秒' })  // → '你在 3 秒 后停止了'
 */
export function t(key: LocaleKey, params?: TParams): string {
  const message = LOCALES[CURRENT_LOCALE][key];
  if (typeof message !== 'string') {
    // 编译期已挡住漏键；能走到这里是语言包结构被人为改坏，宁可显形也不要静默回退。
    console.error(`[i18n] missing key "${key}" in locale "${CURRENT_LOCALE}"`);
    return key;
  }
  if (!params) return message;
  return message.replace(/\{(\d+)\}/g, (whole, index) => {
    const value = params[Number(index)];
    return value === undefined ? whole : String(value);
  });
}

/** 动态键名（模型/配置里带来的键，编译期无法穷尽）。 */
export function tDynamic(key: string, params?: TParams): string {
  return t(key as LocaleKey, params);
}
