#!/usr/bin/env python3
"""Apply the Feishu overlay onto the upstream YuqueOut source tree."""
import json
import shutil
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]

def replace_once(content, old, new, label):
    if new in content:
        return content
    if content.count(old) != 1:
        raise RuntimeError(f"{label}: expected exactly one marker, got {content.count(old)}")
    return content.replace(old, new, 1)

def patch(root):
    root = Path(root).resolve()
    if not (root / 'src/core/exporter.js').is_file():
        raise RuntimeError('Target must be the original YuqueOut source directory')
    manifest_path = root / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    if manifest['manifest_version'] != 3:
        raise RuntimeError('Expected Chrome Manifest V3')
    if 'identity' not in manifest['permissions']:
        manifest['permissions'].append('identity')
    for host in ('https://open.feishu.cn/*', 'https://accounts.feishu.cn/*'):
        if host not in manifest['host_permissions']:
            manifest['host_permissions'].append(host)
    manifest.update(name='YuqueOut → Feishu', version='1.2.3', description='语雀知识库一次性迁移到飞书文档')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

    path = root / 'src/background.js'
    content = path.read_text(encoding='utf8')
    content = replace_once(content, "import { sendLog } from './core/messaging.js';",
        "import { sendLog } from './core/messaging.js';\nimport { registerFeishuHandlers } from './feishu/migrator.js';", 'background import')
    content = replace_once(content, 'registerRuntimeHandlers();',
        'registerRuntimeHandlers();\nregisterFeishuHandlers();', 'background registration')
    path.write_text(content, encoding='utf8')

    path = root / 'src/core/exporter.js'
    content = replace_once(path.read_text(encoding='utf8'),
        '  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {\n    dispatchRuntimeMessage',
        "  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {\n    if (message?.action?.startsWith('feishu:')) return false;\n    dispatchRuntimeMessage",
        'export message listener')
    path.write_text(content, encoding='utf8')

    path = root / 'src/popup.html'
    content = replace_once(path.read_text(encoding='utf8'), '<body>',
        '<body>\n<div style="padding:8px 16px;text-align:center;background:#eef3ff"><button id="openFeishuMigration" type="button" style="padding:8px 16px;border:1px solid #3370ff;border-radius:8px;background:white;color:#3370ff;cursor:pointer">迁移到飞书文档 →</button></div>',
        'popup UI')
    path.write_text(content, encoding='utf8')

    path = root / 'src/popup.js'
    content = replace_once(path.read_text(encoding='utf8'),
        "document.addEventListener('DOMContentLoaded', async () => {",
        "document.addEventListener('DOMContentLoaded', async () => {\n  document.getElementById('openFeishuMigration')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('src/feishu.html') }));",
        'popup handler')
    path.write_text(content, encoding='utf8')

    path = root / 'webpack.config.js'
    content = replace_once(path.read_text(encoding='utf8'),
        "    popup: path.resolve(__dirname, 'src/popup.js'),",
        "    popup: path.resolve(__dirname, 'src/popup.js'),\n    feishu: path.resolve(__dirname, 'src/feishu.js'),",
        'webpack entry')
    path.write_text(content, encoding='utf8')

    for src in [*(SOURCE / 'src/feishu').glob('*.js'), SOURCE / 'src/feishu.html', SOURCE / 'src/feishu.js']:
        dest = root / 'src' / src.relative_to(SOURCE / 'src')
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
    print('YuqueOut patched at: ' + str(root))

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/apply.py /path/to/yuqueout')
    patch(sys.argv[1])
