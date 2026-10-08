import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
assert.ok(root, 'Usage: node scripts/check-build.mjs /path/to/dist');
const file = p => fs.readFileSync(path.join(root,p),'utf8');
const manifest = JSON.parse(file('manifest.json'));
assert.equal(manifest.manifest_version,3);
assert.equal(manifest.action.default_popup,'src/feishu-launcher.html','Default Chrome popup must be the Feishu-first launcher');
assert.match(manifest.name,/Feishu/);
assert.match(manifest.version,/^1\.3\./);
for(const p of ['src/feishu-launcher.html','src/feishu-launcher.js','src/feishu.html','src/feishu.js','src/popup.html','src/popup.js','src/background.js']) {
  assert.ok(fs.statSync(path.join(root,p)).size>100, 'Missing or empty build asset: '+p);
}
assert.match(file('src/feishu-launcher.html'),/打开飞书迁移面板/);
assert.match(file('src/feishu-launcher.html'),/src="feishu-launcher.js"/);
assert.match(file('src/feishu-launcher.js'),/openFeishuMigration/);
assert.match(file('src/feishu-launcher.js'),/src\/feishu\.html/);
assert.match(file('src/feishu.html'),/id="start"/);
assert.match(file('src/feishu.html'),/src="feishu.js"/);
assert.match(file('src/background.js'),/feishu:info/);
assert.ok(manifest.host_permissions.some(x=>x.includes('feishu.cn')));
console.log('PASS: build includes Feishu-first default popup, migration page, handlers and bundle');
