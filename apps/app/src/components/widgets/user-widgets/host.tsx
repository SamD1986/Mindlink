/**
 * 画布里的用户 widget 宿主：按 id 从存储取回 DSL，交给解释器渲染。
 *
 * 渲染路径与内置 widget 完全一致（静态导入的原子组件），**不加载任何用户代码**。
 */
import { interpretUserWidgetDSL } from '../dsl-interpreter.js';
import { useUserWidget } from './use-user-widgets.js';
import './widgets.css';
import { t } from '../../../languages/index.js';

export function UserWidgetHost({ id }: { id: string }) {
  const widget = useUserWidget(id);

  if (!widget) {
    return (
      <section className="workbench-user-widget" data-user-widget-missing={id}>
        <p className="workbench-user-widget-note">{t("找不到这个 widget，可能已被删除。")}</p>
      </section>
    );
  }

  return (
    <section
      className="workbench-user-widget"
      data-user-widget={widget.id}
      data-user-widget-version={widget.version}
    >
      {interpretUserWidgetDSL(widget.dsl)}
    </section>
  );
}
