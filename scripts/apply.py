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
    manifest.update(name='YuqueOut → Feishu', version='1.3.1', description='语雀知识库一次性迁移到飞书文档')
    # Force the migration launcher as the action popup rather than YuqueOut's local export UI.
    manifest['action']['default_popup'] = 'src/feishu-launcher.html'
    manifest['action']['default_title'] = '语雀 → 飞书一次性迁移'
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

    path = root / 'webpack.config.js'
    content = replace_once(path.read_text(encoding='utf8'),
        "    popup: path.resolve(__dirname, 'src/popup.js'),",
        "    popup: path.resolve(__dirname, 'src/popup.js'),\n    feishu: path.resolve(__dirname, 'src/feishu.js'),\n    'feishu-launcher': path.resolve(__dirname, 'src/feishu-launcher.js'),",
        'webpack entry')
    path.write_text(content, encoding='utf8')

    for src in [*(SOURCE / 'src/feishu').glob('*.js'), SOURCE / 'src/feishu.html', SOURCE / 'src/feishu.js', SOURCE / 'src/feishu-launcher.html', SOURCE / 'src/feishu-launcher.js']:
        dest = root / 'src' / src.relative_to(SOURCE / 'src')
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
    print('YuqueOut patched at: ' + str(root))

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/apply.py /path/to/yuqueout')
    patch(sys.argv[1])
