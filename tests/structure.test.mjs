// tests/structure.test.mjs — 卡片页面的结构冒烟测试（不依赖浏览器）
// 运行：node --test tests/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const html = readFileSync(path.join(root, 'assets', 'translation-card.html'), 'utf8');

function idAttrs(src) {
  const ids = new Set();
  for (const m of src.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

test('必需的元素 id 都存在', () => {
  const ids = idAttrs(html);
  const required = [
    'card', 'head', 'resize', 'src', 'out', 'target', 'style', 'err', 'errMsg',
    'settings', 'live', 'themeState', 'autoOn', 'gradFrom', 'gradTo', 'gradAngle',
    'btnApplyTheme', 'btnResetTheme', 'btnTranslate', 'btnClear', 'btnRetry',
    'btnSettings', 'btnPin', 'btnFloat'
  ];
  for (const id of required) assert.ok(ids.has(id), `缺少 id="${id}"`);
});

test('DOM 里每个 getElementById 的目标 id 都真实存在', () => {
  const ids = idAttrs(html);
  for (const m of html.matchAll(/getElementById\('([^']+)'\)/g)) {
    assert.ok(ids.has(m[1]), `脚本引用了不存在的 id="${m[1]}"`);
  }
});

test('页面中不再残留 v0.1.0 的 customBg 纯色输入', () => {
  assert.ok(!html.includes('id="customBg"'));
});

test('内联脚本语法正确（只解析不执行）', () => {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, '找不到内联 <script>');
  assert.doesNotThrow(() => new Function(m[1]), '内联脚本存在语法错误');
});

test('纯逻辑段标记存在且唯一', () => {
  assert.equal((html.match(/@core-begin/g) || []).length, 1);
  assert.equal((html.match(/@core-end/g) || []).length, 1);
  // 标记段内不应出现 DOM API，保证可被 node 直接抽取测试
  const core = html.match(/\/\* @core-begin[^\n]*\n([\s\S]*?)\/\* @core-end \*\//)[1];
  assert.ok(!/document\.|window\.|localStorage/.test(core), 'core 段混入了 DOM 依赖');
});

test('主题相关样式变量齐全（渐变靠 --bg / --page-bg / --surface 驱动）', () => {
  for (const v of ['--bg', '--surface', '--page-bg', '--fg', '--line', '--head']) {
    assert.ok(html.includes(v + ':'), `样式缺少变量 ${v}`);
  }
  assert.ok(html.includes('body{background:var(--page-bg)'));
});

test('渐变预设按钮与确认按钮在设置面板内', () => {
  const panel = html.match(/<div class="settings" id="settings">([\s\S]*?)<\/div>\s*<textarea/)[1];
  assert.ok(panel.includes('data-grad="sunrise"'), '缺少渐变预设');
  assert.ok((panel.match(/data-grad="/g) || []).length >= 5, '渐变预设少于 5 个');
  assert.ok(panel.includes('id="btnApplyTheme"'), '确认按钮不在设置面板内');
  assert.ok(panel.includes('id="autoOn"'), '实时翻译开关不在设置面板内');
});

test('风格与目标语言下拉框取值符合约定', () => {
  const styles = [...html.matchAll(/<select id="style"[\s\S]*?<\/select>/g)][0][0];
  for (const v of ['neutral', 'formal', 'casual']) {
    assert.ok(styles.includes(`value="${v}"`), `风格缺少 ${v}`);
  }
  const targets = [...html.matchAll(/<select id="target"[\s\S]*?<\/select>/g)][0][0];
  for (const v of ['zh-CN', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru']) {
    assert.ok(targets.includes(`value="${v}"`), `目标语言缺少 ${v}`);
  }
});

test('实时翻译：输入与粘贴都挂上了自动触发，且保留手动兜底', () => {
  assert.ok(/src\.addEventListener\('input'/.test(html), '缺少 input 自动翻译');
  assert.ok(/src\.addEventListener\('paste'/.test(html), '缺少 paste 自动翻译');
  assert.ok(/scheduleTranslate\(/.test(html), '缺少防抖调度');
  assert.ok(/AbortController/.test(html), '缺少取消上一次请求的能力');
  assert.ok(/id="btnTranslate"/.test(html), '缺少手动翻译按钮');
});

test('Document PiP 与拖动/缩放/复位逻辑仍在', () => {
  assert.ok(html.includes('documentPictureInPicture.requestWindow'));
  assert.ok(html.includes("head.addEventListener('mousedown'"));
  assert.ok(html.includes("resize.addEventListener('mousedown'"));
  assert.ok(html.includes("document.getElementById('btnPin').addEventListener"));
  assert.ok(html.includes('Math.max(320') && html.includes('Math.max(220'));
});

test('没有引入外部脚本或网络资源', () => {
  assert.ok(!/<script[^>]+src=/.test(html), '不应有外链脚本');
  assert.ok(!/<link[^>]+href="http/.test(html), '不应有外链样式');
  const fetches = [...html.matchAll(/fetch\(/g)].length;
  assert.equal(fetches, 1, '应只有一处 fetch');
  assert.ok(html.includes('api.mymemory.translated.net'));
});
