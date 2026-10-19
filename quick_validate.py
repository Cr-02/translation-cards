#!/usr/bin/env python3
"""quick_validate.py — translation-cards 技能格式校验。

用法:
    python quick_validate.py [skill_dir]

检查项:
    1. SKILL.md 存在且含合法 YAML frontmatter
    2. frontmatter 含 name / description，name 与目录名一致
    3. description 长度足够（触发可靠性）
    4. agents/openai.yaml 存在且可被 YAML 解析，version 为 x.y.z
    5. README.md 存在且非空
    6. assets/translation-card.html 存在且含关键结构
    7. tests/ 下存在 core.test.mjs 与 structure.test.mjs

退出码: 0 全部通过; 1 存在错误
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

REQUIRED_KEYS = ("name", "description")
MIN_DESC_LEN = 40


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 SKILL.md 顶部的 YAML frontmatter。"""
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    raw = parts[1]
    if yaml is None:
        data: dict = {}
        lines = raw.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i]
            m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
            if not m:
                i += 1
                continue
            key, val = m.group(1), m.group(2).strip()
            if val in ("|", ">", "|-", ">-"):
                block: list[str] = []
                i += 1
                while i < len(lines) and (not lines[i].strip() or lines[i][:1] in (" ", "\t")):
                    block.append(lines[i].strip())
                    i += 1
                data[key] = " ".join(x for x in block if x)
                continue
            data[key] = val.strip('"').strip("'")
            i += 1
        return data, parts[2]
    try:
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"frontmatter YAML 解析失败: {exc}") from exc
    return data, parts[2]


def check(skill_dir: Path) -> list[str]:
    errors: list[str] = []

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        errors.append("缺少 SKILL.md")
        return errors

    text = skill_md.read_text(encoding="utf-8")
    try:
        meta, body = parse_frontmatter(text)
    except ValueError as exc:
        errors.append(str(exc))
        return errors

    if not meta:
        errors.append("SKILL.md 缺少 YAML frontmatter（需以 --- 开头）")
    for key in REQUIRED_KEYS:
        if not meta.get(key):
            errors.append(f"frontmatter 缺少必填字段: {key}")

    name = str(meta.get("name", "")).strip()
    if name and name != skill_dir.name:
        errors.append(f"name '{name}' 与目录名 '{skill_dir.name}' 不一致")

    desc = str(meta.get("description", "")).strip()
    if desc and len(desc) < MIN_DESC_LEN:
        errors.append(f"description 过短（{len(desc)} 字符 < {MIN_DESC_LEN}），触发可能不可靠")

    if len(body.strip()) < 100:
        errors.append("SKILL.md 正文过短（< 100 字符）")

    yaml_file = skill_dir / "agents" / "openai.yaml"
    if not yaml_file.is_file():
        errors.append("缺少 agents/openai.yaml")
    else:
        yaml_text = yaml_file.read_text(encoding="utf-8")
        m_ver = re.search(r"^version:\s*(\S+)\s*$", yaml_text, re.M)
        if not m_ver:
            errors.append("agents/openai.yaml 缺少 version 字段")
        elif not re.fullmatch(r"\d+\.\d+\.\d+", m_ver.group(1)):
            errors.append(f"agents/openai.yaml 的 version '{m_ver.group(1)}' 不是 x.y.z 语义化版本")
        if yaml is not None:
            try:
                data = yaml.safe_load(yaml_text)
                if not isinstance(data, dict) or not data.get("name"):
                    errors.append("agents/openai.yaml 缺少 name 字段")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"agents/openai.yaml 解析失败: {exc}")

    readme = skill_dir / "README.md"
    if not readme.is_file():
        errors.append("缺少 README.md")
    elif len(readme.read_text(encoding="utf-8").strip()) < 100:
        errors.append("README.md 内容过短")

    html = skill_dir / "assets" / "translation-card.html"
    if not html.is_file():
        errors.append("缺少 assets/translation-card.html")
    else:
        h = html.read_text(encoding="utf-8")
        required_tokens = (
            'id="card"',
            'id="resize"',
            'id="style"',
            'id="autoOn"',
            'id="btnApplyTheme"',
            'id="btnResetTheme"',
            'data-theme',
            'data-grad',
            '@core-begin',
            '@core-end',
            'AbortController',
            'documentPictureInPicture',
            'api.mymemory.translated.net',
        )
        for token in required_tokens:
            if token not in h:
                errors.append(f"translation-card.html 缺少关键结构: {token}")
        if h.count('fetch(') != 1:
            errors.append(f"translation-card.html 应只有 1 处 fetch（发现 {h.count('fetch(')} 处）")

    tests_dir = skill_dir / "tests"
    for name in ("core.test.mjs", "structure.test.mjs"):
        if not (tests_dir / name).is_file():
            errors.append(f"缺少 tests/{name}")

    return errors


def main() -> int:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not target.is_dir():
        print(f"[ERROR] 目录不存在: {target}")
        return 1

    errors = check(target)
    print(f"校验目录: {target}")
    if errors:
        print(f"\n[FAIL] 发现 {len(errors)} 个问题:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("\n[OK] 全部通过: SKILL.md / openai.yaml / README.md / assets / tests 均符合规范")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
