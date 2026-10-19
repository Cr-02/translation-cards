// tests/core.test.mjs — 从 assets/translation-card.html 抽取纯逻辑并做单元测试
// 运行：node --test tests/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(here, '..', 'assets', 'translation-card.html');
const html = readFileSync(HTML, 'utf8');

// 抽取 /* @core-begin ... */ 与 /* @core-end */ 之间的纯逻辑段
const m = html.match(/\/\* @core-begin[^\n]*\n([\s\S]*?)\/\* @core-end \*\//);
assert.ok(m, 'HTML 中找不到 @core-begin/@core-end 标记');

const api = new Function(
  m[1] +
  '\nreturn {detectLang,isMeaningfulText,splitSentences,applyStyle,' +
  'makeGradient,normalizeAngle,pickPalette,serializeTheme,parseTheme,' +
  'STYLE_RULES,GRADIENT_PRESETS,PRESET_NAMES,LANG_NAMES,STYLE_NAMES,isHex};'
)();

const {
  detectLang, isMeaningfulText, splitSentences, applyStyle,
  makeGradient, normalizeAngle, pickPalette, serializeTheme, parseTheme,
  GRADIENT_PRESETS, PRESET_NAMES, LANG_NAMES, STYLE_NAMES, isHex
} = api;

/* ---------------- 语言识别 ---------------- */
test('detectLang: 假名优先于汉字（日语不会被误判成中文）', () => {
  assert.equal(detectLang('こんにちは'), 'ja');
  assert.equal(detectLang('日本語のテキストです'), 'ja');
  assert.equal(detectLang('吾輩は猫である。名前はまだ無い。'), 'ja');
  assert.equal(detectLang('你好世界'), 'zh-CN');
});

test('detectLang: 谚文、西里尔、阿拉伯、默认英语', () => {
  assert.equal(detectLang('안녕하세요'), 'ko');
  assert.equal(detectLang('Привет, мир'), 'ru');
  assert.equal(detectLang('مرحبا بالعالم'), 'ar');
  assert.equal(detectLang('Hello world'), 'en');
  assert.equal(detectLang('Bonjour le monde'), 'en');
});

test('detectLang: 汉字与假名混排仍判为日语', () => {
  assert.equal(detectLang('東京へ行きます'), 'ja');
});

/* ---------------- 可翻译性判断 ---------------- */
test('isMeaningfulText: 纯数字/符号/空白不触发翻译', () => {
  assert.equal(isMeaningfulText('12345'), false);
  assert.equal(isMeaningfulText('!@#$%^&*()'), false);
  assert.equal(isMeaningfulText('   '), false);
  assert.equal(isMeaningfulText('hello'), true);
  assert.equal(isMeaningfulText('中文'), true);
  assert.equal(isMeaningfulText('123 号'), true);
  // 链接里带字母，按"有可翻译字符"处理（与页面行为一致）
  assert.equal(isMeaningfulText('https://example.com/'), true);
});

/* ---------------- 分块 ---------------- */
test('splitSentences: 拼接后与原文完全一致（不丢字符）', () => {
  const text = 'First sentence. Second one! Third? 第四句。第五句！';
  for (const max of [10, 20, 400]) {
    const chunks = splitSentences(text, max);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(c => c.length > 0));
  }
});

test('splitSentences: 单块不超过上限（除非整句本身就超长）', () => {
  const text = 'a'.repeat(5) + '. ' + 'b'.repeat(50) + '.';
  const chunks = splitSentences(text, 10);
  assert.equal(chunks.join(''), text);
  // 只有超长句自身可以超过上限
  assert.ok(chunks.filter(c => c.length > 10).length === 1);
});

test('splitSentences: 保留换行且不产生空块', () => {
  const chunks = splitSentences('第一行\n第二行\n', 400);
  assert.equal(chunks.join(''), '第一行\n第二行\n');
  assert.ok(chunks.every(c => c.trim().length > 0));
});

test('splitSentences: 空字符串返回空数组', () => {
  assert.deepEqual(splitSentences('', 100), []);
});

/* ---------------- 风格（语域）转换 ---------------- */
test('applyStyle: 标准模式原样返回', () => {
  const t = '这真是个好主意，我们现在就做吧。';
  assert.equal(applyStyle(t, 'zh-CN', 'neutral'), t);
  assert.equal(applyStyle(t, 'en', 'neutral'), t);
});

test('applyStyle: 中文专业模式做书面化', () => {
  const out = applyStyle('这真是个好主意，我们现在就做吧。', 'zh-CN', 'formal');
  assert.ok(out.includes('目前'), '现在 → 目前');
  assert.ok(!out.includes('吧'), '句末语气词被去掉');
  assert.ok(out.startsWith('这真是个好主意'), '语义开头保持');
});

test('applyStyle: 中文口语模式做口语化', () => {
  const out = applyStyle('因此我们立即开展了这项工作。', 'zh-CN', 'casual');
  assert.ok(out.includes('所以'), '因此 → 所以');
  assert.ok(out.includes('马上'), '立即 → 马上');
  assert.ok(out.includes('搞'), '开展 → 搞');
});

test('applyStyle: 英文专业模式展开缩写', () => {
  const out = applyStyle("It's a lot of work, but we can't do it now.", 'en', 'formal');
  assert.ok(out.includes('It is'), 'It\'s → It is');
  assert.ok(out.includes('cannot'), "can't → cannot");
  assert.ok(out.includes('a considerable amount of'), 'a lot of → 书面表达');
});

test('applyStyle: 英文口语模式反向收缩', () => {
  const out = applyStyle('It is not possible, therefore we obtained it.', 'en', 'casual');
  assert.ok(out.includes("It isn't"), 'It is not → It isn\'t');
  assert.ok(out.includes(', so we got it'), 'therefore/obtained → so/got');
});

test('applyStyle: 转换后句首大写不被破坏', () => {
  assert.equal(applyStyle("It's fine.", 'en', 'formal'), 'It is fine.');
  assert.equal(applyStyle("Don't worry. It's fine.", 'en', 'formal'), 'Do not worry. It is fine.');
});

test('applyStyle: 日语 / 韩语模式', () => {
  assert.ok(applyStyle('簡単だ。', 'ja', 'formal').includes('である'));
  assert.ok(applyStyle('簡単である。', 'ja', 'casual').includes('だ。'));
  assert.equal(applyStyle('안녕해요', 'ko', 'formal'), '안녕합니다');
  assert.equal(applyStyle('안녕합니다', 'ko', 'casual'), '안녕해요');
});

test('applyStyle: 未配置规则的语言保持原样，不抛错', () => {
  const t = 'Bonjour le monde';
  for (const lang of ['fr', 'de', 'es', 'ru', 'ar', 'xx']) {
    assert.equal(applyStyle(t, lang, 'formal'), t);
    assert.equal(applyStyle(t, lang, 'casual'), t);
  }
});

test('applyStyle: 规则表结构合法（每条都是 [RegExp, string]）', () => {
  const langs = Object.keys(api.STYLE_RULES);
  assert.ok(langs.includes('zh-CN') && langs.includes('en'));
  for (const lang of langs) {
    for (const style of ['formal', 'casual']) {
      const rules = api.STYLE_RULES[lang][style];
      assert.ok(Array.isArray(rules) && rules.length > 0, `${lang}/${style} 规则为空`);
      for (const r of rules) {
        assert.ok(r[0] instanceof RegExp, `${lang}/${style} 第 1 项不是正则`);
        assert.equal(typeof r[1], 'string');
      }
    }
  }
});

/* ---------------- 渐变与配色 ---------------- */
test('isHex: 只接受 6 位十六进制', () => {
  assert.equal(isHex('#ffffff'), true);
  assert.equal(isHex('ffffff'), false);
  assert.equal(isHex('#fff'), false);
  assert.equal(isHex('#ffffffff'), false);
  assert.equal(isHex('red'), false);
});

test('makeGradient: 生成合法 CSS 并小写归一', () => {
  assert.equal(makeGradient('#FF9A9E', '#FAD0C4', 135),
    'linear-gradient(135deg, #ff9a9e, #fad0c4)');
  assert.equal(makeGradient('#000000', '#ffffff', '45'),
    'linear-gradient(45deg, #000000, #ffffff)');
});

test('makeGradient: 非法色值回退，不把任意字符串拼进 CSS', () => {
  const g = makeGradient('red; background:url(x)', null, 90);
  assert.equal(g, 'linear-gradient(90deg, #ffffff, #e5e7eb)');
  assert.ok(!g.includes('url('));
});

test('normalizeAngle: 限幅到 0-359 整数', () => {
  assert.equal(normalizeAngle(135), 135);
  assert.equal(normalizeAngle(-30), 330);
  assert.equal(normalizeAngle(400), 40);
  assert.equal(normalizeAngle('abc'), 135);
  assert.equal(normalizeAngle(45.6), 46);
});

test('pickPalette: 浅色渐变配深色文字，深色渐变配浅色文字', () => {
  assert.equal(pickPalette('#ffffff', '#e0f2fe').fg, '#1f2328');
  assert.equal(pickPalette('#4b5563', '#111827').fg, '#f2f4f8');
  assert.ok(pickPalette('#ffffff', '#e0f2fe').surface.startsWith('rgba(255,255,255'));
  assert.ok(pickPalette('#4b5563', '#111827').surface.startsWith('rgba(17,24,39'));
});

test('渐变预设：7 套且颜色合法', () => {
  const names = Object.keys(GRADIENT_PRESETS);
  assert.equal(names.length, 7);
  for (const n of names) {
    const g = GRADIENT_PRESETS[n];
    assert.ok(isHex(g.from) && isHex(g.to), `${n} 色值非法`);
    assert.equal(typeof g.name, 'string');
    assert.equal(normalizeAngle(g.angle), g.angle);
  }
});

/* ---------------- 主题存取 ---------------- */
test('serializeTheme / parseTheme: 预设往返一致', () => {
  for (const name of Object.keys(PRESET_NAMES)) {
    const spec = { type: 'preset', name };
    assert.deepEqual(parseTheme(serializeTheme(spec)), spec);
  }
});

test('serializeTheme / parseTheme: 渐变往返一致', () => {
  const spec = { type: 'gradient', name: 'custom', from: '#7dd3fc', to: '#a78bfa', angle: 135 };
  assert.equal(serializeTheme(spec), 'gradient:#7dd3fc|#a78bfa|135|custom');
  assert.deepEqual(parseTheme(serializeTheme(spec)), spec);
});

test('parseTheme: 兼容 v0.1.0 旧值（预设名与自定义纯色）', () => {
  assert.deepEqual(parseTheme('dark'), { type: 'preset', name: 'dark' });
  assert.deepEqual(parseTheme('#ff0000'),
    { type: 'gradient', name: 'custom', from: '#ff0000', to: '#ff0000', angle: 135 });
});

test('parseTheme: 脏数据/注入串被清洗或回退', () => {
  for (const bad of ['', 'xyz', 'gradient:red|blue|0', 'preset:nope', null, undefined,
                     'gradient:#fff|#000|0']) {
    assert.deepEqual(parseTheme(bad), { type: 'preset', name: 'light' }, String(bad));
  }
  // 带额外 CSS 片段的串：只取合法色值，角度非法则回退 135，且序列化结果里不能出现注入内容
  const injected = parseTheme('gradient:#ffffff|#000000|0;background:url(x)');
  assert.equal(injected.type, 'gradient');
  assert.equal(injected.angle, 135);
  const back = serializeTheme(injected);
  assert.ok(!back.includes('url(') && !back.includes(';'), '序列化结果混入注入内容: ' + back);
});

/* ---------------- 名称表 ---------------- */
test('语言与风格名称覆盖界面所有取值', () => {
  for (const v of ['zh-CN','en','ja','ko','fr','de','es','ru']) {
    assert.ok(LANG_NAMES[v], `${v} 缺中文名`);
  }
  assert.deepEqual(Object.keys(STYLE_NAMES), ['neutral', 'formal', 'casual']);
  assert.deepEqual(Object.keys(PRESET_NAMES), ['light', 'dark', 'green']);
});
