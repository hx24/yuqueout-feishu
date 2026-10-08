# YuqueOut → Feishu

Chrome Manifest V3 extension overlay enabling one-time, one-way migration of Yuque documents to Feishu Docs.

> **Experimental — not production verified**: authentication, Feishu API compatibility, and image handling still need end-to-end testing against your accounts. Pilot only, with backups.

## Build

This repo is an overlay of [YuqueOut](https://github.com/Navyum/chrome-extension-yuque) pinned to commit `e348e85d669a13006a3ad0291c71262d5b07e139`. On each push, [GitHub Actions](../../actions/workflows/build.yml) clones upstream, applies the patch and builds a Chrome extension. Download the latest **`yuqueout-feishu-extension-v1.3.1`** artifact from the workflow run and **unzip once**. Select the extracted folder **containing `manifest.json`** in Chrome `chrome://extensions` → Developer mode → Load unpacked. Confirm the extension name is **YuqueOut → Feishu**, version **1.3.0**, and that clicking its icon shows **语雀 → 飞书文档** with the two actions **① 选择知识库 / 获取文档列表** and **② 打开飞书迁移面板**. Remove older copies of the extension to avoid clicking the wrong icon.

For local builds:

```bash
git clone https://github.com/Navyum/chrome-extension-yuque upstream
git -C upstream checkout e348e85d669a13006a3ad0291c71262d5b07e139
python3 scripts/apply.py upstream
cd upstream && npm ci && npm run build
```

Load `upstream/dist` in Chrome. Open the extension popup and choose **① 选择知识库 / 获取文档列表**, sign in to Yuque, select knowledge bases and click **获取文件信息**. Then choose **② 打开飞书迁移面板** in the launcher and configure Feishu. The original **开始导出** button only saves files locally and does **not** migrate to Feishu.

## 飞书授权（v1.3.1）

v1.3.0 的无 App Secret PKCE 授权，部分飞书自建应用返回 `The auth method is not supported`。v1.3.1 已改为以下两种方式：

**方式 A：自己使用的飞书自建应用 App ID + App Secret**

1. 在 [飞书开放平台](https://open.feishu.cn/)「凭证与基础信息」复制 App ID 和 App Secret。绝对不要把 Secret 提交到 GitHub、聊天或截图。
2. 在应用「安全设置」中登记插件页面展示的 OAuth 回调地址（`https://<extension-id>.chromiumapp.org/feishu`）。
3. 申请飞书云文档/云盘所需权限，并确保应用对当前账号可用。
4. 在本地插件填写 App ID 与 App Secret，正常浏览器 OAuth 授权。
5. Secret 和 Token 只存储于 `chrome.storage.session`，本次浏览器会话结束即清除，不写入 `chrome.storage.local` 或 GitHub；在会话内可以使用 Secret 刷新 Token。

**风险提示**：浏览器扩展是公开客户端，无法像服务端可靠保护长期密钥。因此方式 A 只适合本人、受信任浏览器、一次性迁移。不要作为公共扩展向其他用户收集 App Secret。

**方式 B：短期 user_access_token（不向插件提供 App Secret）**

1. 如果能通过飞书 API 调试台以用户身份取得 `user_access_token`，可在插件「方式 B」粘贴 Token。
2. 插件调用飞书用户信息接口验证 Token。不要使用 `tenant_access_token`。
3. 令牌有效期通常约两小时；过期后手动获取新令牌并重新输入，无法自动刷新。
4. 无论哪种方式，都要为应用配置足够的云文档/云盘权限。

不要尝试把飞书网页登录 Cookie 当作 API Token。
## Scope / limitations

- Regular Yuque **Doc** only; Sheet, Board and Table documents are intentionally excluded.
- Native Feishu editable documents, folder hierarchy, HTTPS images, progress and resumability.
- Completed documents are skipped on rerun; partial documents are marked for manual review, not overwritten.
- Yuque custom blocks, formulas, Mermaid, complex tables, relative-path images and cross-document links might not be preserved.
- Source documents are untouched; no background server or DOCX intermediary. Credentials are stored in Chrome session-only extension storage; migration progress is kept in local storage.
- The repository is **public**; do not commit credentials, cookies, user documents or exports.

## Credit

Integrates with [Navyum's YuqueOut](https://github.com/Navyum/chrome-extension-yuque), whose package.json declares ISC. Preserve the upstream copyright and licensing notices when distributing a derivative.
