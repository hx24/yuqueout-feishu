/** Split Markdown images from prose while preserving order. */
export function parseMarkdownImages(source) {
  const text = String(source || '');
  const parts = [];
  const re = /!\[([^\]]*)\]\(<([^>]+)>\)|!\[([^\]]*)\]\((https:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g;
  let last = 0;
  for (const match of text.matchAll(re)) {
    if (match.index > last) parts.push({type:'markdown', value:text.slice(last,match.index)});
    parts.push({type:'image', alt:match[1] || match[3] || '', url:match[2] || match[4]});
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({type:'markdown',value:text.slice(last)});
  return parts;
}
export function safeImageUrl(input) {
  let u;
  try {u=new URL(input)} catch {return false}
  if (u.protocol!=='https:' || u.username || u.password || !u.hostname.includes('.')) return false;
  const h=u.hostname.toLowerCase();
  return !(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(h) || h==='localhost' || h.endsWith('.local') || h.endsWith('.localhost'));
}
export function chunkMarkdown(md, limit=18000) {
  if (md.length<=limit) return md.trim()?[md]:[];
  const chunks=[]; let b='';
  for (const part of md.split(/(\n\n+)/)) {
    if (b.length+part.length>limit && b.trim()) {chunks.push(b);b=''}
    if (part.length>limit) {if(b.trim()){chunks.push(b);b=''}for(let i=0;i<part.length;i+=limit)chunks.push(part.slice(i,i+limit))}
    else b+=part;
  }
  if(b.trim())chunks.push(b);
  return chunks;
}
export const docPath = file => [file.bookName,file.folderPath].filter(Boolean).join('/').split('/').map(x=>x.trim()).filter(Boolean).map(x=>x.slice(0,160));
export const docKey = file => [file.bookHost||'',file.bookId,file.id].join('|');
