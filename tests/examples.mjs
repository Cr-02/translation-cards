// tests/examples.mjs — 生成 README 用的真实译例（需要联网，不属于自动化测试）
// 运行：node tests/examples.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'assets', 'translation-card.html'), 'utf8');
const core = html.match(/\/\* @core-begin[^\n]*\n([\s\S]*?)\/\* @core-end \*\//)[1];
const { detectLang, splitSentences, applyStyle } = new Function(
  core + '\nreturn {detectLang, splitSentences, applyStyle};'
)();

async function translateChunk(text, from, to) {
  const url = 'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) + '&langpair=' + encodeURIComponent(from + '|' + to);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const t = data.responseData && data.responseData.translatedText;
  if (!t) throw new Error('未获得译文: ' + JSON.stringify(data).slice(0, 200));
  return t;
}

async function translate(text, to) {
  const from = detectLang(text);
  const isCJK = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text);
  const parts = [];
  for (const c of splitSentences(text, isCJK ? 150 : 400)) parts.push(await translateChunk(c, from, to));
  return { from, raw: parts.join('') };
}

const CASES = [
  ["It's a lot of work, but we can't do it now.", 'zh-CN'],
  ['因此我们立即开展了这项工作，效果非常明显。', 'en'],
  ['吾輩は猫である。名前はまだ無い。', 'zh-CN']
];

for (const [text, to] of CASES) {
  const { from, raw } = await translate(text, to);
  console.log('原文（' + from + '→' + to + '）: ' + text);
  console.log('  接口原始译文: ' + raw);
  for (const style of ['neutral', 'formal', 'casual']) {
    const s = applyStyle(raw, to, style);
    console.log('  ' + style.padEnd(7) + ': ' + s + (s === raw ? '   （与本条规则无匹配）' : ''));
  }
  console.log('');
}
