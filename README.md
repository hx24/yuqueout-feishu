# YuqueOut → Feishu

Chrome Manifest V3 extension overlay enabling one-time, one-way migration of Yuque documents to Feishu Docs.

> **Experimental — not production verified**: authentication, Feishu API compatibility, and image handling still need end-to-end testing against your accounts. Pilot only, with backups.

## Build

This repo is an overlay of [YuqueOut](https://github.com/Navyum/chrome-extension-yuque) pinned to commit `e348e85d669a13006a3ad0291c71262d5b07e139`. On each push, [GitHub Actions](../../actions/workflows/build.yml) clones upstream, applies the patch and builds a Chrome extension. Download the latest **`yuqueout-feishu-extension-v1.3.0`** artifact from the workflow run and **unzip once**. Select the extracted folder **containing `manifest.json`** in Chrome `chrome://extensions` → Developer mode → Load unpacked. Confirm the extension name is **YuqueOut → Feishu**, version **1.3.0**, and that clicking its icon shows **语雀 → 飞书文档** with the two actions **① 选择知识库 / 获取文档列表** and **② 打开飞书迁移面板**. Remove older copies of the extension to avoid clicking the wrong icon.

For local builds:

```bash
git clone https://github.com/Navyum/chrome-extension-yuque upstream
git -C upstream checkout e348e85d669a13006a3ad0291c71262d5b07e139
python3 scripts/apply.py upstream
cd upstream && npm ci && npm run build
```

Load `upstream/dist` in Chrome. Open the extension popup and choose **① 选择知识库 / 获取文档列表**, sign in to Yuque, select knowledge bases and click **获取文件信息**. Then choose **② 打开飞书迁移面板** in the launcher and configure Feishu. The original **开始导出** button only saves files locally and does **not** migrate to Feishu.

## Feishu OAuth caveat

The implementation uses `chrome.identity.launchWebAuthFlow` with OAuth PKCE, without embedding an App Secret. Set up a Feishu self-built app, required document and drive scopes, and the redirect URI displayed in the extension. **It is not yet confirmed that Feishu supports this public-client PKCE flow for every app configuration.** If Feishu requires a client secret at the token endpoint, do **not** paste that secret into the extension. This is a known blocker until a supported secret-free flow can be verified.

## Scope / limitations

- Regular Yuque **Doc** only; Sheet, Board and Table documents are intentionally excluded.
- Native Feishu editable documents, folder hierarchy, HTTPS images, progress and resumability.
- Completed documents are skipped on rerun; partial documents are marked for manual review, not overwritten.
- Yuque custom blocks, formulas, Mermaid, complex tables, relative-path images and cross-document links might not be preserved.
- Source documents are untouched; no background server or DOCX intermediary. Tokens are stored locally in browser extension storage.
- The repository is **public**; do not commit credentials, cookies, user documents or exports.

## Credit

Integrates with [Navyum's YuqueOut](https://github.com/Navyum/chrome-extension-yuque), whose package.json declares ISC. Preserve the upstream copyright and licensing notices when distributing a derivative.
