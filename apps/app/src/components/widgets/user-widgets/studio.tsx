/**
 * 自建 widget 创作台：**创作 → 校验 → 预览 → 保存 → 固定到左栏 → 导入/导出**。
 *
 * 这一页是整条闭环的界面入口（从画布标签 `widget-studio` 打开）。要点：
 *   - 用户给的是一份 **DSL JSON 文本**（数据），不是代码；
 *   - 预览走的就是同一渲染进程的原子组件解释器，**没有 iframe / webview / eval**；
 *   - 校验不通过就整份拒掉并列出可读错误，不做半份容错；
 *   - 保存进的是存储接缝（当前 localStorage 过渡），**重启后仍在**，并可固定到左栏。
 */
import { useState, type ChangeEvent } from 'react';
import { useWorkspace } from '../../../shell/workspace.js';
import { interpretUserWidgetDSL } from '../dsl-interpreter.js';
import type { WidgetDSL } from '../dsl-format.js';
import {
  addUserWidget,
  buildUserWidget,
  copyUserWidget,
  exportUserWidget,
  importIntoLibrary,
  removeUserWidget,
  validateUserWidgetText,
} from '../user-widget-model.js';
import type { UserWidget, UserWidgetError } from '../user-widget-format.js';
import { setUserWidgetPinned, userWidgetStore } from '../user-widget-store.js';
import { userWidgetTabId } from '../user-widget-tabs.js';
import { useUserWidgets } from './use-user-widgets.js';
import './widgets.css';
import { t } from '../../../languages/index.js';

/**
 * 起手式：一段能直接跑通的最小 DSL。
 * 里面的文案是**用户数据**（widget 内容），不是界面文案，所以不进语言包。
 */
const STARTER_DSL = JSON.stringify(
  {
    widgetId: 'my-first-widget',
    version: '1.0.0',
    root: {
      type: 'Panel',
      props: { variant: 'card' },
      children: [
        { type: 'Text', props: { content: 'Hello from my widget' } },
        { type: 'Divider' },
        { type: 'Text', props: { content: 'Edit the JSON on the left, then preview.' } },
      ],
    },
  },
  null,
  2,
);

const nowIso = (): string => new Date().toISOString();

export function WidgetStudio() {
  const { openLayout } = useWorkspace();
  const store = userWidgetStore;
  const widgets = useUserWidgets(store);

  const [dslText, setDslText] = useState(STARTER_DSL);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<UserWidgetError[]>([]);
  const [preview, setPreview] = useState<WidgetDSL | null>(null);
  const [notice, setNotice] = useState('');
  const [importText, setImportText] = useState('');
  const [exported, setExported] = useState('');

  const openWidget = (widget: UserWidget) => {
    openLayout({
      id: userWidgetTabId(widget.id),
      label: widget.name,
      labelKey: `nav.layout.${userWidgetTabId(widget.id)}`,
    });
  };

  const handleValidate = () => {
    const result = validateUserWidgetText(dslText);
    if (!result.ok) {
      setPreview(null);
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setPreview(result.value);
    setNotice('');
  };

  const handleSave = () => {
    const built = buildUserWidget(dslText, name, nowIso());
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    const added = addUserWidget(widgets, built.value);
    if (!added.ok) {
      setErrors(added.errors);
      return;
    }
    setErrors([]);
    setPreview(built.value.dsl);
    setNotice(t("{0} 已保存", { 0: built.value.name }));
    void store.save(added.value);
  };

  const handleRemove = (id: string) => {
    void store.save(removeUserWidget(widgets, id));
  };

  const handleCopy = (id: string) => {
    const result = copyUserWidget(widgets, id, nowIso());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setNotice(t("已复制为一份新的 widget"));
    void store.save(result.value);
  };

  const handlePin = (id: string) => {
    void setUserWidgetPinned(store, id, true);
    setNotice(t("已固定到左栏"));
  };

  const handleExport = (widget: UserWidget) => {
    const text = exportUserWidget(widget, nowIso());
    setExported(text);
    download(`${widget.id}.widget.json`, text);
  };

  const handleImportText = (text: string) => {
    const result = importIntoLibrary(widgets, text);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setNotice(t("已导入 widget"));
    void store.save(result.value);
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then(handleImportText);
    event.target.value = '';
  };

  return (
    <div className="widget-studio" data-widget-studio>
      <header className="widget-studio-head">
        <h2 className="widget-studio-title">{t("我的 Widget")}</h2>
        <p className="widget-studio-hint">{t("粘贴一份 DSL JSON，校验、预览后命名保存；保存的 widget 可固定到左栏。")}</p>
      </header>

      <div className="widget-studio-create">
        <label className="widget-studio-field">
          <span>DSL JSON</span>
          <textarea
            className="widget-studio-dsl"
            data-widget-studio-dsl
            value={dslText}
            spellCheck={false}
            onChange={(event) => setDslText(event.target.value)}
          />
        </label>

        <label className="widget-studio-field">
          <span>{t("名称")}</span>
          <input
            className="widget-studio-name"
            data-widget-studio-name
            value={name}
            placeholder={t("给这个 widget 起个名字")}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="widget-studio-actions">
          <button type="button" data-widget-studio-action="validate" onClick={handleValidate}>{t("校验并预览")}</button>
          <button type="button" data-widget-studio-action="save" onClick={handleSave}>{t("保存")}</button>
        </div>

        {errors.length > 0 && (
          <ul className="widget-studio-errors" data-widget-studio-errors>
            {errors.map((error, index) => (
              <li key={`${error.code}-${index}`} data-widget-error={error.code}>{error.message}</li>
            ))}
          </ul>
        )}

        {notice !== '' && <p className="widget-studio-notice" data-widget-studio-notice>{notice}</p>}

        {preview && (
          <div className="widget-studio-preview" data-widget-studio-preview>
            <span className="widget-studio-preview-label">{t("预览")}</span>
            {interpretUserWidgetDSL(preview)}
          </div>
        )}
      </div>

      <section className="widget-studio-library">
        <h3 className="widget-studio-section-title">{t("我的 widget（")}{widgets.length}）</h3>
        {widgets.length === 0 && <p className="widget-studio-empty">{t("还没有自建 widget。")}</p>}
        <ul className="widget-studio-list" data-widget-library>
          {widgets.map((widget) => (
            <li key={widget.id} className="widget-studio-item" data-widget-item={widget.id}>
              <span className="widget-studio-item-name">{widget.name}</span>
              <span className="widget-studio-item-version">v{widget.version}</span>
              <span className="widget-studio-item-actions">
                <button type="button" data-widget-action="open" onClick={() => openWidget(widget)}>{t("打开")}</button>
                <button type="button" data-widget-action="pin" onClick={() => handlePin(widget.id)}>{t("固定到左栏")}</button>
                <button type="button" data-widget-action="copy" onClick={() => handleCopy(widget.id)}>{t("复制")}</button>
                <button type="button" data-widget-action="export" onClick={() => handleExport(widget)}>{t("导出")}</button>
                <button type="button" data-widget-action="delete" onClick={() => handleRemove(widget.id)}>{t("删除")}</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="widget-studio-io">
        <h3 className="widget-studio-section-title">{t("导入 / 导出")}</h3>
        <label className="widget-studio-field">
          <span>{t("导入 .widget.json")}</span>
          <input type="file" accept=".json,application/json" data-widget-studio-file onChange={handleImportFile} />
        </label>
        <textarea
          className="widget-studio-import"
          data-widget-studio-import
          value={importText}
          placeholder={t("或直接粘贴 .widget.json 内容")}
          spellCheck={false}
          onChange={(event) => setImportText(event.target.value)}
        />
        <div className="widget-studio-actions">
          <button
            type="button"
            data-widget-studio-action="import"
            onClick={() => handleImportText(importText)}
            disabled={importText.trim() === ''}
          >
            {t("导入")}
          </button>
        </div>
        {exported !== '' && (
          <pre className="widget-studio-export" data-widget-studio-export>{exported}</pre>
        )}
      </section>
    </div>
  );
}

/** 触发浏览器下载：纯数据落地成文件，不经过任何执行路径。 */
function download(filename: string, text: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
