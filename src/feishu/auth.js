/** Experimental public-client OAuth with PKCE, no secret stored. */
const KEY='yuqueFeishuOAuth';
const TOKEN_URL='https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const random=n=>b64(crypto.getRandomValues(new Uint8Array(n)));
export const oauthRedirectUri=()=>chrome.identity.getRedirectURL('feishu');
async function exchange(payload){
  const res=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const value=await res.json();
  if(!res.ok||value.code!==0||!value.access_token)throw new Error('飞书 OAuth token 获取失败: '+(value.msg||value.error_description||res.status)+'。请确认飞书支持无 App Secret 的 PKCE 公共客户端。');
  return value;
}
export async function authorize(appId){
  if(!/^cli_[a-z0-9]+$/i.test(appId))throw new Error('请输入飞书 App ID（cli_...）');
  const verifier=random(48);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const state=random(24);
  const redirect=oauthRedirectUri();
  const endpoint=new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
  for(const [key,value] of Object.entries({app_id:appId,redirect_uri:redirect,response_type:'code',state,code_challenge:b64(new Uint8Array(hash)),code_challenge_method:'S256'}))endpoint.searchParams.set(key,value);
  const returned=await chrome.identity.launchWebAuthFlow({url:endpoint.toString(),interactive:true});
  if(!returned)throw new Error('OAuth 浏览器授权没有返回地址');
  const url=new URL(returned);
  if(url.searchParams.get('state')!==state)throw new Error('OAuth state 校验失败');
  if(url.searchParams.get('error'))throw new Error('授权失败: '+url.searchParams.get('error'));
  const code=url.searchParams.get('code');
  if(!code)throw new Error('没有收到授权码');
  const tokens=await exchange({grant_type:'authorization_code',client_id:appId,code,redirect_uri:redirect,code_verifier:verifier});
  await chrome.storage.local.set({[KEY]:{...tokens,appId,expiresAt:Date.now()+tokens.expires_in*1000}});
  return {connected:true};
}
export async function getAccessToken(){
  const values=await chrome.storage.local.get(KEY);
  const t=values[KEY];
  if(!t?.access_token)throw new Error('请先授权飞书');
  if(t.expiresAt>Date.now()+60000)return t.access_token;
  if(!t.refresh_token)throw new Error('飞书授权已失效，请重新登录');
  const next=await exchange({grant_type:'refresh_token',client_id:t.appId,refresh_token:t.refresh_token});
  await chrome.storage.local.set({[KEY]:{...next,appId:t.appId,expiresAt:Date.now()+next.expires_in*1000}});
  return next.access_token;
}
export async function disconnect(){await chrome.storage.local.remove(KEY)}
export async function isConnected(){return Boolean((await chrome.storage.local.get(KEY))[KEY]?.access_token)}
