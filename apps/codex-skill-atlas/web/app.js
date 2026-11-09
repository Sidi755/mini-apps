import { normalizeSkill, normalizeRepository, searchSkills, syncRepository, loadCache, saveCache, normalizeRequirements, resolveQuery } from './engine.js';
import {installGuide, relatedSkills, validateBackup, maintenanceLabel, inspectSource} from './library-tools.js';

const $ = selector => document.querySelector(selector);
const kindLabel=kind=>({skill:'技能 Skill',plugin:'插件 Plugin',tool:'软件工具 Tool'}[kind]||'类型待核实');
const requirementLabels={windows:{supported:'Windows 已核实',unsupported:'不支持 Windows',unknown:'Windows 待核实'},apiKey:{required:'需要 API Key','not-required':'基础功能无需 Key',unknown:'Key 要求待核实'},cost:{free:'基础功能免费',conditional:'费用视使用方式',paid:'需要付费',unknown:'费用待核实'}};
function requirementChips(s){const r=normalizeRequirements(s.requirements);return ['windows','apiKey','cost'].map(key=>`<span title="${esc(r[key].detail)}">${requirementLabels[key][r[key].status]}</span>`).join('')}
function requirementTable(s){const r=normalizeRequirements(s.requirements);return `<dl class="requirements">${[['windows','Windows'],['apiKey','API Key'],['cost','费用']].map(([key,label])=>`<div><dt>${label}</dt><dd><strong>${requirementLabels[key][r[key].status]}</strong><p>${esc(r[key].detail)}</p></dd></div>`).join('')}<div><dt>依赖与限制</dt><dd>${r.dependencies.length?`<ul>${r.dependencies.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>`:'待核实，请阅读原文安装说明'}</dd></div></dl><p class="muted">${r.checkedAt?'资料整理日期：'+esc(r.checkedAt):'尚未核实'}；未明确标注实测的项目，不代表完成运行验证。${s.summaryStale?'原文有变化，条件也需重新核对。':''}</p>`}
let updateData=null,updateError=false,selectedWeek='all';
function weekStart(date){const d=new Date(new Date(date).getTime()+8*3600000);if(Number.isNaN(d.valueOf()))return '未知日期';d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)}
async function loadUpdates(){try{const response=await fetch('./updates.json');if(!response.ok)throw Error('更新记录加载失败');updateData=await response.json();updateError=false;}catch{updateError=true;}if($('#updates-dialog').open)renderUpdates()}
function renderUpdates(){
 const box=$('#updates-content');
 if(!updateData){box.innerHTML=updateError?'<p>更新记录暂时无法加载，请稍后重试。</p><button class="button" id="retry-updates">重试</button>':'<p>正在加载更新记录…</p>';if(updateError)$('#retry-updates').onclick=loadUpdates;return;}
 const releases=Array.isArray(updateData.releases)?updateData.releases:[];
 const weeks=[...new Set(releases.map(r=>weekStart(r.date)))].sort().reverse();
 const selected=releases.filter(r=>selectedWeek==='all'||weekStart(r.date)===selectedWeek);
 const schedule=updateData.schedule;
 box.innerHTML=`<div class="info-box"><strong>定时维护：${esc(schedule?.label||'未配置')}</strong><p>${esc(schedule?.note||'')} ${!releases.some(r=>r.origin==='定时维护')?'目前尚无定时任务完成记录。':''}</p></div><label class="week-picker">查看周次<select id="update-week"><option value="all">全部记录</option>${weeks.map(w=>`<option value="${esc(w)}" ${w===selectedWeek?'selected':''}>${esc(w)} 起的一周</option>`).join('')}</select></label>${selected.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<article class="release"><div class="release-heading"><h3>${esc(r.title)}</h3><span>v${esc(r.version)}</span></div><p class="muted">${esc(new Date(r.date).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))} · ${esc(r.origin)}</p><div class="release-counts"><span>新增 ${(r.added||[]).length}</span><span>更新 ${(r.updated||[]).length}</span><span>下架 ${(r.removed||[]).length}</span></div><ul>${(r.improvements||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="muted">${esc(r.notes||'')}</p>${[['added','新增项目'],['updated','更新项目'],['removed','下架项目']].map(([key,label])=>`<details><summary>${label}（${(r[key]||[]).length}）</summary>${r[key]?.length?`<ul>${r[key].map(x=>`<li>${esc(x.title||x.id)}${skills.some(s=>s.id===x.id)?` <button class="text-link" data-update-detail="${esc(x.id)}">查看</button>`:''}</li>`).join('')}</ul>`:'<p>本次无'+label+'。</p>'}</details>`).join('')}</article>`).join('')||'<p>本周暂无发布记录。</p>'}`;
 $('#update-week').onchange=e=>{selectedWeek=e.target.value;renderUpdates()};
 box.querySelectorAll('[data-update-detail]').forEach(b=>b.onclick=()=>{const s=skills.find(s=>s.id===b.dataset.updateDetail);if(s){$('#updates-dialog').close();renderDetail(s);showDialog('#detail-dialog')}});
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const DEFAULT_REPOS = ['openai/skills', 'obra/superpowers', 'vercel-labs/agent-skills', 'anthropics/skills','microsoft/playwright-cli','supabase/agent-skills','vercel-labs/skills','remotion-dev/skills'];
const ICONS = { 开发:'⌘', 调试:'⌁', 文档:'▤', 设计:'✧', 自动化:'↯', 研究:'◎' };
const arrayCache = (key, fallback=[]) => { const value=loadCache(key, fallback); return Array.isArray(value) ? value : fallback; };
let skills=[], favorites=new Set(arrayCache('favorites').filter(v=>typeof v==='string'));
let repos=[...new Set([...DEFAULT_REPOS,...arrayCache('repos').flatMap(r=>{try{return [normalizeRepository(r)]}catch{return []}})])];
let view='all', category='全部', shown=18, busy=false, activeSkill=null, toastTimer;
let autoRefresh=loadCache('autoRefresh',true)!==false;
let syncController=null,lastAttempt=0,nextAuto=0,newIds=new Set();
const AUTO_INTERVAL=15*60*1000;
const OPEN_LICENSES=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','MPL-2.0','GPL-3.0','LGPL-3.0','AGPL-3.0','Unlicense','CC0-1.0']);
const safeSkills = list => list.flatMap(item=>{try{return [normalizeSkill(item)]}catch{return []}});
const merge = (base, incoming) => [...new Map([...base,...incoming].map(s=>[s.id,s])).values()];
function mergeSeed(seed,cached){
  const canonical=new Map(seed.map(s=>[s.repo.toLowerCase()+':'+s.name,s.id]));
  const byId=new Map(cached.filter(s=>!canonical.has(s.repo.toLowerCase()+':'+s.name)||canonical.get(s.repo.toLowerCase()+':'+s.name)===s.id).map(s=>[s.id,s]));
  for(const item of seed){const old=byId.get(item.id);const newer=old?.fetchedAt&&(!item.fetchedAt||old.fetchedAt>item.fetchedAt);byId.set(item.id,newer?{...old,...item,sourceDescription:old.sourceDescription,fetchedAt:old.fetchedAt,blobSha:old.blobSha,repositoryInfo:old.repositoryInfo,summaryStale:!!(old.summaryStale||old.sourceDescription!==item.sourceDescription)}:item)}
  return [...byId.values()];
}
const dateLabel = date => { const d=new Date(date);return Number.isNaN(d.valueOf())?'尚未同步':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}); };

function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3200)}
function status(message,error=false){$('#status').textContent=message;$('#status').hidden=!message;$('#status').classList.toggle('error',error)}
function persist(){if(!saveCache('skills',skills)) toast('浏览器无法保存缓存；当前页面仍可使用。')}
function setBusy(value){busy=value;$('#refresh').disabled=value;$('#cancel-sync').hidden=!value;$('#repo-form button').disabled=value;$('#refresh').innerHTML=value?'<span>↻</span> 同步中…':'<span>↻</span> 刷新目录'}
function updateStats(){
  $('#type-counts').textContent=['skill','plugin','tool'].map(kind=>kindLabel(kind)+'：'+skills.filter(s=>s.kind===kind).length+' 项').join(' · ');
  $('#nav-total').textContent=skills.length;$('#nav-saved').textContent=skills.filter(s=>favorites.has(s.id)).length;
  $('#stat-total').textContent=skills.length;$('#stat-repos').textContent=new Set(skills.map(s=>s.repo)).size;
  $('#stat-curated').textContent=skills.filter(s=>s.summaryType==='curated').length;
  const last=loadCache('lastSync');$('#sync-time').textContent=last?`最近同步 ${dateLabel(last)}`:'中文目录核实于 2026.11.07';
}
function render(){
  updateStats();renderCollectionControls();
  const results=searchSkills(skills,$('#search').value,{category,source:view==='favorites'?'favorites':$('#source-filter').value,favorites,sort:$('#sort').value,kind:$('#kind-filter').value,windows:$('#windows-filter').value,apiKey:$('#key-filter').value}).filter(s=>view!=='favorites'||$('#source-filter').value==='all'||(s.official? 'official':'community')===$('#source-filter').value).filter(s=>(!$('#chinese-only').checked||s.summaryType==='curated')&&(!$('#open-only').checked||OPEN_LICENSES.has(s.repositoryInfo?.license))&&(!$('#new-only').checked||newIds.has(s.id)));
  $('#search-explanation').textContent=$('#search').value.trim()?`按需求匹配：${resolveQuery($('#search').value) || $('#search').value}；同义用途也会匹配。`:'';
  const filteredByGroup=results.filter(s=>view!=='favorites'||groupFilter==='all'||(assignments.get(s.id)||'')===groupFilter);results.splice(0,results.length,...filteredByGroup);
  $('#result-count').textContent=`${results.length} 个技能`;
  $('#cards').innerHTML=results.slice(0,shown).map(s=>`<article class="skill-card"><div class="card-top"><span class="skill-icon ${esc(s.category)}" aria-hidden="true">${ICONS[s.category]||'✳'}</span><div class="card-heading"><h3><button data-detail="${esc(s.id)}">${newIds.has(s.id)?'<span class="new-badge">新增</span> ':''}${esc(s.title)}</button></h3><small>${esc(s.name)} <span>· ${esc(s.repo.split('/')[0])}</span></small></div><button class="favorite ${favorites.has(s.id)?'saved':''}" aria-label="${favorites.has(s.id)?'取消收藏':'收藏'} ${esc(s.title)}" aria-pressed="${favorites.has(s.id)}" data-favorite="${esc(s.id)}">${favorites.has(s.id)?'★':'☆'}</button></div><div class="entry-kind">${kindLabel(s.kind)}<span>${s.kind==='skill'?'在聊天中调用':s.kind==='plugin'?'从插件入口使用':'需配置运行环境'}</span></div><p class="card-description">${esc(s.summary)}</p><div class="tags">${[s.category,...s.tags.filter(t=>t!==s.category)].slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="card-tools"><span class="health-label">${esc(sourceSummary(s))}</span><button class="text-link" data-compare="${esc(s.id)}" aria-pressed="${compared.has(s.id)}">${compared.has(s.id)?'✓ 已选对比':'+ 加入对比'}</button></div><div class="requirement-chips">${requirementChips(s)}</div><div class="card-bottom"><span class="source-label ${s.official?'official':''}">${s.official?'◉ OpenAI 官方':'◇ 社区来源'} <span>· ${s.summaryStale?'摘要待复核':s.summaryType==='curated'?'中文精选':'原文摘要'}</span></span><button class="detail-button" data-detail="${esc(s.id)}">查看详情 <span>↗</span></button></div></article>`).join('');
  $('#empty').hidden=results.length>0;$('#empty-message').textContent=view==='favorites'&&!favorites.size?'点击技能卡片上的 ☆，把常用的工作流收藏到这里。':'换个关键词，或试试更宽泛的用途。';
  $('#load-more').hidden=results.length<=shown;$('#showing').textContent=results.length?`已显示 ${Math.min(shown,results.length)} / ${results.length} 个技能`:'';
  document.querySelectorAll('[data-category]').forEach(b=>{const selected=b.dataset.category===category;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected)});
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')});
  $('#list-heading').textContent=$('#page-title').textContent=view==='favorites'?'我的收藏':'探索技能';
}
function showDialog(id){const dialog=$(id);if(!dialog.open)dialog.showModal()}
function toggleFavorite(id){
  const saved=!favorites.has(id);if(!saved){assignments.delete(id);saveOrganization()} saved?favorites.add(id):favorites.delete(id);const persisted=saveCache('favorites',[...favorites]);render();
  if(activeSkill?.id===id&&$('#detail-dialog').open)renderDetail(activeSkill);
  toast(persisted?(saved?'已加入我的收藏':'已取消收藏'):'收藏已更新，但浏览器无法保存；关闭页面后可能丢失。');
}
function renderDetail(s){
  activeSkill=s;
  $('#detail-content').innerHTML=`<div class="eyebrow">${s.official?'OpenAI 官方技能':'社区技能'} · ${esc(s.category)}</div><div class="info-box"><strong>${kindLabel(s.kind)}</strong><p>${s.kind==='skill'?'安装技能后在 Codex 聊天中调用；不会自动成为插件列表里的图标。':s.kind==='plugin'?'按项目说明安装并连接插件，从插件入口使用。':'这是独立运行的软件工具，需要先配置环境，再由命令或应用界面使用。'}</p></div><div class="detail-title"><span class="skill-icon ${esc(s.category)}">${ICONS[s.category]||'✳'}</span><div><h2>${esc(s.title)}</h2><small>${esc(s.name)}</small></div></div><p class="detail-summary">${esc(s.summary)}</p><div class="tags">${s.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="detail-section"><h3>适用条件</h3>${requirementTable(s)}<p>${esc(s.compatibility)}</p>${s.caveat?`<p style="margin-top:8px">${esc(s.caveat)}</p>`:''}</div>${s.sourceDescription&&s.sourceDescription!==s.summary?`<details class="detail-section"><summary>查看 GitHub 原文摘要</summary><p>${esc(s.sourceDescription)}</p></details>`:''}<div class="detail-section"><h3>可追溯来源</h3><p>仓库收藏数：${Number(s.repositoryInfo?.stars||0).toLocaleString()} · 仓库许可：${esc(s.repositoryInfo?.license||"待核实")}</p><p>仓库更新：${esc(dateLabel(s.repositoryInfo?.updatedAt))} · 指标获取：${esc(dateLabel(s.repositoryInfo?.checkedAt))}</p>${s.summaryStale?'<p class="form-error">原文已变化，中文摘要待复核，请展开原文核对。</p>':''}<p>${esc(s.repo)} · ${esc(s.branch)}</p><code>${esc(s.path)}</code></div><div class="detail-actions"><button class="button primary" id="copy-install">复制安装提示 ↗</button><a class="button" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">GitHub 原文 ↗</a><button class="button" id="detail-favorite">${favorites.has(s.id)?'★ 已收藏':'☆ 收藏技能'}</button></div><div id="detail-extras"></div><div class="detail-meta"><span>${s.summaryType==='curated'?`中文精选 · 核实于 ${esc(s.verifiedAt||'2026-11-06')}`:'自动提取简介字段 · 保留原文语言'}</span><span>${s.fetchedAt?`同步 ${esc(dateLabel(s.fetchedAt))}`:''}</span></div><p class="muted" style="font-size:10px;margin-bottom:0">目录已核实文件来源；收录不代表完成运行测试。请在安装前检查依赖和技能指令。</p>`;
  renderExtraDetail(s);
  $('#copy-install').onclick=()=>copyPromptText(installGuide(s));$('#detail-favorite').onclick=()=>toggleFavorite(s.id);
}
async function copyInstall(s){
  const prompt=s.kind!=='skill'?`请帮我配置这个${kindLabel(s.kind)}：${s.url}。先阅读官方安装说明，核对系统、依赖、账号及费用，不要把它当作 SKILL.md 安装。`:`请使用 $skill-installer 帮我安装这个 GitHub 技能：\n${s.url}\n\n技能：${s.name}\n仓库：${s.repo}\n目录：${s.path.replace(/\/?SKILL\.md$/,'')||'.'}\n请先阅读 SKILL.md，核对 Codex 兼容性、工具依赖与安装说明，说明需要的配置。${s.caveat?'\n已知条件：'+s.caveat:''}`;
  try{await navigator.clipboard.writeText(prompt);toast('安装提示已复制，粘贴到 Codex 聊天即可')}catch{
    let area=document.createElement('textarea');area.value=prompt;area.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';$('#detail-dialog').append(area);area.select();const copied=document.execCommand('copy');area.remove();if(copied)toast('安装提示已复制');else{const pre=document.createElement('textarea');pre.value=prompt;pre.readOnly=true;pre.style.cssText='width:100%;height:150px;margin-top:15px';$('#detail-content').append(pre);pre.select();toast('请手动复制已选中的安装提示')}
  }
}
function renderRepos(){
  $('#repo-list').innerHTML=repos.map(repo=>`<div class="repo"><span class="stat-icon">⌘</span><div><strong>${esc(repo)}</strong><small>${skills.filter(s=>s.repo.toLowerCase()===repo.toLowerCase()).length} 个已收录 · ${repo==='openai/skills'?'OpenAI 官方':'社区来源'}</small></div><a href="https://github.com/${esc(repo)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${esc(repo)}">↗</a></div>`).join('');
}
async function refreshAll(){
  if(busy)return;if(!navigator.onLine){status("当前离线，已保存的目录仍可搜索。",true);return}setBusy(true);syncController=new AbortController();lastAttempt=Date.now();nextAuto=lastAttempt+AUTO_INTERVAL;let count=0;const errors=[];const previous=new Set(skills.map(s=>s.id));newIds=new Set();
  try{
    for(const repo of repos){
      if(syncController.signal.aborted)break;
      try{const result=await syncRepository(repo,{signal:syncController.signal,existingSkills:skills,onProgress:p=>status(`正在同步 ${p.repo}${p.total?` · ${p.completed}/${p.total}`:' · 读取仓库目录…'}`)});result.skills.forEach(s=>{if(!previous.has(s.id))newIds.add(s.id)});skills=merge(skills,result.skills);count+=result.skills.length;if(result.partial)errors.push(`${repo}：${result.errors.join('；')||'部分条目尚未读取'}`);persist();render()}
      catch(error){if(syncController.signal.aborted)break;errors.push(`${repo}：${error.message}`);if(/额度|限制/.test(error.message))nextAuto=Date.now()+60*60*1000;}
    }
    if(syncController.signal.aborted){status('同步已停止，已获取内容已保留。')}
    else if(!errors.length){saveCache('lastSync',new Date().toISOString());status(`已检查 ${repos.length} 个仓库、${count} 个技能，本次新增 ${newIds.size} 项。未变化文件已复用缓存。`)}
    else status(`已更新 ${count} 个技能；现有目录仍可使用。\n${errors.join('\n')}`,true);
  }finally{setBusy(false);syncController=null;render();renderRepos();updateLiveState()}
}
$('#refresh').onclick=refreshAll;
$('#cancel-sync').onclick=()=>syncController?.abort();
for(const id of ['chinese-only','open-only','new-only'])$('#'+id).onchange=()=>{shown=18;render()};
$('#export-catalog').onclick=()=>{const data=view==='favorites'?skills.filter(s=>favorites.has(s.id)):skills;const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),skills:data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=view==='favorites'?'我的技能收藏.json':'技能检索目录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${data.length} 个技能`)};
function updateLiveState(){$('#live-state').textContent=!navigator.onLine?'○ 当前离线':!autoRefresh?'○ 自动更新已关闭':busy?'◉ 正在同步':nextAuto>Date.now()+AUTO_INTERVAL?'◉ 限流后延迟重试':'◉ 每 15 分钟检查更新'}
function maybeAuto(){updateLiveState();if(autoRefresh&&!busy&&!document.hidden&&navigator.onLine&&Date.now()>=nextAuto)refreshAll()}
setInterval(maybeAuto,30000);document.addEventListener('visibilitychange',maybeAuto);window.addEventListener('online',maybeAuto);window.addEventListener('offline',updateLiveState);

$('#search').addEventListener('input',()=>{shown=18;render()});
for(const id of ['source-filter','sort','kind-filter','windows-filter','key-filter'])$('#'+id).onchange=()=>{shown=18;render()};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;shown=18;render()});
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;shown=18;render()});
document.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>{$('#search').value=b.dataset.query;category='全部';shown=18;render();$('#search').focus()});
$('#cards').onclick=event=>{const compare=event.target.closest('[data-compare]');if(compare){toggleCompare(compare.dataset.compare);return}const favorite=event.target.closest('[data-favorite]');if(favorite){toggleFavorite(favorite.dataset.favorite);return}const detail=event.target.closest('[data-detail]');if(detail){const skill=skills.find(s=>s.id===detail.dataset.detail);if(skill){renderDetail(skill);showDialog('#detail-dialog')}}};
$('#load-more').onclick=()=>{shown+=18;render()};
$('#reset').onclick=()=>{category='全部';for(const id of ['source-filter','kind-filter','windows-filter','key-filter'])$('#'+id).value='all';for(const id of ['chinese-only','open-only','new-only'])$('#'+id).checked=false;$('#search').value='';shown=18;render()};
$('#sources-button').onclick=()=>{renderRepos();showDialog('#sources-dialog')};
$('#updates-button').onclick=()=>{renderUpdates();showDialog('#updates-dialog')};
$('#guide-button').onclick=$('#about-button').onclick=()=>showDialog('#guide-dialog');
document.querySelectorAll('.close-modal').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}}));
$('#auto-refresh').checked=autoRefresh;$('#auto-refresh').onchange=event=>{autoRefresh=event.target.checked;saveCache('autoRefresh',autoRefresh);toast(autoRefresh?'已开启每 15 分钟自动检查':'已关闭自动刷新，可随时手动更新');maybeAuto()};
$('#repo-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;$('#repo-error').textContent='';let repo;
  try{repo=normalizeRepository($('#repo-input').value)}catch(error){$('#repo-error').textContent=error.message;return}
  setBusy(true);
  try{const result=await syncRepository(repo,{existingSkills:skills,onProgress:p=>$('#repo-error').textContent=`正在读取 ${repo}${p.total?`：${p.completed}/${p.total}`:'…'}`});if(!result.skills.length)throw new Error(result.errors.join('；')||'该仓库没有找到可读取的 SKILL.md。');skills=merge(skills,result.skills);if(!repos.some(r=>r.toLowerCase()===repo.toLowerCase()))repos.push(repo);saveCache('repos',repos);persist();render();renderRepos();$('#repo-input').value='';$('#repo-error').textContent=result.partial?`已收录 ${result.skills.length} 项，部分读取未完成：${result.errors.join('；')}`:`已成功收录 ${result.skills.length} 个技能。`;toast(`已收录 ${repo}`)}catch(error){$('#repo-error').textContent=error.message}finally{setBusy(false)}
};
document.addEventListener('keydown',event=>{if(event.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){event.preventDefault();$('#search').focus()}});

const savedOrganization=loadCache('organization',{groups:['视频制作','编程','办公'],assignments:[]});
let groups=Array.isArray(savedOrganization?.groups)?savedOrganization.groups.filter(x=>typeof x==='string'&&x.length<=30):[];
let assignments=new Map(Array.isArray(savedOrganization?.assignments)?savedOrganization.assignments.filter(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'&&groups.includes(x[1])):[]);
let groupFilter='all',compared=new Set(),pendingBackup=null;
const healthCache=loadCache('sourceHealth',{});let sourceHealth=healthCache&&typeof healthCache==='object'&&!Array.isArray(healthCache)?healthCache:{};
const checkingSources=new Set();
function saveOrganization(){if(!saveCache('organization',{groups,assignments:[...assignments]}))toast('浏览器保存失败，请立即导出备份。')}
function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function groupOptions(selected,all=false){return `${all?'<option value="all">全部收藏</option>':''}<option value="" ${selected===''?'selected':''}>未分组</option>`+groups.map(g=>`<option value="${esc(g)}" ${selected===g?'selected':''}>${esc(g)}</option>`).join('')}
function renderCollectionControls(){
 $('#collection-controls').hidden=view!=='favorites';
 $('#group-filter').innerHTML=groupOptions(groupFilter,true);$('#group-filter').value=groupFilter;
 $('#compare-open').textContent=`对比已选（${compared.size}/3）`;
 $('#compare-clear').hidden=compared.size===0;
}
function sourceSummary(s){const h=sourceHealth[s.id];return h?.status==='missing'?'原文待处理':h?.status==='ok'?'来源可访问':h?.status==='unknown'?'检查未确认':s.repositoryInfo?.archived?'仓库已归档':'来源待复查'}
function renderExtraDetail(s){
 const h=sourceHealth[s.id],info=h?.info||s.repositoryInfo;
 const related=relatedSkills(s,skills);
 $('#detail-extras').innerHTML=`<section class="detail-section"><h3>安装与验证</h3><ol class="install-steps"><li>核对原文、依赖与费用</li><li>检查文件安装与 Codex 识别</li><li>检查命令和依赖是否可用</li><li>完成一个最小使用测试并保留结果</li></ol><p class="muted">网页不能读取你电脑的安装状态；以下提示交给 Codex 执行。复制提示不代表安装完成。</p><div class="detail-actions"><button class="button" id="copy-verify">复制验证提示</button><button class="button" id="show-install-plan">查看完整安装提示</button></div><textarea id="install-plan" class="prompt-preview" aria-label="安装与验证提示" readonly hidden></textarea></section>
 <section class="detail-section"><h3>来源与维护检查</h3><p><strong>${esc(sourceSummary(s))}</strong> · ${esc(maintenanceLabel(info))}</p><p>仓库许可证：${esc(info?.license||'待核实')}；单独技能可能采用其他许可，请核对原文。</p><p>${esc(h?.detail||'尚未进行本次在线检查。Star 数只反映关注度，不代表质量或安全。')}</p><p class="muted">${h?.checkedAt?'在线检查：'+esc(dateLabel(h.checkedAt)):'目录指标日期：'+esc(dateLabel(info?.checkedAt))}</p><button class="button" id="check-source" ${checkingSources.has(s.id)?'disabled':''}>${checkingSources.has(s.id)?'检查中…':'检查仓库与原文链接'}</button></section>
 <section class="detail-section"><h3>收藏分组</h3><label class="group-choice">加入分组<select id="assign-group">${groupOptions(assignments.get(s.id)||'')}</select></label><p class="muted">选择命名分组会同时收藏此条目；分组保存在当前浏览器。</p></section>
 <section class="detail-section"><h3>相似项目</h3><p class="muted">按用途分类和共同标签匹配，点击加入对比后横向查看条件。</p>${related.map(r=>`<div class="related-row"><div><strong>${esc(r.title)}</strong><small>${esc(r.repo)} · ${esc(r.category)}</small></div><button class="button small" data-add-compare="${esc(r.id)}">${compared.has(r.id)?'移出对比':'加入对比'}</button></div>`).join('')||'<p>暂无相似条目。</p>'}<button class="button" id="compare-current">${compared.has(s.id)?'移出当前项目':'对比当前项目'}</button><button class="button" id="compare-from-detail">打开对比</button></section>`;
 $('#copy-verify').onclick=()=>copyPromptText(installGuide(s,true));
 $('#show-install-plan').onclick=()=>{const p=$('#install-plan');p.hidden=!p.hidden;p.value=installGuide(s)};
 $('#assign-group').onchange=e=>{const group=e.target.value;if(group){favorites.add(s.id);assignments.set(s.id,group)}else assignments.delete(s.id);saveCache('favorites',[...favorites]);saveOrganization();render();$('#detail-favorite').textContent=favorites.has(s.id)?'★ 已收藏':'☆ 收藏技能'};
 $('#check-source').onclick=()=>checkSource(s);
 $('#compare-current').onclick=()=>toggleCompare(s.id);
 $('#compare-from-detail').onclick=()=>{$('#detail-dialog').close();openCompare()};
 $('#detail-extras').querySelectorAll('[data-add-compare]').forEach(b=>b.onclick=()=>toggleCompare(b.dataset.addCompare));
}
async function copyPromptText(text){try{await navigator.clipboard.writeText(text);toast('已复制，请在 Codex 中执行')}catch{const p=$('#install-plan');p.hidden=false;p.value=text;p.focus();p.select();toast('自动复制不可用，请复制已选中的提示')}}
async function checkSource(s){if(checkingSources.has(s.id))return;checkingSources.add(s.id);renderExtraDetail(s);try{sourceHealth[s.id]=await inspectSource(s);if(!saveCache('sourceHealth',sourceHealth))toast('检查完成，但结果未能保存')}finally{checkingSources.delete(s.id);render();if(activeSkill?.id===s.id&&$('#detail-dialog').open)renderExtraDetail(s)}}
function toggleCompare(id){if(compared.has(id))compared.delete(id);else{if(compared.size>=3){toast('最多同时对比 3 项，请先移出一项');return}compared.add(id)}render();if(activeSkill&&$('#detail-dialog').open)renderExtraDetail(activeSkill);if($('#compare-dialog').open)renderComparison()}
function openCompare(){renderComparison();showDialog('#compare-dialog')}
function renderComparison(){
 const selected=skills.filter(s=>compared.has(s.id));
 if(!selected.length){$('#comparison-content').innerHTML='<p>先在卡片或相似项目中加入 2–3 项，再来对比。</p>';return;}
 const rows=[['类型',s=>kindLabel(s.kind)],['适合做什么',s=>s.summary],['Windows',s=>requirementLabels.windows[normalizeRequirements(s.requirements).windows.status]],['API Key',s=>requirementLabels.apiKey[normalizeRequirements(s.requirements).apiKey.status]],['费用',s=>normalizeRequirements(s.requirements).cost.detail],['依赖和门槛',s=>normalizeRequirements(s.requirements).dependencies.join('；')||'待核实'],['使用限制',s=>s.caveat||'待核实'],['仓库许可证',s=>sourceHealth[s.id]?.info?.license||s.repositoryInfo?.license||'待核实'],['维护情况',s=>maintenanceLabel(sourceHealth[s.id]?.info||s.repositoryInfo)],['来源检查',sourceSummary]];
 $('#comparison-content').innerHTML=`<p class="muted">${selected.length<2?'目前只选了 1 项，可以再加入相似项目。':'根据已核实资料比较，未知条件保留待核实，不给未经验证的质量评分。'}</p><div class="table-scroll" tabindex="0" aria-label="项目对比表，可横向滚动"><table class="comparison-table"><thead><tr><th scope="col">对比项</th>${selected.map(s=>`<th scope="col">${esc(s.title)}<small>${esc(s.repo)}</small><button class="text-link" data-remove-compare="${esc(s.id)}">移出</button></th>`).join('')}</tr></thead><tbody>${rows.map(([title,get])=>`<tr><th scope="row">${title}</th>${selected.map(s=>`<td>${esc(get(s))}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">查看原文</th>${selected.map(s=>`<td><a class="text-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></td>`).join('')}</tr></tbody></table></div>`;
 $('#comparison-content').querySelectorAll('[data-remove-compare]').forEach(b=>b.onclick=()=>toggleCompare(b.dataset.removeCompare));
}
function renderGroupManager(){
 $('#group-list').innerHTML=groups.map((g,i)=>`<div class="group-row"><label>组名<input data-rename-group="${i}" value="${esc(g)}" maxlength="30"></label><button class="button small" data-save-group="${i}">保存名称</button><button class="button small" data-delete-group="${i}">移除分组</button></div>`).join('')||'<p>还没有分组。</p>';
 $('#group-list').querySelectorAll('[data-save-group]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.saveGroup),old=groups[i],name=$(`[data-rename-group="${i}"]`).value.trim();if(!name||name==='all'||name.length>30||(name!==old&&groups.includes(name))){toast('请输入不重复的分组名称（1–30 字）');return}groups[i]=name;assignments=new Map([...assignments].map(([id,g])=>[id,g===old?name:g]));if(groupFilter===old)groupFilter=name;saveOrganization();renderGroupManager();render()});
 $('#group-list').querySelectorAll('[data-delete-group]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.deleteGroup),name=groups[i];groups.splice(i,1);assignments=new Map([...assignments].filter(([,g])=>g!==name));if(groupFilter===name)groupFilter='all';saveOrganization();renderGroupManager();render();toast('分组已移除，原有收藏仍保留在未分组中')});
}
$('#group-filter').onchange=e=>{groupFilter=e.target.value;shown=18;render()};
$('#manage-groups').onclick=()=>{renderGroupManager();showDialog('#groups-dialog')};
$('#new-group-form').onsubmit=e=>{e.preventDefault();const name=$('#new-group-name').value.trim();if(!name||name==='all'||name.length>30||groups.includes(name)||groups.length>=100){toast('名称需为 1–30 字、不重复，最多 100 组');return}groups.push(name);saveOrganization();$('#new-group-name').value='';renderGroupManager();render()};
$('#backup-favorites').onclick=()=>downloadJSON({format:'skill-atlas-favorites',version:1,exportedAt:new Date().toISOString(),skills:skills.filter(s=>favorites.has(s.id)),groups,assignments:[...assignments].filter(([id])=>favorites.has(id)&&skills.some(s=>s.id===id))},'技能图谱-收藏备份.json');
$('#import-favorites').onclick=()=>{$('#backup-file').value='';$('#backup-file').click()};
$('#backup-file').onchange=async e=>{pendingBackup=null;const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('备份文件不能超过 5 MB。');pendingBackup=validateBackup(JSON.parse(await file.text()),normalizeSkill);if(new Set([...groups,...pendingBackup.groups]).size>100)throw Error('合并后超过 100 个分组，请先整理现有分组。');const existing=pendingBackup.skills.filter(s=>favorites.has(s.id)).length;$('#import-preview').textContent=`备份包含 ${pendingBackup.skills.length} 项收藏、${pendingBackup.groups.length} 个分组。其中 ${existing} 项已收藏。确认后合并，保留现有条目资料及已有分组；不覆盖其他收藏。`;showDialog('#import-dialog')}catch(error){toast('未导入：'+error.message)}};
$('#confirm-import').onclick=()=>{if(!pendingBackup)return;const data=pendingBackup,known=new Set(skills.map(s=>s.id));skills.push(...data.skills.filter(s=>!known.has(s.id)));data.skills.forEach(s=>favorites.add(s.id));groups=[...new Set([...groups,...data.groups])];for(const [id,g] of data.assignments)if(!assignments.has(id))assignments.set(id,g);persist();const ok=saveCache('favorites',[...favorites])&&saveCache('organization',{groups,assignments:[...assignments]});pendingBackup=null;$('#import-dialog').close();render();toast(ok?'收藏备份已合并并保存':'已合并到当前页面，但浏览器存储失败，请导出备份')};
$('#compare-open').onclick=openCompare;
$('#compare-clear').onclick=()=>{compared.clear();render()};


async function init(){
  try{const response=await fetch('./catalog.json');if(!response.ok)throw new Error('初始目录加载失败');const seed=await response.json();skills=mergeSeed(safeSkills(seed),safeSkills(arrayCache('skills')));render();nextAuto=0;updateLiveState();if(autoRefresh)setTimeout(maybeAuto,1800)}
  catch(error){skills=safeSkills(arrayCache('skills'));render();status(skills.length?'初始目录暂时无法加载，已显示浏览器缓存。':`${error.message}，请刷新页面重试。`,true)}
}
init();
loadUpdates();
