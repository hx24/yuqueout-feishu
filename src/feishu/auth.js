/**
 * Feishu v2 OAuth for a private, one-time, browser-only migration.
 *
 * Feishu self-built web apps may require confidential-client authentication.
 * The user supplies their own App Secret at runtime. Secrets and tokens are
 * held in chrome.storage.session ONLY (trusted extension contexts), not in
 * git, build artifacts, chrome.storage.local, or console output.
 *
 * A second mode accepts a short-lived user_access_token supplied by the user.
 */
const KEY='yuqueFeishuOAuth';
const LEGACY_KEY='yuqueFeishuOAuth';
const TOKEN_URL='https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const USER_INFO_URL='https://open.feishu.cn/open-apis/authen/v1/user_info';
const AUTHORIZE_URL='https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const random=n=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n))))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
export const oauthRedirectUri=()=>chrome.identity.getRedirectURL('feishu');
function validResponse(value,res){
  if(!res.ok||String(value.code)!=='0'||!value.access_token){
    throw new Error('飞书授权失败: '+(value.msg||value.error_description||value.error||('HTTP '+res.status)));
  }
  return value;
}
async function exchange(payload){
  const res=await fetch(TOKEN_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  let value;
  try{value=await res.json()}catch{throw new Error('飞书 Token 接口未返回 JSON，HTTP '+res.status)}
  return validResponse(value,res);
}
async function saveSession(data){
  await chrome.storage.session.set({[KEY]:data});
  // Purge tokens persisted by versions before v1.3.1.
  await chrome.storage.local.remove(LEGACY_KEY);
}
async function readSession(){
  const result=await chrome.storage.session.get(KEY);
  return result[KEY]||null;
}
export async function authorize(appId,appSecret){
  if(!/^cli_[a-z0-9]+$/i.test(appId||''))throw new Error('请输入有效的飞书 App ID（cli_...）');
  if(typeof appSecret!=='string'||!appSecret.trim())throw new Error('请输入你自己飞书应用的 App Secret');
  const state=random(24);
  const redirect=oauthRedirectUri();
  const endpoint=new URL(AUTHORIZE_URL);
  for(const [key,value] of Object.entries({app_id:appId,redirect_uri:redirect,response_type:'code',state})){
    endpoint.searchParams.set(key,value);
  }
  const returned=await chrome.identity.launchWebAuthFlow({url:endpoint.toString(),interactive:true});
  if(!returned)throw new Error('没有收到飞书授权回调');
  const url=new URL(returned);
  const expected=new URL(redirect);
  if(url.origin!==expected.origin||url.pathname!==expected.pathname)throw new Error('OAuth 回调来源不匹配');
  if(url.searchParams.get('state')!==state)throw new Error('OAuth state 校验失败');
  if(url.searchParams.get('error'))throw new Error('飞书拒绝授权: '+url.searchParams.get('error'));
  const code=url.searchParams.get('code');
  if(!code)throw new Error('飞书没有返回授权码，请检查重定向 URI');
  const token=await exchange({
    grant_type:'authorization_code',client_id:appId,client_secret:appSecret,
    code,redirect_uri:redirect
  });
  const expires=Number(token.expires_in)||7200;
  await saveSession({...token,appId,appSecret,mode:'oauth',expiresAt:Date.now()+expires*1000});
  return {connected:true,mode:'oauth'};
}
export async function setManualToken(value){
  const token=String(value||'').trim().replace(/^Bearer\s+/i,'');
  if(token.length<16||/\s/.test(token))throw new Error('请输入有效的 user_access_token');
  // Validate without storing and never print token.
  const res=await fetch(USER_INFO_URL,{headers:{Authorization:'Bearer '+token}});
  let body;
  try{body=await res.json()}catch{throw new Error('飞书用户信息校验返回异常，HTTP '+res.status)}
  if(!res.ok||String(body.code)!=='0'){
    throw new Error('user_access_token 校验失败: '+(body.msg||('HTTP '+res.status))+
      '。请确认不是 tenant_access_token，并检查用户授权。');
  }
  await saveSession({mode:'manual',access_token:token,expiresAt:Date.now()+7200*1000});
  return {connected:true,mode:'manual'};
}
export async function getAccessToken(){
  const token=await readSession();
  if(!token?.access_token)throw new Error('请先完成飞书授权，或粘贴 user_access_token');
  if(token.expiresAt>Date.now()+60000)return token.access_token;
  if(token.mode==='manual'){
    throw new Error('手动 user_access_token 可能已过期，请在迁移页粘贴新的用户 Token');
  }
  if(!token.refresh_token||!token.appId||!token.appSecret)throw new Error('飞书授权已失效，请重新登录');
  const next=await exchange({
    grant_type:'refresh_token',client_id:token.appId,
    client_secret:token.appSecret,refresh_token:token.refresh_token
  });
  await saveSession({
    ...next,appId:token.appId,appSecret:token.appSecret,
    mode:'oauth',expiresAt:Date.now()+(Number(next.expires_in)||7200)*1000
  });
  return next.access_token;
}
export async function disconnect(){
  await chrome.storage.session.remove(KEY);
  await chrome.storage.local.remove(LEGACY_KEY);
}
export async function isConnected(){
  const t=await readSession();
  return Boolean(t?.access_token&&t.expiresAt>Date.now()+60000);
}
export async function getAuthMode(){
  return (await readSession())?.mode||null;
}
