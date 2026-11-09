export function installGuide(s, verifyOnly=false) {
 const label={skill:'技能',plugin:'插件',tool:'软件工具'}[s.kind]||'项目';
 return `${verifyOnly?'请验证我是否已正确安装并能使用':'请先阅读官方说明，再帮我安装和验证'}这个${label}：\n${s.url}\n名称：${s.name}\n${s.kind==='skill'?'可使用 $skill-installer；这是 Skill，不要把它当成插件图标。':'按项目官方安装方式配置，不使用 Skill 安装器。'}\n1. 核对来源、许可证、系统兼容性、账号与费用。\n2. 检查安装文件和宿主是否识别；分别报告。\n3. 检查依赖、版本、命令可用性及必要配置；不要在聊天中输出密钥。\n4. 执行一个最小、可逆的实际使用测试，说明输入和预期结果。\n5. 分别报告“文件安装、宿主识别、依赖、实际运行”的通过/失败/未验证状态，并附证据和下一步。未完成的步骤不能称为安装成功。\n已知条件：${s.caveat||s.compatibility||'待核实'}`;
}
export function relatedSkills(skill, all, limit=3) {
 const tokens=s=>new Set([s.category,...s.tags.map(t=>t.toLowerCase())]);const base=tokens(skill);
 return all.filter(s=>s.id!==skill.id&&s.kind===skill.kind).map(s=>({skill:s,score:[...tokens(s)].reduce((n,t)=>n+(base.has(t)?(t===s.category?1:3):0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.skill.name.localeCompare(b.skill.name)).slice(0,limit).map(x=>x.skill);
}
export function validateBackup(data, normalize) {
 if(!data||data.format!=='skill-atlas-favorites'||data.version!==1||!Array.isArray(data.skills)||!Array.isArray(data.groups)||!Array.isArray(data.assignments))throw Error('请选择技能图谱导出的收藏备份（版本 1）。');
 if(data.skills.length>3000||data.groups.length>100||data.assignments.length>3000)throw Error('备份数量超出限制。');
 const skills=data.skills.map(normalize),ids=new Set(skills.map(s=>s.id));
 if(ids.size!==skills.length)throw Error('备份包含重复条目。');
 const groups=data.groups.map(g=>{if(typeof g!=='string'||!g.trim()||g.trim()==='all'||g.trim().length>30)throw Error('分组名称无效（不能为 all）。');return g.trim()});
 if(new Set(groups).size!==groups.length)throw Error('备份包含重复分组。');
 const seen=new Set();const assignments=data.assignments.map(a=>{if(!Array.isArray(a)||a.length!==2||!ids.has(a[0])||!groups.includes(a[1])||seen.has(a[0]))throw Error('备份中的分组关联无效。');seen.add(a[0]);return a;});
 return {skills,groups,assignments};
}
export function maintenanceLabel(info,now=Date.now()) {
 if(info?.archived)return '仓库已归档';
 const date=Date.parse(info?.pushedAt||info?.updatedAt||'');
 if(!Number.isFinite(date))return '维护时间待核实';
 const days=Math.max(0,Math.floor((now-date)/86400000));return days>365?'超过一年未见仓库更新':`距仓库更新 ${days} 天`;
}
export async function inspectSource(s, fetcher=fetch) {
 const repo=s.repo.split('/').map(encodeURIComponent).join('/');
 const checkedAt=new Date().toISOString();
 async function get(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await fetcher(url,{signal:controller.signal,headers:{Accept:'application/vnd.github+json'}})}finally{clearTimeout(timer)}}
 try {
  const r=await get(`https://api.github.com/repos/${repo}`);
  if(r.status===404)return {status:'missing',checkedAt,detail:'GitHub 未找到公开仓库（404）；可能删除、改名或转为私有。条目保留。'};
  if(!r.ok)return {status:'unknown',checkedAt,detail:r.status===403||r.status===429?'GitHub 限流或拒绝访问，无法判断是否失效。':`仓库检查返回 HTTP ${r.status}，暂不能确认。`};
  const meta=await r.json();
  const info={archived:!!meta.archived,license:meta.license?.spdx_id||'未声明',pushedAt:meta.pushed_at,updatedAt:meta.pushed_at,checkedAt,stars:meta.stargazers_count||0};
  const f=await get(`https://api.github.com/repos/${repo}/contents/${s.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(s.branch)}`);
  if(f.status===404)return {status:'missing',checkedAt,info,detail:'仓库可访问，但此分支的原文文件返回 404；可能移动或删除。条目保留。'};
  if(!f.ok)return {status:'unknown',checkedAt,info,detail:`仓库可访问；文件检查返回 HTTP ${f.status}，无法确认文件状态。`};
  const file=await f.json();
  if(Array.isArray(file)||file.type!=='file')return {status:'unknown',checkedAt,info,detail:'目标不是普通文件，需人工核对。'};
  return {status:'ok',checkedAt,info,detail:'仓库和原文文件均可访问。此检查不代表代码安全或已完成运行测试。'};
 }catch{return {status:'unknown',checkedAt,detail:'网络或请求超时，暂无法核实；没有判定为失效。'}}
}
