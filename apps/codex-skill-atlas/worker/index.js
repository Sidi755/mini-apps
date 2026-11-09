const UI_URI='ui://skill-atlas/library-v3';
const ORIGIN='http://127.0.0.1:4173';
const SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#475569" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h6v6H3zM12 3h5v6h-5zM3 12h6v5H3z"/><circle cx="13.5" cy="13.5" r="2.5"/><path d="m15.5 15.5 2.5 2.5"/></svg>';
const icons=[{src:ORIGIN+'/icon.svg',mimeType:'image/svg+xml',sizes:['20x20']}];
const readonly={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const TOOLS=[
 {name:'open_skill_library',title:'技能图谱',description:'打开中文 Codex 技能搜索库，浏览 GitHub 技能、按用途搜索、分类及收藏。',inputSchema:{type:'object',properties:{},additionalProperties:false},icons,annotations:readonly,_meta:{ui:{resourceUri:UI_URI},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]},'openai/iconStyle':'monochrome'}},
 {name:'search_skills',title:'搜索 Codex 技能',description:'在技能图谱已收录的发布快照中按中文用途、名称或关键词搜索 GitHub 技能。实时同步可在库界面操作。',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:300},limit:{type:'integer',minimum:1,maximum:30}},required:['query'],additionalProperties:false},annotations:readonly}
];
const capabilities={tools:{},resources:{},extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}};
const serverInfo={name:'skill-atlas',title:'技能图谱',version:'1.3.0',icons};
const resource={uri:UI_URI,name:'技能图谱',mimeType:'text/html;profile=mcp-app'};
const result=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
async function rpc(message){
 const {method,params={}}=message;
 if(method==='server/discover')return {supportedVersions:['2026-07-28'],capabilities,_meta:{'io.modelcontextprotocol/serverInfo':serverInfo}};
 if(method==='initialize')return {protocolVersion:'2025-11-25',capabilities,serverInfo};
 if(method==='ping')return {};
 if(method==='tools/list')return {tools:TOOLS};
 if(method==='resources/list')return {resources:[resource]};
 if(method==='resources/templates/list')return {resourceTemplates:[]};
 if(method==='resources/read'){
   if(params.uri!==UI_URI)throw {code:-32602,message:'Unknown resource'};
   return {contents:[{...resource,text:APP_HTML,_meta:{ui:{csp:{connectDomains:['https://api.github.com','https://raw.githubusercontent.com'],resourceDomains:[]},prefersBorder:false},'openai/ui':{preferredDisplayMode:'fullscreen',availableDisplayModes:['fullscreen']}}}]};
 }
 if(method==='tools/call'){
   if(params.name==='open_skill_library')return result({title:'技能图谱',count:CATALOG.length,url:ORIGIN});
   if(params.name==='search_skills'){
     const args=params.arguments||{};
     if(typeof args.query!=='string'||args.query.length>300||(args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>30)))return {isError:true,content:[{type:'text',text:'请输入最多 300 字的查询，数量须为 1–30。'}]};
     const found=searchSkills(CATALOG.map(normalizeSkill),args.query);
     return result({query:args.query,total:found.length,source:'已发布目录快照；在库界面可同步 GitHub',skills:found.slice(0,args.limit||10).map(({name,title,summary,repo,path,url,category})=>({name,title,summary,repo,path,url,category}))});
   }
   return {isError:true,content:[{type:'text',text:'未知工具'}]};
 }
 throw {code:-32601,message:'Method not found'};
}
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/mcp'){
   if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
   let m;try{m=await request.json();}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400});}
   if(!m||m.jsonrpc!=='2.0'||typeof m.method!=='string')return Response.json({jsonrpc:'2.0',id:m?.id??null,error:{code:-32600,message:'Invalid request'}},{status:400});
   if(m.id===undefined)return new Response(null,{status:202});
   try{return Response.json({jsonrpc:'2.0',id:m.id,result:await rpc(m)});}catch(e){return Response.json({jsonrpc:'2.0',id:m.id,error:{code:e.code||-32603,message:e.code?e.message:'Internal error'}});}
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(path==='/icon.svg')return new Response(request.method==='HEAD'?null:SVG,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'}});
 const file=path==='/'?'index.html':path.slice(1);
 if(!Object.hasOwn(ASSETS,file))return new Response('Not found',{status:404});
 const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/javascript';
 return new Response(request.method==='HEAD'?null:ASSETS[file],{headers:{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff'}});
}};
