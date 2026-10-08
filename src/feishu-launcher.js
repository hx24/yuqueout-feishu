const openPage = path => chrome.tabs.create({url:chrome.runtime.getURL(path)});
document.getElementById('chooseYuque').addEventListener('click',()=>openPage('src/popup.html'));
document.getElementById('openFeishuMigration').addEventListener('click',()=>openPage('src/feishu.html'));
(async()=>{
  try {
    const response=await chrome.runtime.sendMessage({action:'feishu:info'});
    const info=response?.data;
    if(!response?.success)return;
    const s=info?.state||{};
    document.getElementById('status').textContent=
      (info.connected?'飞书已授权 · ':'飞书尚未授权 · ')+
      (s.total?'已完成 '+s.completed+'/'+s.total+' 篇':'尚未开始迁移');
  }catch(e){
    document.getElementById('status').textContent='可以打开迁移面板继续配置';
  }
})();
