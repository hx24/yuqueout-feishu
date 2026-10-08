import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const local=new Map(),session=new Map();
const store=map=>({
  async get(key){return {[key]:map.get(key)}},
  async set(items){for(const [k,v] of Object.entries(items))map.set(k,v)},
  async remove(key){map.delete(key)}
});
let authorizeUrl='';
globalThis.chrome={
  identity:{
    getRedirectURL:path=>'https://testextension.chromiumapp.org/'+path,
    async launchWebAuthFlow({url,interactive}){
      assert.equal(interactive,true);
      authorizeUrl=url;
      const auth=new URL(url);
      const redirect=new URL(auth.searchParams.get('redirect_uri'));
      redirect.searchParams.set('code','test-oauth-code');
      redirect.searchParams.set('state',auth.searchParams.get('state'));
      return redirect.toString();
    }
  },
  storage:{local:store(local),session:store(session)}
};
const requests=[];
globalThis.fetch=async(url,options)=>{
  requests.push({url,options});
  if(url.includes('/user_info')){
    return {ok:true,status:200,json:async()=>({code:0,data:{open_id:'ou-123'}})};
  }
  const body=JSON.parse(options.body);
  if(body.grant_type==='authorization_code'){
    assert.equal(body.client_id,'cli_test123');
    assert.equal(body.client_secret,'secret-from-user');
    assert.equal(body.code,'test-oauth-code');
    assert.equal(body.redirect_uri,'https://testextension.chromiumapp.org/feishu');
    assert.ok(!('code_verifier' in body),'do not mix unsupported PKCE with confidential mode');
    return {ok:true,status:200,json:async()=>({code:0,access_token:'token-1',refresh_token:'refresh-1',expires_in:7200})};
  }
  if(body.grant_type==='refresh_token'){
    assert.equal(body.client_secret,'secret-from-user');
    assert.equal(body.refresh_token,'refresh-1');
    return {ok:true,status:200,json:async()=>({code:0,access_token:'token-2',refresh_token:'refresh-2',expires_in:7200})};
  }
  throw new Error('Unexpected grant');
};
const auth=await import('../src/feishu/auth.js');
await auth.authorize('cli_test123','secret-from-user');
assert.equal(new URL(authorizeUrl).searchParams.has('code_challenge'),false);
assert.equal(await auth.getAccessToken(),'token-1');
assert.equal(await auth.isConnected(),true);
assert.equal(local.has('yuqueFeishuOAuth'),false,'must not persist secrets to chrome.storage.local');
assert.equal(session.get('yuqueFeishuOAuth').appSecret,'secret-from-user');
session.get('yuqueFeishuOAuth').expiresAt=Date.now()-1000;
assert.equal(await auth.getAccessToken(),'token-2','refresh includes secret');
await auth.setManualToken('Bearer u-manual-long-lived-placeholder');
assert.equal(await auth.getAccessToken(),'u-manual-long-lived-placeholder');
assert.equal(session.get('yuqueFeishuOAuth').appSecret,undefined,'manual mode should not retain App Secret');
assert.equal((await auth.getAuthMode()),'manual');
await auth.disconnect();
assert.equal(await auth.isConnected(),false);
await assert.rejects(auth.getAccessToken(),/请先完成飞书授权/);
console.log('PASS: confidential OAuth, callback state, refresh, manual token, session-only credentials');
