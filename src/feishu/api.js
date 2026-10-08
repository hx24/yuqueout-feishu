const ROOT='https://open.feishu.cn/open-apis';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class FeishuApi {
  constructor(getToken){this.getToken=getToken}
  async request(method,path,body){
    const repeatable=method==='GET'||path.endsWith('/blocks/convert');
    let last;
    for(let i=0;i<(repeatable?4:1);i++){
      const headers={Authorization:'Bearer '+await this.getToken()};
      if(!(body instanceof FormData))headers['Content-Type']='application/json; charset=utf-8';
      try{
        const res=await fetch(ROOT+path,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
        const value=await res.json();
        if(!res.ok||value.code!==0)throw new Error('Feishu '+method+' '+path+': '+(value.code??res.status)+' '+(value.msg||''));
        return value.data||{};
      }catch(e){
        last=e;
        if(!repeatable||i===3||!/429|500|502|503|fetch|network|限流/i.test(e.message))throw e;
        await sleep(1100*(i+1));
      }
    }
    throw last;
  }
  async createFolder(name,parent='root'){
    const result=await this.request('POST','/drive/v1/files/create_folder',{name,folder_token:parent});
    if(!result.token)throw new Error('创建文件夹未返回 token: '+name);
    return result.token;
  }
  async createDocument(title,folder){
    const result=await this.request('POST','/docx/v1/documents',{title,...(folder&&folder!=='root'?{folder_token:folder}:{})});
    if(!result.document?.document_id)throw new Error('创建文档未返回 ID');
    return result.document.document_id;
  }
  async convertMarkdown(content){
    return this.request('POST','/docx/v1/documents/blocks/convert',{content_type:'markdown',content});
  }
  async writeConverted(documentId,converted){
    const blocks=(converted.blocks||[]).map(block=>{
      const b=structuredClone(block);delete b.revision_id;delete b.parent_id;return b;
    });
    if(!blocks.length)return;
    if(blocks.length>1000)throw new Error('单段转换超过 1000 个 Block');
    return this.request('POST','/docx/v1/documents/'+encodeURIComponent(documentId)+'/blocks/'+encodeURIComponent(documentId)+'/descendant',{
      children_id:converted.first_level_block_ids||[],descendants:blocks,index:-1
    });
  }
  async imagePlaceholder(documentId){
    const data=await this.request('POST','/docx/v1/documents/'+encodeURIComponent(documentId)+'/blocks/'+encodeURIComponent(documentId)+'/children',{
      children:[{block_type:27,image:{}}],index:-1
    });
    const id=data.children?.[0]?.block_id;
    if(!id)throw new Error('图片 Block 创建失败');
    return id;
  }
  async uploadImage(blockId,blob,name){
    if(blob.size>20*1024*1024)throw new Error('图片大于 20MB: '+name);
    const body=new FormData();
    body.append('file_name',name);body.append('parent_type','docx_image');body.append('parent_node',blockId);
    body.append('size',String(blob.size));body.append('file',blob,name);
    const data=await this.request('POST','/drive/v1/medias/upload_all',body);
    if(!data.file_token)throw new Error('图片上传未返回 file_token');
    return data.file_token;
  }
  async bindImage(doc,block,token){
    return this.request('PATCH','/docx/v1/documents/'+encodeURIComponent(doc)+'/blocks/'+encodeURIComponent(block),{replace_image:{token}});
  }
}
