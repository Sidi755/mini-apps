import {readFile,writeFile,mkdir} from 'node:fs/promises';
const read = p => readFile(new URL('../'+p,import.meta.url),'utf8');
const files = {};
for(const name of ['index.html','app.js','engine.js','styles.css','catalog.json','updates.json','library-tools.js']) files[name]=await read('web/'+name);
const catalog=JSON.parse(files['catalog.json']);
const engine=files['engine.js'].replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
const extras=files['library-tools.js'].replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
let app=extras+'\n'+files['app.js'].replace(/^import .*;\r?\n/gm,'');
app=app.replace("const response=await fetch('./catalog.json');if(!response.ok)throw new Error('初始目录加载失败');const seed=await response.json();",'const seed='+JSON.stringify(catalog)+';');
if(app.includes("fetch('./catalog.json')")) throw Error('Catalog embedding failed');
app=app.replace("const response=await fetch('./updates.json');if(!response.ok)throw Error('更新记录加载失败');updateData=await response.json();",'updateData='+JSON.stringify(JSON.parse(files['updates.json']))+';');
if(app.includes("fetch('./updates.json')")) throw Error('Update history embedding failed');
const bridge=await read('web/host-bridge.js');
const html=files['index.html'].replace('<link rel="stylesheet" href="styles.css">','<style>'+files['styles.css']+'</style>')
 .replace('<script type="module" src="app.js"></script>','<script type="module">'+(bridge+'\n'+engine+'\n'+app).replace(/<\/script/gi,'<\\/script')+'</script>');
const source='const ASSETS='+JSON.stringify(files)+';\nconst APP_HTML='+JSON.stringify(html)+';\nconst CATALOG='+JSON.stringify(catalog)+';\n'+engine+'\n'+(await read('worker/index.js')).replace("const ORIGIN='http://127.0.0.1:4173';", 'const ORIGIN='+JSON.stringify(process.env.SITE_ORIGIN || 'http://127.0.0.1:4173')+';');
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});

await writeFile(new URL('../dist/server/index.js',import.meta.url),source);

console.log('Built Worker and embedded plugin view: '+catalog.length+' skills');
