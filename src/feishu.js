const $=id=>document.getElementById(id);
async function call(name,data={}){
  const result=await chrome.runtime.sendMessage({action:'feishu:'+name,...data});
  if(!result?.success)throw new Error(result?.error||'插件后台无响应');
  return result.data;
}
function error(e){$('status').className='danger';$('status').textContent=e.message||String(e)}
function display(s){
  const total=s.total||0,done=s.completed||0;
  $('status').className='subtle';
  $('status').textContent=(s.active?'迁移中':'未运行')+' · 成功 '+done+'/'+total+' · 失败或需人工检查 '+(s.failed||0)+(s.current?' · '+s.current:'');
  $('progress').style.width=(total?Math.round(done/total*100):0)+'%';
  $('items').replaceChildren();
  for(const item of s.items||[]){
    const tr=document.createElement('tr');
    const title=document.createElement('td');title.textContent=item.title||'';
    const status=document.createElement('td');status.textContent=({pending:'待处理',in_progress:'进行中',completed:'完成',needs_review:'需人工检查',failed:'失败'})[item.status]||item.status;
    const info=document.createElement('td');info.textContent=item.error||'';
    if(item.documentId){
      const a=document.createElement('a');a.textContent='查看飞书文档';
      a.href='https://www.feishu.cn/docx/'+encodeURIComponent(item.documentId);
      a.target='_blank';a.rel='noopener';info.append(' ',a);
    }
    tr.append(title,status,info);$('items').append(tr);
  }
}
async function load(){
  const info=await call('info');
  $('redirect').textContent=info.redirectUri;
  $('authStatus').textContent=info.connected?'已授权 · '+(info.authMode==='manual'?'手动 user_access_token':'App ID + App Secret OAuth'):'尚未授权';
  display(info.state);
}
$('openOriginal').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('src/popup.html')}));
$('auth').addEventListener('click',async()=>{
  const button=$('auth');button.disabled=true;
  const appSecret=$('appSecret').value;
  try{
    await call('authorize',{appId:$('appId').value.trim(),appSecret});
    $('appSecret').value='';
    await load();
  }catch(e){error(e)}
  finally{button.disabled=false}
});
$('setManualToken').addEventListener('click',async()=>{
  const button=$('setManualToken');button.disabled=true;
  try{
    await call('manualToken',{token:$('manualToken').value});
    $('manualToken').value='';
    await load();
  }catch(e){error(e)}
  finally{button.disabled=false}
});
$('disconnect').addEventListener('click',async()=>{try{await call('disconnect');await load()}catch(e){error(e)}});
$('start').addEventListener('click',async()=>{
  if(!confirm('准备开始一次性迁移？建议先用少量测试文档验证。'))return;
  try{display(await call('start',{options:{folderToken:$('folderToken').value.trim()||'root'}}))}catch(e){error(e)}
});
$('pause').addEventListener('click',async()=>{try{display(await call('pause'))}catch(e){error(e)}});
$('resume').addEventListener('click',async()=>{try{display(await call('resume'))}catch(e){error(e)}});
chrome.runtime.onMessage.addListener(m=>{if(m.action==='feishu:progress')display(m.data)});
load().catch(error);
