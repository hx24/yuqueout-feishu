import {exportState,waitForStateReady} from '../core/state.js';
import {fetchDocContent,downloadImage} from '../core/yuque.js';
import {lakeToMarkdown} from '../core/lake-converter.js';
import {FeishuApi} from './api.js';
import {authorize,setManualToken,getAccessToken,disconnect,isConnected,getAuthMode,oauthRedirectUri} from './auth.js';
import {parseMarkdownImages,safeImageUrl,chunkMarkdown,docPath,docKey} from './markdown.js';

const KEY='yuqueFeishuMigration';
const ALARM='yuque-feishu-migrate';
const api=new FeishuApi(getAccessToken);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let running=false;
let stop=false;

async function load(){
  const values=await chrome.storage.local.get(KEY);
  return values[KEY]||{files:[],entries:{},folders:{},settings:{},active:false};
}
async function save(state){await chrome.storage.local.set({[KEY]:state})}
function summarize(state){
  const entries=Object.values(state.entries||{});
  return {
    active:state.active,total:state.files.length,
    completed:entries.filter(e=>e.status==='completed').length,
    failed:entries.filter(e=>e.status==='failed'||e.status==='needs_review').length,
    current:entries.find(e=>e.status==='in_progress')?.title||'',
    items:entries.map(e=>({title:e.title,status:e.status,error:e.error||'',documentId:e.documentId||''}))
  };
}
export function registerFeishuHandlers(){
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!message?.action?.startsWith('feishu:')||message.action==='feishu:progress')return false;
    // A Yuque content script must never be able to request OAuth credentials
    // or start a migration on the user's behalf.
    if(!sender.url?.startsWith(chrome.runtime.getURL(''))){
      respond({success:false,error:'仅允许从扩展自身页面调用飞书功能'});
      return true;
    }
    (async()=>{
      switch(message.action){
        case 'feishu:info':return {redirectUri:oauthRedirectUri(),connected:await isConnected(),authMode:await getAuthMode(),state:summarize(await load())};
        case 'feishu:authorize':return authorize(message.appId,message.appSecret);
        case 'feishu:manualToken':return setManualToken(message.token);
        case 'feishu:disconnect':await disconnect();return {connected:false};
        case 'feishu:start':return start(message.options);
        case 'feishu:pause':return pause();
        case 'feishu:resume':return resume();
        default:throw new Error('未知操作');
      }
    })().then(data=>respond({success:true,data}),e=>respond({success:false,error:String(e.message||e)}));
    return true;
  });
  chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)kick()});
  chrome.alarms.create(ALARM,{periodInMinutes:1});
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes[KEY]?.newValue)
      chrome.runtime.sendMessage({action:'feishu:progress',data:summarize(changes[KEY].newValue)}).catch(()=>{});
  });
  kick();
}
async function start(options){
  await waitForStateReady();
  await getAccessToken();
  if(exportState.isExporting)throw new Error('请先停止常规导出任务');
  const files=(exportState.fileList||[]).filter(f=>f.docType==='Doc').map(f=>({...f,key:docKey(f)}));
  if(!files.length)throw new Error('请先在 YuqueOut 选择知识库并获取文件信息，仅支持 Doc 类型');
  const previous=await load();
  if(previous.active)throw new Error('迁移正在进行');
  const token=String(options?.folderToken||'root').trim()||'root';
  if(previous.files.length&&previous.settings.folderToken!==token)throw new Error('已有任务的目标文件夹不同。请使用相同目标继续以防重复创建');
  const entries={};
  for(const file of files){
    const last=previous.entries[file.key];
    entries[file.key]=last?.status==='completed'||last?.status==='needs_review'
      ? last:{title:file.title,status:'pending'};
  }
  const state={files,entries,folders:previous.folders||{},settings:{folderToken:token},active:true};
  stop=false;await save(state);kick();return summarize(state);
}
async function pause(){
  stop=true;
  const s=await load();s.active=false;await save(s);return summarize(s);
}
async function resume(){
  await getAccessToken();
  const s=await load();
  if(!s.files.length)throw new Error('没有历史任务');
  for(const entry of Object.values(s.entries)){
    if(entry.status==='in_progress'){
      entry.status='needs_review';
      entry.error='后台意外中断，可能已在飞书创建文档，需人工检查后处理';
    }
  }
  stop=false;s.active=true;await save(s);kick();return summarize(s);
}
function kick(){
  if(running)return;
  running=true;
  run().catch(e=>console.error('Feishu migration runner failed',e))
    .finally(()=>{running=false});
}
async function run(){
  let s=await load();
  if(!s.active)return;
  for(const file of s.files){
    s=await load();
    if(!s.active||stop)return;
    const entry=s.entries[file.key];
    if(!entry||entry.status!=='pending')continue;
    entry.status='in_progress';entry.error='';
    await save(s);
    try{
      const folder=await ensureFolders(s,docPath(file));
      const original=await fetchDocContent(file.slug,file.bookSourceId||file.bookId,file.bookHost||null);
      if(!original.content)throw new Error('语雀返回空文档，未迁移');
      const md=lakeToMarkdown(original.content);
      if(typeof md!=='string')throw new Error('语雀 Markdown 转换失败');
      const id=await api.createDocument(file.title||'未命名文档',folder);
      entry.documentId=id;await save(s);
      await writeContent(id,md);
      entry.status='completed';entry.error='';
    }catch(e){
      entry.error=String(e.message||e);
      // Even ambiguous POST failures might have created something remotely.
      entry.status='needs_review';
    }
    await save(s);
    await delay(400);
  }
  s=await load();s.active=false;await save(s);
}
async function ensureFolders(state,segments){
  let parent=state.settings.folderToken||'root';
  for(const name of segments){
    const key=parent+'/'+name;
    if(!state.folders[key]){
      state.folders[key]=await api.createFolder(name,parent);
      await save(state);
    }
    parent=state.folders[key];
  }
  return parent;
}
async function writeContent(documentId,markdown){
  for(const part of parseMarkdownImages(markdown)){
    if(part.type==='markdown'){
      for(const chunk of chunkMarkdown(part.value)){
        await api.writeConverted(documentId,await api.convertMarkdown(chunk));
        await delay(230);
      }
    }else{
      if(!safeImageUrl(part.url))throw new Error('无法安全下载非 HTTPS 图片: '+part.url);
      const blob=await downloadImage(part.url);
      const block=await api.imagePlaceholder(documentId);
      const name=(part.alt||'image').replace(/[^\w\u4e00-\u9fff.-]/g,'_').slice(0,60)+'.png';
      const file=await api.uploadImage(block,blob,name);
      await api.bindImage(documentId,block,file);
      await delay(230);
    }
  }
}
