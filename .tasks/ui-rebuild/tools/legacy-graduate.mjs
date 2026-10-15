/**
 * 让「活代码真正在用的旧页面」毕业出归档区：src/_legacy-ui → src/legacy-pages
 *
 * 背景：UI-11 的 chatbox 与 UI-13 的 widget 包装层直接 re-export 归档区，
 * 违反 UI-01 定的「归档件不得被活代码 import」，且带出三条断链
 * （__ 归档区没有 assets/、shared/* 已搬到 components/composites、emo.ts 的 glob 指错）。
 * 本脚本做三件事：git mv、按新深度重写相对路径、把活代码的引用指到新位置。
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/MindLink';
const SRC = `${ROOT}/apps/app/src`;
const FROM = `${SRC}/_legacy-ui`;
const TO = `${SRC}/legacy-pages`;

const FILES = [
  'emo.ts',
  'management.tsx',
  'management.css',
  'ui-registry.ts',
  'modules/assistant-home.tsx',
  'modules/assistant-home.css',
  'modules/hotkey-settings.tsx',
  'modules/model-settings.tsx',
  'modules/settings.tsx',
  'modules/skills.tsx',
  'modules/tailscale-settings.tsx',
  'modules/work-node-icons.tsx',
  'modules/work-tree.tsx',
  'modules/work-tree.css',
];

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString();

for (const rel of FILES) {
  const dest = path.join(TO, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  sh(`git mv "apps/app/src/_legacy-ui/${rel}" "apps/app/src/legacy-pages/${rel}"`);
}
console.log(`已毕业 ${FILES.length} 个文件: src/_legacy-ui → src/legacy-pages`);

// 毕业件自身的相对路径：深度不变，凡是原指向「归档区内已不存在的位形」的都要重指
const fixes = [
  [/from '\.\.\/shared\//g, "from '../../components/composites/"],   // modules/ 里的 ../shared → composites
  [/from '\.\.\/assets\//g, "from '../../assets/"],                  // modules/ 里的 ../assets → src/assets
];

for (const rel of FILES) {
  const file = path.join(TO, rel);
  let text = readFileSync(file, 'utf8');
  const before = text;
  for (const [re, to] of fixes) text = text.replace(re, to);
  if (rel === 'emo.ts') {
    // 品牌图标 glob：原来 './assets/brand/*.png'（= _legacy-ui/assets，早就没有这个目录）
    text = text.replace(/\.\/assets\/brand\/\*\.png/g, '../assets/brand/*.png')
      .replace(/`\.\/assets\/\$\{emo\.brand\.icon\}`/g, '`../assets/${emo.brand.icon}`')
      .replace(/'\.\/assets\/brand\/app-icon\.png'/g, "'../assets/brand/app-icon.png'");
  }
  if (text !== before) { writeFileSync(file, text, 'utf8'); console.log(`  重指路径: ${rel}`); }
}

// 活代码的引用
const live = [
  ['apps/app/src/chatbox/chat.tsx', [
    [/from '\.\.\/_legacy-ui\//g, "from '../legacy-pages/"],
    [/\.\.\/_legacy-ui\/assets\/assistant\/portrait-resting\.png/g, '../assets/assistant/portrait-resting.png'],
  ]],
  ['apps/app/src/components/widgets/skills/index.tsx', [[/from '\.\.\/\.\.\/\.\.\/_legacy-ui\//g, "from '../../../legacy-pages/"]]],
  ['apps/app/src/components/widgets/settings/index.tsx', [[/from '\.\.\/\.\.\/\.\.\/_legacy-ui\//g, "from '../../../legacy-pages/"]]],
  ['apps/app/src/components/widgets/scheduled-tasks/index.tsx', [[/from '\.\.\/\.\.\/\.\.\/_legacy-ui\//g, "from '../../../legacy-pages/"]]],
  ['apps/app/src/components/widgets/work-tree/index.tsx', [[/from '\.\.\/\.\.\/\.\.\/_legacy-ui\//g, "from '../../../legacy-pages/"]]],
];
for (const [rel, subs] of live) {
  const file = path.join(ROOT, rel);
  let text = readFileSync(file, 'utf8');
  const before = text;
  for (const [re, to] of subs) text = text.replace(re, to);
  if (text !== before) { writeFileSync(file, text, 'utf8'); console.log(`  活代码改引用: ${rel}`); }
}

// 残留检查：活代码里不该再有 _legacy-ui 的 import / URL
const rest = sh(`cd apps/app && grep -rn "_legacy-ui" src --include=*.ts --include=*.tsx | grep -v "^src/_legacy-ui" | grep -E "from '|new URL\\(" || true`).trim();
console.log(rest ? `⚠ 仍有残留:\n${rest}` : '✔ 活代码已不再引用归档区');
