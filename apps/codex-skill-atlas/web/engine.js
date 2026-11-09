const CACHE_PREFIX = 'skill-atlas:';
export function normalizeRequirements(value = {}) {
  const input=value&&typeof value==='object'?value:{};
  const field=(name,allowed,fallback)=>({status:allowed.includes(input[name]?.status)?input[name].status:'unknown',detail:String(input[name]?.detail||fallback).slice(0,500)});
  return {windows:field('windows',['supported','unsupported','unknown'],'尚未核实 Windows 运行条件'),apiKey:field('apiKey',['required','not-required','unknown'],'尚未核实是否需要 API Key'),cost:field('cost',['free','conditional','paid','unknown'],'尚未核实费用；开源许可不等于服务免费'),dependencies:Array.isArray(input.dependencies)?input.dependencies.filter(x=>typeof x==='string').slice(0,12):[],checkedAt:typeof input.checkedAt==='string'?input.checkedAt:'',evidence:typeof input.evidence==='string'?input.evidence:''};
}
export function resolveQuery(value) {
  let q=String(value||'').normalize('NFKC').toLowerCase().trim();
  q=q.replace(/^(?:(?:请你|请|帮我|帮忙|麻烦你|我想要|我想|我要|我需要)\s*)+/,'');
  q=q.replace(/^(?:找|推荐)(?:一个|个|一些)?(?:可以|能够|能)?\s*/,'').replace(/(?:的)?(?:技能|插件|工具)\s*$/,'').trim();
  q=q.replace(/^(?:整理|处理|编辑|修复|修|优化)\s*(?=excel|表格|文档|网页|网站|pdf)/,'');
  return q;
}
const CATEGORIES = ['开发', '调试', '文档', '设计', '自动化', '研究'];
const GROUPS = [
  ['ppt', '做ppt', '幻灯片', '演示', '演示文稿', 'slides', 'slide', 'presentation', 'presentations', 'powerpoint', 'pptx'],
  ['pdf', 'pdf文档', '读pdf', '阅读pdf'],
  ['浏览器', '网页测试', 'playwright', 'browser', 'browsing', '浏览'],
  ['修bug', '修复bug', '修复', '调试', 'debug', 'debugging', 'bug', 'bugs', 'fix'],
  ['测试', '单元测试', 'test', 'tests', 'testing', 'tdd'],
  ['设计', 'design', 'figma', 'ui', 'ux'],
  ['部署', '发布', 'deploy', 'deployment', 'deployments', 'hosting'],
  ['表格', '电子表格', 'excel', 'spreadsheet', 'spreadsheets', 'xlsx', 'csv'],
  ['文档', 'document', 'documents', 'docx', 'word'],
  ['图片', '图像', '绘图', 'image', 'images', 'imagegen', 'image-gen'],
  ['研究', '检索', '调研', 'research', 'search'],
  ['自动化', 'automation', 'workflow', 'workflows'],
  ['安全', 'security', 'secure', 'vulnerability'],
  ['音频', '语音', 'audio', 'speech', 'transcribe', 'transcription'],
  ['视频', 'video', 'videos'],
  ['网页', '网站', 'web', 'website', 'frontend', 'front-end'],
  ['代码', '开发', 'code', 'coding', 'development'],
  ['审查', '评审', 'review', 'reviewing'],
  ['笔记', 'notion', 'notes'],
];

const clean = value => String(value ?? '').replace(/\u0000/g, '').trim();
const fold = value => clean(value).normalize('NFKC').toLowerCase();
const clip = (value, size = 450) => clean(value).slice(0, size);
const parts = path => path.split('/').map(encodeURIComponent).join('/');

export function normalizeRepository(value) {
  let input = clean(value);
  if (/^https:\/\/github\.com\//i.test(input)) {
    const url = new URL(input);
    if (url.username || url.password || url.search || url.hash || url.port) throw new Error('请输入 GitHub 仓库地址，不要附带查询参数。');
    input = url.pathname.replace(/^\/+|\/+$/g, '');
  }
  input = input.replace(/\.git$/, '').replace(/\/$/, '');
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/.test(input) || input.split('/')[1] === '..') {
    throw new Error('请输入 owner/repo 或 https://github.com/owner/repo 格式的公开仓库。');
  }
  return input;
}

function classify(text) {
  const s = fold(text);
  if (/debug|test|bug|审查|调试|测试|security|review/.test(s)) return '调试';
  if (/figma|design|image|设计|图像|图片|canvas/.test(s)) return '设计';
  if (/pdf|docx|document|spreadsheet|excel|slides|presentation|文档|表格|ppt/.test(s)) return '文档';
  if (/research|search|researcher|研究|检索|调研/.test(s)) return '研究';
  if (/workflow|automati|deploy|publish|notion|linear|自动化|部署|发布/.test(s)) return '自动化';
  return '开发';
}

function inferredTags(text) {
  const s = fold(text);
  return GROUPS.filter(group => group.some(term => term.length > 2 && s.includes(term)))
    .map(group => group.find(term => /[\u3400-\u9fff]/.test(term)) || group[0]).slice(0, 6);
}

function validPath(path) {
  return typeof path === 'string' && path.length <= 1000 && !path.startsWith('/') && !path.includes('\\') &&
    !path.split('/').some(part => part === '.' || part === '..') && /(^|\/)SKILL\.md$/.test(path);
}

export function normalizeSkill(item = {}) {
  const repo = normalizeRepository(item.repo);
  const path = clean(item.path);
  const kind = ['skill','plugin','tool'].includes(item.kind) ? item.kind : 'skill';
  if (kind === 'skill' ? !validPath(path) : (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p=>p==='..'||p==='.') || path.length>1000)) throw new Error('目录路径无效。');
  const branch = clean(item.branch || 'main');
  const name = clip(item.name || path.split('/').slice(-2, -1)[0] || repo.split('/')[1], 160);
  const description = clip(item.sourceDescription || item.summary, 1200);
  const id = `${repo.toLowerCase()}:${path}`;
  return {
    ...item, id, name, repo, path, branch, kind,
    requirements: normalizeRequirements(item.requirements),
    title: clip(item.title || name, 160),
    summary: clip(item.summary || description || '仓库没有提供简介，打开原文查看完整说明。', 600),
    sourceDescription: description,
    category: CATEGORIES.includes(item.category) ? item.category : classify(`${name} ${description}`),
    tags: [...new Set((Array.isArray(item.tags) ? item.tags : inferredTags(`${name} ${description}`)).map(tag => clip(tag, 60)).filter(Boolean))].slice(0, 12),
    url: `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${parts(path)}`,
    official: repo.toLowerCase() === 'openai/skills',
    compatibility: clip(item.compatibility || (repo.toLowerCase() === 'openai/skills' ? 'OpenAI Codex Skills' : '包含 SKILL.md；请核对工具依赖与 Codex 兼容性。'), 500),
    caveat: clip(item.caveat || '', 600),
    summaryType: item.summaryType || (/[\u3400-\u9fff]/.test(item.summary || '') ? 'curated' : 'extracted'),
  };
}

function yamlScalar(value) {
  let v = clean(value);
  if (v.startsWith('"') && v.endsWith('"')) { try { return JSON.parse(v); } catch {} }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v.replace(/\s+#.*$/, '');
}

function frontmatter(markdown) {
  const match = markdown.replace(/^\uFEFF/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  const fields = {};
  if (!match) return { fields, body: markdown };
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const field = lines[i].match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!field) continue;
    const key = field[1];
    let value = field[2];
    if (/^[>|][-+]?\s*$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim());
      value = block.join(value[0] === '|' ? '\n' : ' ').trim();
    } else if (!value || !/^["']/.test(value)) {
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s+[\w-]+:/.test(lines[i + 1])) value += ' ' + lines[++i].trim();
    }
    fields[key] = yamlScalar(value);
  }
  return { fields, body: markdown.slice(match[0].length) };
}

function proseExcerpt(body) {
  return body.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).map(p => p.trim())
    .find(p => p && !/^(#|!\[|\||[-*]\s|<)/.test(p))?.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ') || '';
}

export function parseSkillMarkdown(markdown, meta = {}) {
  if (typeof markdown !== 'string' || markdown.length > 500000) throw new Error('Skill 文档内容无效或过大。');
  const { fields, body } = frontmatter(markdown);
  const name = fields.name || meta.name || meta.path?.split('/').slice(-2, -1)[0];
  const sourceDescription = clip(fields.description || proseExcerpt(body), 1200);
  const curated = meta.summaryType === 'curated' || (!meta.summaryType && /[\u3400-\u9fff]/.test(meta.summary || ''));
  return normalizeSkill({
    ...meta, name, sourceDescription,
    summary: curated ? meta.summary : clip(sourceDescription, 600),
    summaryType: curated ? 'curated' : 'extracted',
    category: meta.category || classify(`${name} ${sourceDescription}`),
    tags: meta.tags || inferredTags(`${name} ${sourceDescription}`),
    compatibility: meta.compatibility || fields.compatibility,
    fetchedAt: new Date().toISOString(),
  });
}

function termsFor(term) {
  const matches = GROUPS.filter(group => group.includes(term));
  return [...new Set([term, ...matches.flat()])];
}

const QUERY_WORDS = [...new Set(GROUPS.flat())].sort((a, b) => b.length - a.length);
const QUERY_WORD_SET = new Set(QUERY_WORDS);

function queryTerms(value) {
  let query = resolveQuery(value).replace(/[，,;；。!?！？]/g, ' ');
  // Remove only an opening request phrase; meaningful search words remain AND-ed.
  query = query.replace(/^(?:(?:请(?:你)?|帮我|帮忙|麻烦(?:你)?|我想(?:要)?|我要|我需要)\s*)+/, '');
  const withoutMaking = query.replace(/^(?:做|制作)\s*(?:一(?:个|份|套)|个|份|套)?\s*/, '');
  if (withoutMaking !== query && QUERY_WORDS.some(word => withoutMaking.startsWith(word))) query = withoutMaking;
  function splitKnownCompound(token) {
    if (QUERY_WORD_SET.has(token) || !/[\u3400-\u9fff]/.test(token) || token.length > 80) return [token];
    // Split only if the ENTIRE compound consists of known concepts. Unknown words
    // remain mandatory, so "浏览器测试不存在" cannot silently become "浏览器 测试".
    const memo = new Map();
    function splitAt(offset) {
      if (offset === token.length) return [];
      if (memo.has(offset)) return memo.get(offset);
      for (const word of QUERY_WORDS) {
        if (!token.startsWith(word, offset)) continue;
        const rest = splitAt(offset + word.length);
        if (rest) { const result = [word, ...rest]; memo.set(offset, result); return result; }
      }
      memo.set(offset, null); return null;
    }
    return splitAt(0) || [token];
  }
  return query.split(/\s+/).filter(Boolean).flatMap(splitKnownCompound).slice(0, 20).map(termsFor);
}

export function searchSkills(skills, query = '', filters = {}) {
  const terms = queryTerms(query);
  const favorites = filters.favorites instanceof Set ? filters.favorites : new Set(filters.favorites || []);
  const matches = [];
  for (const skill of skills || []) {
    if(filters.kind && filters.kind !== 'all' && skill.kind !== filters.kind) continue;
    const requirements=normalizeRequirements(skill.requirements);
    if(filters.windows && filters.windows !== 'all' && requirements.windows.status !== filters.windows) continue;
    if(filters.apiKey && filters.apiKey !== 'all' && requirements.apiKey.status !== filters.apiKey) continue;
    if (filters.category && !['全部', 'all'].includes(filters.category) && skill.category !== filters.category) continue;
    if (filters.source === 'official' && !skill.official) continue;
    if (filters.source === 'community' && skill.official) continue;
    if (filters.source === 'favorites' && !favorites.has(skill.id)) continue;
    const name = fold(`${skill.name} ${skill.title}`);
    const tags = fold((skill.tags || []).join(' '));
    const body = fold(`${skill.summary} ${skill.sourceDescription || ''} ${skill.repo} ${skill.category}`);
    let score = skill.official ? 1 : 0;
    let matched = true;
    for (const alternatives of terms) {
      let best = 0;
      for (let i = 0; i < alternatives.length; i++) {
        const term = alternatives[i], penalty = i ? 0.7 : 1;
        const contains = text => /^[a-z0-9]+$/.test(term) && term.length <= 2 ? new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(text) : text.includes(term);
        if (name === term) best = Math.max(best, 30 * penalty);
        else if (contains(name)) best = Math.max(best, 15 * penalty);
        if (contains(tags)) best = Math.max(best, 9 * penalty);
        if (contains(body)) best = Math.max(best, 4 * penalty);
      }
      if (!best) { matched = false; break; }
      score += best;
    }
    if (matched) matches.push({ skill, score });
  }
  matches.sort((a, b) => {
    if (filters.sort === 'name') return a.skill.name.localeCompare(b.skill.name);
    if (filters.sort === 'stars') return (b.skill.repositoryInfo?.stars || 0)-(a.skill.repositoryInfo?.stars || 0) || a.skill.name.localeCompare(b.skill.name);
    if (filters.sort === 'updated') return (b.skill.repositoryInfo?.updatedAt || b.skill.fetchedAt || '').localeCompare(a.skill.repositoryInfo?.updatedAt || a.skill.fetchedAt || '') || a.skill.name.localeCompare(b.skill.name);
    return b.score - a.score || a.skill.name.localeCompare(b.skill.name);
  });
  return matches.map(result => result.skill);
}

export function loadCache(key, fallback = null) {
  try { const value = globalThis.localStorage?.getItem(CACHE_PREFIX + key); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function saveCache(key, value) {
  try { if (!globalThis.localStorage) return false; globalThis.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

async function fetchResource(url, { signal, json = false } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('连接 GitHub 超时，请稍后重试。')), 18000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: json ? { Accept: 'application/vnd.github+json' } : {} });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new Error('GitHub 请求额度暂时用尽或访问被限制，请稍后重试。已保存的目录仍可搜索。');
      if (response.status === 404) throw new Error('找不到公开仓库或文件，请检查仓库名称与分支。');
      throw new Error(`GitHub 返回 HTTP ${response.status}，请稍后重试。`);
    }
    return json ? await response.json() : await response.text();
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('连接 GitHub 超时，请稍后重试。');
    if (error instanceof TypeError) throw new Error('无法连接 GitHub，请检查网络；已保存的目录仍可使用。');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export async function syncRepository(input, { signal, onProgress = () => {}, existingSkills = [] } = {}) {
  const repo = normalizeRepository(input);
  onProgress({ repo, phase: 'repository', completed: 0, total: 0 });
  const metadata = await fetchResource(`https://api.github.com/repos/${repo}`, { signal, json: true });
  const branch = clean(metadata.default_branch);
  if (!branch) throw new Error('仓库没有可读取的默认分支。');
  const repositoryInfo = {license:metadata.license?.spdx_id || '未声明',stars:metadata.stargazers_count || 0,updatedAt:metadata.pushed_at,archived:!!metadata.archived,checkedAt:new Date().toISOString()};
  const repoSkills=existingSkills.filter(s=>fold(s.repo)===fold(repo));
  const cached=loadCache('repo-state:'+repo.toLowerCase());
  if(repoSkills.length&&cached?.updatedAt===metadata.pushed_at&&cached?.branch===branch){return {repo,branch,skills:repoSkills.map(s=>({...s,repositoryInfo})),repositoryInfo,partial:false,errors:[],totalFound:repoSkills.length,fetchedAt:new Date().toISOString(),unchanged:true};}
  const tree = await fetchResource(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { signal, json: true });
  if (!Array.isArray(tree.tree)) throw new Error('GitHub 没有返回有效的文件目录。');
  const allPaths = tree.tree.filter(entry => entry.type === 'blob' && validPath(entry.path) && !/(^|\/)(node_modules|vendor|\.git|\.claude|\.automations|\.vc|template|templates)(\/|$)/.test(entry.path)).map(entry => entry.path).sort();
  const hashes=new Map(tree.tree.map(entry=>[entry.path,entry.sha]));
  const current = new Map(existingSkills.filter(s => fold(s.repo) === fold(repo)).map(s => [s.path, s]));
  // Retain the curated catalog first when very large repositories exceed the per-refresh limit.
  const paths = allPaths.sort((a, b) => Number(current.has(b)) - Number(current.has(a)) || a.localeCompare(b)).slice(0, 60);
  const skills = [], errors = [];
  let next = 0, completed = 0;
  if (tree.truncated) errors.push('GitHub 返回的文件树不完整，本次结果可能遗漏部分目录。');
  if (allPaths.length > paths.length) errors.push(`仓库包含 ${allPaths.length} 个 Skill，本次最多读取 60 个。`);
  if (!paths.length) errors.push('该仓库没有找到 SKILL.md。');
  onProgress({ repo, phase: 'skills', completed, total: paths.length });
  async function worker() {
    while (next < paths.length) {
      if (signal?.aborted) throw signal.reason || new DOMException('已取消同步。', 'AbortError');
      const path = paths[next++];
      try {
        const old=current.get(path), blobSha=hashes.get(path);
        if(old?.blobSha===blobSha&&blobSha){skills.push({...old,repositoryInfo});continue;}
        const markdown = await fetchResource(`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${parts(path)}`, { signal });
        const parsed=parseSkillMarkdown(markdown, { ...old, repo, path, branch });
        parsed.summaryStale=!!(old?.summaryStale || (old?.summaryType==='curated'&&old?.sourceDescription&&old.sourceDescription!==old.summary&&old.sourceDescription!==parsed.sourceDescription));
        skills.push({...parsed,blobSha,repositoryInfo});
      } catch (error) {
        if (signal?.aborted) throw error;
        errors.push(`${path}: ${error.message || '读取失败'}`);
      } finally { completed++; onProgress({ repo, phase: 'skills', completed, total: paths.length }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, paths.length) }, worker));
  if (paths.length && !skills.length) throw new Error(errors[0] || '无法读取仓库中的 Skill 文件。');
  if(!errors.length)saveCache('repo-state:'+repo.toLowerCase(),{updatedAt:metadata.pushed_at,branch});
  return { repo, branch, repositoryInfo, skills: skills.sort((a, b) => a.name.localeCompare(b.name)), partial: errors.length > 0, errors, totalFound: allPaths.length, fetchedAt: new Date().toISOString() };
}
