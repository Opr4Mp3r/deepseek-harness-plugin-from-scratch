import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { marked } from 'marked'

const execFileAsync = promisify(execFile)
const root = await realpath(resolve(process.argv[2] ?? '.'))
const port = Number(process.argv[3] ?? '4175')
if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535))) {
  throw new Error(`invalid port: ${process.argv[3]}`)
}

marked.setOptions({ gfm: true })

let smoke
try {
  const { stdout } = await execFileAsync(process.execPath, [
    '--import',
    'tsx',
    'examples/progressive/tests/loader-runner.mjs',
    'examples/progressive/cordis.yml',
  ], { cwd: root })
  const line = stdout.split('\n').find(value => value.startsWith('DSH_TUTORIAL_RESULT '))
  if (line === undefined) throw new Error('Loader smoke did not emit a result')
  smoke = { ok: true, value: JSON.parse(line.slice('DSH_TUTORIAL_RESULT '.length)) }
} catch (error) {
  smoke = { ok: false, value: error instanceof Error ? error.message : String(error) }
}

const checkpointDefinitions = [
  {
    id: '01-plugin',
    title: '声明插件和依赖',
    heading: '第一步：声明插件身份和必需依赖',
    file: 'src/index.ts',
    snapshot: 'examples/progressive/checkpoints/01-plugin.ts',
    focus: [1, 2],
  },
  {
    id: '02-config',
    title: '加入运行时配置',
    heading: '第二步：同时定义类型和运行时 schema',
    file: 'src/index.ts',
    snapshot: 'examples/progressive/checkpoints/02-config.ts',
    focus: [6, 14],
  },
  {
    id: '03-tool',
    title: '注册完整工具',
    heading: '第三步：注册工具',
    file: 'src/index.ts',
    snapshot: 'examples/progressive/checkpoints/03-tool.ts',
    focus: [22, 27],
  },
]

const tutorialMarkdown = await readFile(resolve(root, 'docs/01-minimal-plugin.md'), 'utf8')
const tutorialCheckpoints = await Promise.all(checkpointDefinitions.map(async definition => ({
  ...definition,
  code: await readFile(resolve(root, definition.snapshot), 'utf8'),
})))

let previousCheckpointLine = -1
const tutorialLines = tutorialMarkdown.split('\n')
for (const checkpoint of tutorialCheckpoints) {
  const marker = `## ${checkpoint.heading}`
  const matchingLines = tutorialLines.flatMap((line, index) => line === marker ? [index] : [])
  if (matchingLines.length !== 1 || matchingLines[0] === undefined) {
    throw new Error(`tutorial checkpoint heading must appear exactly once: ${marker}`)
  }
  if (matchingLines[0] <= previousCheckpointLine) {
    throw new Error(`tutorial checkpoint headings are out of order: ${marker}`)
  }
  previousCheckpointLine = matchingLines[0]
}

const navigation = [
  ['/', '互动教程'],
  ['/README.md', '概览'],
  ['/docs/00-architecture-map.md', '00 · 架构地图'],
  ['/docs/01-minimal-plugin.md', '01 · 最小插件'],
  ['/docs/02-lifecycle-and-effects.md', '02 · 生命周期与 Effect'],
  ['/docs/03-capability-seams.md', '03 · 能力三角色'],
  ['/docs/04-events-and-durability.md', '04 · 事件与持久化'],
  ['/docs/05-testing-and-release.md', '05 · 测试与发布'],
  ['/docs/anti-patterns.md', '反模式'],
  ['/docs/checklist.md', '交付检查单'],
  ['/docs/audit-report.md', '审计证据'],
  ['/examples/progressive/checkpoints/03-tool.ts', '最终插件代码'],
]

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function slugify(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function addHeadingIds(html) {
  const counts = new Map()
  return html.replace(/<h([1-6])>(.*?)<\/h\1>/g, (_match, depth, content) => {
    const base = slugify(content) || 'section'
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    return `<h${depth} id="${id}">${content}<a class="anchor" href="#${id}" aria-label="链接到本节">#</a></h${depth}>`
  })
}

function renderCode(source, language) {
  const lines = source.replace(/\n$/, '').split('\n')
  return `<div class="code-frame"><div class="code-label">${escapeHtml(language)}</div><pre class="source"><code>${lines.map((line, index) => (
    `<span class="static-code-line" data-line="${index + 1}">${escapeHtml(line) || ' '}</span>`
  )).join('\n')}</code></pre></div>`
}

function navLinks(currentPath) {
  return navigation.map(([href, label]) => (
    `<a href="${href}"${href === currentPath ? ' aria-current="page"' : ''}>${label}</a>`
  )).join('')
}

function pageHead(title, extra = '') {
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)} · Harness Plugin from Scratch</title>${extra}`
}

function documentLayout(title, body, currentPath) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  ${pageHead(title)}
  <style>
    :root { color-scheme:light; --paper:#fdfcf9; --paper-deep:#f6f4ef; --panel:#faf8f3; --ink:#302f2c; --ink-soft:#68645d; --muted:#918b81; --line:#e3dfd7; --line-strong:#cbc5ba; --accent:#aa7256; --code:#4b4842; --new:#f6ecd8; --sans:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; --mono:"SFMono-Regular","Cascadia Code",Menlo,monospace; }
    @media (prefers-color-scheme:dark) { :root { color-scheme:dark; --paper:#191918; --paper-deep:#22211f; --panel:#1e1e1c; --ink:#ebe8e1; --ink-soft:#bbb6ac; --muted:#9b958b; --line:#35332f; --line-strong:#504c45; --accent:#d0a181; --code:#d9d5cc; --new:#382e23; } }
    * { box-sizing:border-box; }
    html { background:var(--paper); color:var(--ink); }
    body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.75 var(--sans); }
    a { color:inherit; }
    a:focus-visible,button:focus-visible,[tabindex]:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
    header { position:sticky; z-index:20; top:0; height:52px; display:flex; align-items:center; justify-content:space-between; padding:0 28px; border-bottom:1px solid var(--line); background:color-mix(in srgb,var(--paper) 94%,transparent); backdrop-filter:blur(12px); }
    header strong { font:600 12px var(--mono); }
    header>a { color:var(--muted); font:12px var(--mono); text-decoration:none; }
    .doc-shell { width:min(100%,1440px); display:grid; grid-template-columns:240px minmax(0,860px); gap:54px; margin:auto; padding:36px 28px 90px; }
    .doc-nav { position:sticky; top:82px; align-self:start; display:flex; flex-direction:column; gap:3px; }
    .doc-nav small { margin:0 12px 10px; color:var(--muted); font:11px var(--mono); letter-spacing:.12em; text-transform:uppercase; }
    .doc-nav a { padding:7px 12px; color:var(--muted); text-decoration:none; }
    .doc-nav a:hover,.doc-nav a[aria-current="page"] { background:var(--paper-deep); color:var(--ink); }
    .doc-nav a[aria-current="page"] { box-shadow:inset 2px 0 var(--accent); }
    main { min-width:0; }
    article h1 { margin:4px 0 30px; font-size:2.35rem; line-height:1.2; letter-spacing:-.035em; }
    article h2 { margin:46px 0 16px; padding-top:12px; border-top:1px solid var(--line); font-size:1.5rem; }
    article h3 { margin:30px 0 10px; }
    article p,article li { color:var(--ink-soft); }
    article a { color:var(--accent); text-underline-offset:3px; }
    .anchor { margin-left:.45em; color:var(--muted); font-weight:400; text-decoration:none; opacity:0; }
    h1:hover .anchor,h2:hover .anchor,h3:hover .anchor { opacity:1; }
    article blockquote { margin:22px 0; padding:10px 18px; border-left:2px solid var(--accent); background:var(--paper-deep); }
    article table { width:100%; display:block; overflow:auto; margin:22px 0; border-collapse:collapse; }
    article th,article td { padding:9px 12px; border:1px solid var(--line); text-align:left; }
    article th { background:var(--paper-deep); }
    article :not(pre)>code { padding:.12em .35em; border:1px solid var(--line); background:var(--paper-deep); color:var(--accent); font-family:var(--mono); }
    pre { overflow:auto; margin:20px 0; padding:18px 20px; border:1px solid var(--line); background:var(--panel); color:var(--code); font:12px/1.7 var(--mono); }
    .code-frame { overflow:hidden; border:1px solid var(--line); background:var(--panel); }
    .code-label { padding:8px 15px; border-bottom:1px solid var(--line); color:var(--muted); background:var(--paper-deep); font:11px var(--mono); }
    .code-frame pre { margin:0; border:0; padding-left:0; }
    .static-code-line { display:block; min-height:1.7em; padding-right:18px; }
    .static-code-line::before { content:attr(data-line); display:inline-block; width:52px; margin-right:18px; color:var(--muted); text-align:right; user-select:none; }
    @media (max-width:760px) { header { padding:0 18px; } .doc-shell { display:block; padding:24px 18px 70px; } .doc-nav { position:static; flex-direction:row; overflow:auto; margin-bottom:30px; padding-bottom:8px; } .doc-nav small { display:none; } .doc-nav a { flex:0 0 auto; white-space:nowrap; } }
  </style>
</head>
<body>
  <header><strong>DeepSeek Harness · Plugin from Scratch</strong><a href="/">进入互动教程 →</a></header>
  <div class="doc-shell">
    <nav class="doc-nav" aria-label="教程章节"><small>Reading path</small>${navLinks(currentPath)}</nav>
    <main><article>${body}</article></main>
  </div>
</body>
</html>`
}

function tutorialBody() {
  let markdown = tutorialMarkdown
  for (const checkpoint of tutorialCheckpoints) {
    const heading = `## ${checkpoint.heading}`
    const anchor = `<div class="checkpoint-anchor" data-checkpoint="${checkpoint.id}" aria-hidden="true"></div>\n\n`
    markdown = markdown.replace(heading, `${anchor}${heading}`)
  }
  return addHeadingIds(marked.parse(markdown))
}

function tutorialLayout() {
  const checkpointPayload = tutorialCheckpoints.map(({ id, title, file, focus, code }) => ({
    id,
    title,
    file,
    focus,
    repo: { [file]: code },
  }))
  const smokeText = escapeHtml(JSON.stringify(smoke.value, null, 2))
  const smokeLabel = smoke.ok ? '真实 Loader smoke 已通过' : '真实 Loader smoke 失败'
  const smokeClass = smoke.ok ? 'is-ok' : 'is-failed'

  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  ${pageHead('从一个最小 Consumer 开始')}
  <script>try{const theme=localStorage.getItem('reader-theme');if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme}catch{}</script>
  <style>
    :root {
      color-scheme:light;
      --paper:#fdfcf9; --paper-deep:#f6f4ef; --panel:#faf8f3; --active:#fffdfa;
      --ink:#302f2c; --ink-soft:#68645d; --muted:#918b81; --line:#e3dfd7; --line-strong:#cbc5ba;
      --accent:#b17b5e; --new-code:#f6ecd8; --code-ink:#4b4842; --line-number:#aaa49a;
      --syntax-keyword:#9b654f; --syntax-string:#62796b; --syntax-type:#706c91; --syntax-number:#947552; --syntax-comment:#969087;
      --backdrop:rgba(32,32,30,.42); --header-bg:rgba(253,252,249,.96);
      --header-height:52px; --small:12px; --base:16px;
      --sans:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
      --mono:"SFMono-Regular","Cascadia Code","Roboto Mono",Menlo,monospace;
    }
    :root[data-theme="dark"] { color-scheme:dark; --paper:#191918; --paper-deep:#22211f; --panel:#1e1e1c; --active:#28241f; --ink:#ebe8e1; --ink-soft:#bbb6ac; --muted:#9b958b; --line:#35332f; --line-strong:#504c45; --accent:#d0a181; --new-code:#382e23; --code-ink:#d9d5cc; --line-number:#777269; --syntax-keyword:#d6a38b; --syntax-string:#9fbea7; --syntax-type:#b4a0bd; --syntax-number:#c5a77d; --syntax-comment:#938f87; --backdrop:rgba(0,0,0,.66); --header-bg:rgba(25,25,24,.94); }
    @media (prefers-color-scheme:dark) {
      :root:not([data-theme="light"]) { color-scheme:dark; --paper:#191918; --paper-deep:#22211f; --panel:#1e1e1c; --active:#28241f; --ink:#ebe8e1; --ink-soft:#bbb6ac; --muted:#9b958b; --line:#35332f; --line-strong:#504c45; --accent:#d0a181; --new-code:#382e23; --code-ink:#d9d5cc; --line-number:#777269; --syntax-keyword:#d6a38b; --syntax-string:#9fbea7; --syntax-type:#b4a0bd; --syntax-number:#c5a77d; --syntax-comment:#938f87; --backdrop:rgba(0,0,0,.66); --header-bg:rgba(25,25,24,.94); }
    }
    * { box-sizing:border-box; }
    html { min-width:320px; overflow-x:clip; overscroll-behavior:none; background:var(--paper); color:var(--ink); scroll-behavior:auto; }
    body { margin:0; overflow-x:clip; overscroll-behavior:none; background:var(--paper); color:var(--ink); font:var(--base)/1.8 var(--sans); -webkit-font-smoothing:antialiased; }
    body.drawer-open { overflow:hidden; }
    button,a { -webkit-tap-highlight-color:transparent; }
    button { color:inherit; font:inherit; }
    button:focus-visible,a:focus-visible,[tabindex]:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
    ::selection { background:var(--new-code); }
    .site-header { position:fixed; z-index:50; inset:0 0 auto; height:var(--header-height); display:grid; grid-template-columns:1fr auto 1fr; align-items:center; padding:0 clamp(18px,3vw,48px); border-bottom:1px solid var(--line); background:var(--header-bg); backdrop-filter:blur(12px); }
    .brand { justify-self:start; display:flex; align-items:center; gap:9px; color:var(--ink); text-decoration:none; }
    .brand-mark { width:26px; height:26px; display:grid; place-items:center; border:1px solid var(--ink); font:var(--base) var(--mono); }
    .brand strong { font:600 var(--small) var(--mono); }
    .chapter-nav { align-self:stretch; display:flex; align-items:stretch; }
    .chapter-nav a { position:relative; min-width:112px; display:grid; place-items:center; padding:0 16px; color:var(--muted); font-size:var(--small); text-decoration:none; }
    .chapter-nav a::after { content:""; position:absolute; right:16px; bottom:-1px; left:16px; height:1px; background:var(--ink); transform:scaleX(0); transition:transform 220ms cubic-bezier(.16,1,.3,1); }
    .chapter-nav a:hover,.chapter-nav a[aria-current="page"] { color:var(--ink); }
    .chapter-nav a[aria-current="page"]::after { transform:scaleX(1); }
    .header-actions { justify-self:end; display:flex; align-items:center; gap:4px; }
    .github-link { min-height:34px; display:inline-flex; align-items:center; padding:0 8px; color:var(--muted); font:var(--small) var(--mono); text-decoration:none; }
    .header-action { width:34px; height:34px; display:grid; place-items:center; padding:0; border:0; background:transparent; color:var(--muted); cursor:pointer; }
    .header-action:hover,.github-link:hover,.header-action[aria-expanded="true"] { background:var(--paper-deep); color:var(--ink); }
    .header-action svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.6; }
    .mobile-nav-toggle { display:none; }
    .reading-progress { position:fixed; z-index:60; top:calc(var(--header-height) - 1px); right:0; left:0; height:1px; pointer-events:none; }
    .reading-progress span { display:block; width:0; height:100%; background:var(--accent); transition:width 90ms linear; }
    .reader-shell { min-height:100vh; padding-top:var(--header-height); }
    .reader-grid { width:min(100%,1800px); display:grid; grid-template-columns:minmax(440px,.78fr) minmax(620px,1.22fr); gap:clamp(46px,5vw,96px); margin:0 auto; padding:0 clamp(24px,3.6vw,64px) 84px; }
    .lesson-column { min-width:0; padding-bottom:72px; }
    .lesson-intro { padding:54px 0 24px; border-bottom:1px solid var(--line); color:var(--muted); font:var(--small) var(--mono); }
    .article-body { max-width:680px; padding-top:24px; }
    .article-body h1 { margin:0 0 32px; font-size:28px; line-height:1.3; letter-spacing:-.02em; }
    .article-body h2 { scroll-margin-top:calc(var(--header-height) + 28px); margin:44px 0 20px; padding-top:16px; border-top:1px solid var(--line); font-size:25px; line-height:1.4; letter-spacing:-.02em; }
    .article-body h3 { margin:26px 0 12px; font-size:var(--base); }
    .article-body p,.article-body li { color:var(--ink-soft); }
    .article-body a { color:var(--accent); text-underline-offset:3px; }
    .article-body .anchor { margin-left:.45em; color:var(--muted); font-weight:400; text-decoration:none; opacity:0; }
    .article-body h1:hover .anchor,.article-body h2:hover .anchor,.article-body h3:hover .anchor { opacity:1; }
    .article-body blockquote { margin:22px 0; padding:10px 18px; border-left:2px solid var(--accent); background:var(--paper-deep); }
    .article-body :not(pre)>code { padding:.12em .35em; border:1px solid var(--line); background:var(--paper-deep); color:var(--accent); font:var(--small) var(--mono); }
    .article-body pre { overflow:auto; margin:20px 0; padding:18px 20px; border:1px solid var(--line); background:var(--panel); color:var(--code-ink); font:var(--small)/1.7 var(--mono); }
    .checkpoint-anchor { height:0; scroll-margin-top:calc(var(--header-height) + 28px); }
    .smoke-inline { margin:52px 0 0; border:1px solid var(--line-strong); background:var(--panel); }
    .smoke-inline header { display:flex; align-items:center; gap:9px; padding:12px 15px; border-bottom:1px solid var(--line); font:600 var(--small) var(--mono); }
    .smoke-dot { width:8px; height:8px; border-radius:50%; background:#c46a50; }
    .smoke-inline.is-ok .smoke-dot { background:#5c9a77; }
    .smoke-inline pre { max-height:260px; margin:0; border:0; white-space:pre-wrap; }
    .smoke-inline p { margin:0; padding:10px 15px; border-top:1px solid var(--line); color:var(--muted); font-size:var(--small); }
    .panel-column { min-width:0; padding-top:24px; }
    .code-panel { position:sticky; top:calc(var(--header-height) + 24px); height:calc(100dvh - var(--header-height) - 48px); min-height:580px; overflow:hidden; border:1px solid var(--line-strong); background:var(--panel); overscroll-behavior:contain; }
    .panel-heading { height:52px; display:flex; align-items:center; padding:0 18px; border-bottom:1px solid var(--line); background:var(--paper); font:var(--small) var(--mono); }
    .panel-heading strong { font-weight:600; }
    .editor-lock { width:32px; height:32px; display:grid; place-items:center; margin-left:auto; padding:0; border:0; background:transparent; color:var(--muted); cursor:pointer; }
    .editor-lock:hover,.editor-lock.is-active { background:var(--paper-deep); color:var(--ink); }
    .editor-lock svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.7; }
    .repo-workspace { height:calc(100% - 52px); display:grid; grid-template-columns:146px minmax(0,1fr); }
    .file-tree { overflow-y:auto; padding:12px 8px; border-right:1px solid var(--line); background:var(--paper-deep); overscroll-behavior:none; }
    .tree-root { display:flex; align-items:center; gap:7px; padding:8px 7px 10px; color:var(--ink-soft); font:var(--small) var(--mono); }
    .tree-root svg,.file-tree button svg,.code-tab svg { width:14px; height:14px; flex:0 0 auto; fill:none; stroke:currentColor; stroke-width:1.6; }
    .file-tree button { position:relative; width:100%; min-height:34px; display:grid; grid-template-columns:16px minmax(0,1fr) 13px; align-items:center; gap:5px; padding:0 7px 0 12px; border:0; background:transparent; color:var(--ink-soft); font:var(--small) var(--mono); text-align:left; cursor:pointer; }
    .file-tree button:hover,.file-tree button.is-active { background:var(--paper); color:var(--ink); }
    .file-tree button.is-new-file { transform-origin:14px center; animation:file-birth 820ms cubic-bezier(.2,1.45,.32,1) both; }
    .file-tree button span { overflow:hidden; text-overflow:ellipsis; }
    .file-complete { color:var(--accent); font-style:normal; }
    .empty-tree { margin:8px 0 0 26px; color:var(--muted); font:var(--small) var(--mono); }
    .code-stage { position:relative; min-width:0; overflow:hidden; background:var(--panel); }
    .code-tabs { height:36px; display:flex; align-items:center; overflow-x:auto; overflow-y:hidden; border-bottom:1px solid var(--line); background:var(--paper-deep); scrollbar-width:none; }
    .code-tab { height:35px; min-width:130px; max-width:190px; flex:0 0 auto; display:flex; align-items:center; border-right:1px solid var(--line); background:var(--paper); color:var(--ink-soft); font:var(--small) var(--mono); }
    .code-tab:not(.is-active) { background:var(--paper-deep); }
    .code-tab.is-active { color:var(--ink); }
    .code-tab-select { min-width:0; flex:1; align-self:stretch; display:flex; align-items:center; gap:7px; padding:0 5px 0 12px; border:0; background:transparent; color:inherit; cursor:pointer; }
    .code-tab-select span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .code-tab-close { width:28px; height:28px; flex:0 0 auto; display:grid; place-items:center; margin-right:3px; padding:0; border:0; background:transparent; color:var(--muted); cursor:pointer; opacity:0; }
    .code-tab:hover .code-tab-close,.code-tab.is-active .code-tab-close,.code-tab-close:focus-visible { opacity:1; }
    .code-tab-close:hover { background:var(--line); color:var(--ink); }
    .code-scroll { position:absolute; inset:36px 0 0; overflow:auto; padding:12px 0 22px; overscroll-behavior:none; overflow-anchor:none; scrollbar-color:var(--line-strong) transparent; scrollbar-width:thin; }
    .code-line { position:relative; min-width:max-content; min-height:22px; display:grid; grid-template-columns:46px minmax(0,1fr); padding-right:22px; color:var(--code-ink); font:var(--small)/22px var(--mono); white-space:pre; }
    .code-line.is-new { background:var(--new-code); }
    .code-line.is-new::after { content:""; position:absolute; inset:0 auto 0 0; width:2px; background:var(--accent); }
    .line-number { padding-right:10px; border-right:1px solid var(--line); color:var(--line-number); text-align:right; user-select:none; }
    .code-line code { padding-left:12px; }
    .code-line.is-entering code { display:block; width:max-content; clip-path:inset(0 100% 0 0); animation:code-write var(--write-duration,640ms) steps(18,end) forwards; animation-delay:calc(var(--write-delay,0ms) + 90ms); }
    .syn-keyword { color:var(--syntax-keyword); } .syn-string { color:var(--syntax-string); } .syn-type { color:var(--syntax-type); } .syn-number { color:var(--syntax-number); } .syn-comment { color:var(--syntax-comment); font-style:italic; }
    .empty-code { position:absolute; inset:36px 0 0; display:grid; place-content:center; justify-items:center; padding:30px; color:var(--muted); text-align:center; }
    .empty-code[hidden] { display:none; }
    .empty-code strong { margin-top:12px; color:var(--ink-soft); font:600 var(--small) var(--mono); }
    .empty-code p { margin:7px 0 0; font-size:var(--small); }
    .drawer-close,.drawer-backdrop,.mobile-panel-button { display:none; }
    @keyframes code-write { from { clip-path:inset(0 100% 0 0); } to { clip-path:inset(0); } }
    @keyframes file-birth { 0% { opacity:0; filter:blur(5px); transform:translate3d(-18px,0,0) scale(.58); } 54% { opacity:1; filter:blur(0); transform:translate3d(4px,0,0) scale(1.09); } 74% { transform:translate3d(-2px,0,0) scale(.97); } 100% { opacity:1; transform:none; } }
    @media (max-width:1180px) {
      .reader-grid { display:block; width:min(100%,820px); }
      .article-body { max-width:none; }
      .panel-column { position:fixed; z-index:82; right:12px; bottom:12px; left:12px; height:min(80vh,760px); padding:0; opacity:0; pointer-events:none; transform:translateY(calc(100% + 24px)); transition:transform 320ms cubic-bezier(.16,1,.3,1),opacity 180ms ease; }
      .panel-column.is-mobile-open { opacity:1; pointer-events:auto; transform:translateY(0); }
      .code-panel { position:relative; top:auto; height:100%; min-height:0; }
      .editor-lock { display:none; }
      .drawer-close { position:absolute; z-index:5; top:8px; right:8px; width:36px; height:36px; display:grid; place-items:center; padding:0; border:1px solid var(--line); background:var(--paper); color:var(--ink); cursor:pointer; }
      .drawer-backdrop { position:fixed; z-index:80; inset:0; display:block; border:0; background:var(--backdrop); cursor:pointer; }
      .drawer-backdrop[hidden] { display:none; }
      .mobile-panel-button { position:fixed; z-index:45; right:18px; bottom:18px; min-height:42px; display:inline-flex; align-items:center; gap:8px; padding:0 14px; border:1px solid var(--ink); background:var(--ink); color:var(--paper); font-size:var(--small); cursor:pointer; }
      .mobile-panel-button svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.6; }
      .mobile-panel-button span { color:var(--line-strong); font:var(--small) var(--mono); }
    }
    @media (max-width:680px) {
      .site-header { grid-template-columns:1fr auto; padding:0 16px; }
      .brand strong { max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .mobile-nav-toggle { display:grid; }
      .chapter-nav { position:fixed; z-index:70; top:var(--header-height); right:0; left:0; display:flex; visibility:hidden; flex-direction:column; align-items:stretch; padding:8px 16px 12px; border-bottom:1px solid var(--line-strong); background:var(--paper); box-shadow:0 18px 34px rgba(0,0,0,.24); pointer-events:none; transform:translateY(-110%); transition:transform 240ms cubic-bezier(.16,1,.3,1),visibility 0s linear 240ms; }
      .chapter-nav.is-open { visibility:visible; pointer-events:auto; transform:none; transition-delay:0s; }
      .chapter-nav a { min-height:46px; display:flex; justify-content:flex-start; padding:0 12px; border-bottom:1px solid var(--line); }
      .chapter-nav a:last-child { border-bottom:0; }
      .chapter-nav a::after { right:auto; left:12px; width:32px; }
      .reader-grid { padding:0 18px 72px; }
      .lesson-intro { padding-top:38px; }
      .article-body pre { margin-right:-18px; margin-left:-18px; border-right:0; border-left:0; }
      .repo-workspace { grid-template-columns:1fr; grid-template-rows:52px minmax(0,1fr); }
      .file-tree { display:flex; align-items:center; gap:4px; overflow-x:auto; overflow-y:hidden; padding:8px; border-right:0; border-bottom:1px solid var(--line); }
      .tree-root { flex:0 0 auto; }
      .file-tree button { width:auto; min-width:max-content; grid-template-columns:15px auto 12px; padding:0 8px; }
    }
    @media (prefers-reduced-motion:reduce) {
      html,.code-scroll { scroll-behavior:auto; }
      *,*::before,*::after { animation-duration:.01ms !important; animation-delay:0ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/"><span class="brand-mark">D</span><strong>Harness Plugin from Scratch</strong></a>
    <nav class="chapter-nav" id="chapter-nav" aria-label="教程章节">
      <a href="/" aria-current="page">最小插件</a>
      <a href="/docs/00-architecture-map.md">架构地图</a>
      <a href="/docs/05-testing-and-release.md">测试与发布</a>
    </nav>
    <div class="header-actions">
      <a class="github-link" href="https://github.com/Opr4Mp3r/deepseek-harness-plugin-from-scratch">GitHub ↗</a>
      <button class="header-action" id="theme-toggle" type="button" aria-label="切换浅色或深色模式" title="切换主题">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
      <button class="header-action mobile-nav-toggle" id="mobile-nav-toggle" type="button" aria-label="打开章节导航" aria-controls="chapter-nav" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>
      </button>
    </div>
  </header>
  <div class="reading-progress" aria-hidden="true"><span id="reading-progress-bar"></span></div>
  <main class="reader-shell">
    <section class="reader-grid">
      <article class="lesson-column" id="lesson-article">
        <div class="lesson-intro">沿着真实装配路径阅读；正文越过视口中的阅读线时，右侧源码随之演进。</div>
        <div class="article-body">${tutorialBody()}</div>
        <section class="smoke-inline ${smokeClass}" aria-label="运行验证">
          <header><span class="smoke-dot" aria-hidden="true"></span>${smokeLabel}</header>
          <pre>${smokeText}</pre>
          <p>真实 Loader + Include · keyless · 预览启动时执行</p>
        </section>
      </article>
      <div class="panel-column" id="panel-column" aria-label="随阅读演进的代码仓库">
        <button class="drawer-close" id="drawer-close" type="button" aria-label="关闭代码面板">×</button>
        <aside class="code-panel" id="code-panel" aria-label="随阅读演进的代码仓库">
          <div class="panel-heading">
            <strong>progressive /</strong>
            <button class="editor-lock" id="editor-lock" type="button" aria-pressed="false"></button>
          </div>
          <div class="repo-workspace">
            <nav class="file-tree" id="file-tree" aria-label="仓库文件"></nav>
            <div class="code-stage">
              <div class="code-tabs" id="code-tabs" role="tablist" aria-label="已打开的文件"></div>
              <div class="code-scroll" id="code-scroll" tabindex="0" aria-label="源码"></div>
              <div class="empty-code" id="empty-code"><span aria-hidden="true">{ }</span><strong>仓库还是空的</strong><p>读到第一个 checkpoint，代码才会出现。</p></div>
            </div>
          </div>
        </aside>
      </div>
    </section>
    <button class="drawer-backdrop" id="drawer-backdrop" type="button" aria-label="关闭代码面板" hidden></button>
    <button class="mobile-panel-button" id="mobile-panel-button" type="button" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-4 4 4 4m6-8 4 4-4 4"/></svg> 查看代码 <span id="mobile-completion">0%</span>
    </button>
  </main>
  <script>
    const checkpoints = ${safeJson(checkpointPayload)}
    const finalRepo = checkpoints.length ? checkpoints[checkpoints.length - 1].repo : {}
    const icons = {
      folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v9H3z"/></svg>',
      file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
      unlocked: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M9 10V7a4 4 0 0 1 7-2.7"/></svg>',
      locked: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    }
    const article = document.querySelector('#lesson-article')
    const anchors = Array.from(article.querySelectorAll('[data-checkpoint]'))
    const progressBar = document.querySelector('#reading-progress-bar')
    const fileTree = document.querySelector('#file-tree')
    const codeTabs = document.querySelector('#code-tabs')
    const codeScroll = document.querySelector('#code-scroll')
    const emptyCode = document.querySelector('#empty-code')
    const lockButton = document.querySelector('#editor-lock')
    const panelColumn = document.querySelector('#panel-column')
    const drawerOpenButton = document.querySelector('#mobile-panel-button')
    const drawerCloseButton = document.querySelector('#drawer-close')
    const drawerBackdrop = document.querySelector('#drawer-backdrop')
    const mobileCompletion = document.querySelector('#mobile-completion')
    const themeButton = document.querySelector('#theme-toggle')
    const mobileNavButton = document.querySelector('#mobile-nav-toggle')
    const chapterNav = document.querySelector('#chapter-nav')
    const state = {
      activeIndex: -1,
      repo: {},
      previousRepo: {},
      newFiles: new Set(),
      openFiles: [],
      fileChoice: null,
      navigationLocked: false,
      selectionCause: 'checkpoint',
      scrollPositions: new Map(),
      suppressedAnimationPhases: new Set(),
      drawerOpen: false,
      mobileNavOpen: false,
    }

    function resolvedTheme() {
      return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')
    }

    function updateThemeButton() {
      const next = resolvedTheme() === 'dark' ? '浅色' : '深色'
      themeButton.setAttribute('aria-label', '切换到' + next + '模式')
      themeButton.title = '切换到' + next + '模式'
    }

    themeButton.addEventListener('click', function () {
      const next = resolvedTheme() === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try { localStorage.setItem('reader-theme', next) } catch {}
      updateThemeButton()
    })

    function setMobileNav(open) {
      state.mobileNavOpen = open
      chapterNav.classList.toggle('is-open', open)
      mobileNavButton.setAttribute('aria-expanded', String(open))
      mobileNavButton.setAttribute('aria-label', open ? '关闭章节导航' : '打开章节导航')
    }

    mobileNavButton.addEventListener('click', function () { setMobileNav(!state.mobileNavOpen) })
    chapterNav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMobileNav(false)
    })

    function splitCode(value) {
      if (!value) return []
      return value.replace(/\n$/, '').split('\n')
    }

    function addedLines(previous, current) {
      const before = splitCode(previous)
      const after = splitCode(current)
      if (!before.length) return new Set(after.map(function (_line, index) { return index + 1 }))
      const matrix = Array.from({ length: before.length + 1 }, function () {
        return new Uint16Array(after.length + 1)
      })
      for (let i = 1; i <= before.length; i += 1) {
        for (let j = 1; j <= after.length; j += 1) {
          matrix[i][j] = before[i - 1] === after[j - 1]
            ? matrix[i - 1][j - 1] + 1
            : Math.max(matrix[i - 1][j], matrix[i][j - 1])
        }
      }
      const matched = new Set()
      let i = before.length
      let j = after.length
      while (i > 0 && j > 0) {
        if (before[i - 1] === after[j - 1]) {
          matched.add(j)
          i -= 1
          j -= 1
        } else if (matrix[i - 1][j] >= matrix[i][j - 1]) {
          i -= 1
        } else {
          j -= 1
        }
      }
      return new Set(after.map(function (_line, index) { return index + 1 }).filter(function (line) {
        return !matched.has(line)
      }))
    }

    function escape(value) {
      return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    }

    function highlightLine(raw) {
      if (!raw) return '&nbsp;'
      if (/^\s*\*/.test(raw)) return '<span class="syn-comment">' + escape(raw) + '</span>'
      const pattern = /(\/\/.*|\/\*.*?\*\/|\x60(?:\\.|[^\x60\\])*\x60|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:import|from|export|const|let|function|async|return|if|throw|new|interface|type|as|true|false|void)\b|\b(?:string|boolean|Context|Config|ResolvedConfig)\b|\b\d+(?:\.\d+)?\b)/g
      let html = ''
      let last = 0
      for (const match of raw.matchAll(pattern)) {
        const index = match.index ?? 0
        html += escape(raw.slice(last, index))
        const token = match[0]
        let className = 'syn-keyword'
        if (token.startsWith('//') || token.startsWith('/*')) className = 'syn-comment'
        else if (/^[\"'\x60]/.test(token)) className = 'syn-string'
        else if (/^\d/.test(token)) className = 'syn-number'
        else if (/^(string|boolean|Context|Config|ResolvedConfig)$/.test(token)) className = 'syn-type'
        html += '<span class="' + className + '">' + escape(token) + '</span>'
        last = index + token.length
      }
      return html + escape(raw.slice(last))
    }

    function phaseId() {
      return state.activeIndex >= 0 ? checkpoints[state.activeIndex].id : 'initial'
    }

    function selectedFile() {
      const checkpoint = state.activeIndex >= 0 ? checkpoints[state.activeIndex] : null
      const choiceApplies = state.fileChoice && (state.navigationLocked || state.fileChoice.checkpointId === phaseId())
      if (choiceApplies) {
        return state.fileChoice.file && Object.hasOwn(state.repo, state.fileChoice.file) ? state.fileChoice.file : ''
      }
      if (checkpoint && Object.hasOwn(state.repo, checkpoint.file)) return checkpoint.file
      return Object.keys(state.repo)[0] || ''
    }

    function saveScroll() {
      const file = selectedFile()
      if (!file || codeScroll.hidden) return
      state.scrollPositions.set(file, { top: codeScroll.scrollTop, left: codeScroll.scrollLeft })
    }

    function fileChanges(file) {
      if (state.activeIndex < 0) return new Set()
      const checkpoint = checkpoints[state.activeIndex]
      if (checkpoint.file !== file) return new Set()
      return addedLines(state.previousRepo[file] || '', state.repo[file] || '')
    }

    function updateLockButton() {
      lockButton.classList.toggle('is-active', state.navigationLocked)
      lockButton.setAttribute('aria-pressed', String(state.navigationLocked))
      lockButton.setAttribute('aria-label', state.navigationLocked ? '解除编辑器锁定并继续跟随阅读' : '锁定编辑器，停止自动导航')
      lockButton.title = state.navigationLocked ? '继续跟随阅读' : '停止跟随阅读'
      lockButton.innerHTML = state.navigationLocked ? icons.locked : icons.unlocked
    }

    function updateCompletion() {
      const completion = state.activeIndex < 0 ? 0 : Math.round((state.activeIndex + 1) / checkpoints.length * 100)
      mobileCompletion.textContent = completion + '%'
    }

    function renderPanel(options) {
      const opts = options || {}
      const files = Object.keys(state.repo)
      const selected = selectedFile()
      const availableOpen = state.openFiles.filter(function (file) { return Object.hasOwn(state.repo, file) })
      const visibleOpen = selected && !availableOpen.includes(selected) ? availableOpen.concat(selected) : availableOpen

      fileTree.innerHTML = '<div class="tree-root">' + icons.folder + ' src</div>' + (files.length
        ? files.map(function (file) {
            const active = selected === file ? ' is-active' : ''
            const fresh = state.newFiles.has(file) && !state.suppressedAnimationPhases.has(phaseId()) ? ' is-new-file' : ''
            const complete = finalRepo[file] === state.repo[file] ? '<i class="file-complete" aria-label="已完成">✓</i>' : ''
            return '<button type="button" class="' + (active + fresh).trim() + '" data-file="' + escape(file) + '" title="' + escape(file) + '">' + icons.file + '<span>' + escape(file.replace('src/', '')) + '</span>' + complete + '</button>'
          }).join('')
        : '<p class="empty-tree">空目录</p>')

      codeTabs.innerHTML = visibleOpen.map(function (file) {
        const active = selected === file ? ' is-active' : ''
        return '<div class="code-tab' + active + '" role="presentation"><button class="code-tab-select" type="button" role="tab" aria-selected="' + String(selected === file) + '" data-file="' + escape(file) + '">' + icons.file + '<span>' + escape(file.replace('src/', '')) + '</span></button><button class="code-tab-close" type="button" data-close-file="' + escape(file) + '" aria-label="关闭 ' + escape(file) + '">×</button></div>'
      }).join('')

      if (!selected || !Object.hasOwn(state.repo, selected)) {
        codeScroll.hidden = true
        emptyCode.hidden = false
        const hasFiles = files.length > 0
        emptyCode.innerHTML = '<span aria-hidden="true">{ }</span><strong>' + (hasFiles ? '没有打开的文件' : '仓库还是空的') + '</strong><p>' + (hasFiles ? '从文件树重新打开一个文件。' : '读到第一个 checkpoint，代码才会出现。') + '</p>'
        updateLockButton()
        updateCompletion()
        return
      }

      const code = state.repo[selected] || ''
      const lines = splitCode(code)
      const changed = fileChanges(selected)
      const changedOrder = new Map(Array.from(changed).sort(function (a, b) { return a - b }).map(function (line, index) { return [line, index] }))
      const checkpoint = state.activeIndex >= 0 ? checkpoints[state.activeIndex] : null
      const shouldAnimate = checkpoint && checkpoint.file === selected && !state.suppressedAnimationPhases.has(phaseId())
      const lead = state.newFiles.has(selected) ? 820 : 120

      codeScroll.innerHTML = lines.map(function (line, index) {
        const number = index + 1
        const changedLine = changed.has(number)
        const entering = changedLine && shouldAnimate
        const order = changedOrder.get(number) || 0
        const delay = lead + Math.min(order * 28, 900)
        const duration = Math.min(640, Math.max(260, line.length * 10))
        const classes = 'code-line' + (changedLine ? ' is-new' : '') + (entering ? ' is-entering' : '')
        const style = entering ? ' style="--write-delay:' + delay + 'ms;--write-duration:' + duration + 'ms"' : ''
        return '<div class="' + classes + '" data-line="' + number + '"' + style + '><span class="line-number">' + number + '</span><code>' + highlightLine(line) + '</code></div>'
      }).join('')
      codeScroll.hidden = false
      emptyCode.hidden = true
      codeScroll.setAttribute('aria-label', selected)
      updateLockButton()
      updateCompletion()

      requestAnimationFrame(function () {
        if (opts.followCheckpoint && checkpoint && !state.navigationLocked && selected === checkpoint.file) {
          const focusLine = checkpoint.focus ? checkpoint.focus[0] : (changed.size ? Math.min.apply(null, Array.from(changed)) : 1)
          const target = codeScroll.querySelector('[data-line="' + focusLine + '"]')
          if (target) codeScroll.scrollTo({ top: Math.max(0, target.offsetTop - codeScroll.clientHeight * 0.28), left: 0, behavior: 'auto' })
        } else {
          const saved = state.scrollPositions.get(selected)
          if (saved) codeScroll.scrollTo({ top: saved.top, left: saved.left, behavior: 'auto' })
        }
      })
    }

    function activateCheckpoint(next) {
      if (next === state.activeIndex) return
      saveScroll()
      state.activeIndex = next
      const checkpoint = next >= 0 ? checkpoints[next] : null
      const previous = next > 0 ? checkpoints[next - 1].repo : {}
      state.previousRepo = previous
      state.repo = checkpoint ? checkpoint.repo : {}
      state.newFiles = new Set(Object.keys(state.repo).filter(function (file) { return !Object.hasOwn(previous, file) }))
      if (!state.navigationLocked) {
        state.fileChoice = null
        state.selectionCause = 'checkpoint'
        if (checkpoint && !state.openFiles.includes(checkpoint.file)) state.openFiles.push(checkpoint.file)
      } else {
        state.selectionCause = 'settled'
      }
      renderPanel({ followCheckpoint: !state.navigationLocked })
    }

    function manuallySelect(file) {
      if (!Object.hasOwn(state.repo, file)) return
      saveScroll()
      if (!state.openFiles.includes(file)) state.openFiles.push(file)
      state.fileChoice = { checkpointId: phaseId(), file: file }
      state.selectionCause = 'manual'
      state.suppressedAnimationPhases.add(phaseId())
      renderPanel({ followCheckpoint: false })
    }

    function closeFile(file) {
      saveScroll()
      const available = state.openFiles.filter(function (item) { return Object.hasOwn(state.repo, item) })
      const index = available.indexOf(file)
      state.openFiles = state.openFiles.filter(function (item) { return item !== file })
      if (selectedFile() === file) {
        const remaining = available.filter(function (item) { return item !== file })
        state.fileChoice = { checkpointId: phaseId(), file: remaining[Math.min(index, remaining.length - 1)] || null }
        state.selectionCause = 'manual'
        state.suppressedAnimationPhases.add(phaseId())
      }
      renderPanel({ followCheckpoint: false })
    }

    fileTree.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-file]')
      if (button) manuallySelect(button.dataset.file)
    })
    codeTabs.addEventListener('click', function (event) {
      const close = event.target.closest('button[data-close-file]')
      if (close) { closeFile(close.dataset.closeFile); return }
      const select = event.target.closest('button[data-file]')
      if (select) manuallySelect(select.dataset.file)
    })
    codeTabs.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const tabs = Array.from(codeTabs.querySelectorAll('[role="tab"]'))
      const current = tabs.indexOf(document.activeElement)
      if (current < 0 || !tabs.length) return
      event.preventDefault()
      const offset = event.key === 'ArrowRight' ? 1 : -1
      const next = tabs[(current + offset + tabs.length) % tabs.length]
      next.focus()
      manuallySelect(next.dataset.file)
    })
    lockButton.addEventListener('click', function () {
      saveScroll()
      if (!state.navigationLocked) {
        state.navigationLocked = true
        state.fileChoice = { checkpointId: phaseId(), file: selectedFile() || null }
        state.selectionCause = 'settled'
        updateLockButton()
        return
      }
      state.navigationLocked = false
      state.fileChoice = null
      state.selectionCause = 'checkpoint'
      const checkpoint = state.activeIndex >= 0 ? checkpoints[state.activeIndex] : null
      if (checkpoint && !state.openFiles.includes(checkpoint.file)) state.openFiles.push(checkpoint.file)
      renderPanel({ followCheckpoint: true })
    })

    function openDrawer() {
      if (state.drawerOpen) return
      state.drawerOpen = true
      panelColumn.classList.add('is-mobile-open')
      panelColumn.removeAttribute('inert')
      panelColumn.setAttribute('role', 'dialog')
      panelColumn.setAttribute('aria-modal', 'true')
      drawerBackdrop.hidden = false
      drawerOpenButton.setAttribute('aria-expanded', 'true')
      document.body.classList.add('drawer-open')
      requestAnimationFrame(function () { drawerCloseButton.focus() })
    }

    function closeDrawer(restoreFocus) {
      if (!state.drawerOpen) return
      state.drawerOpen = false
      panelColumn.classList.remove('is-mobile-open')
      panelColumn.removeAttribute('role')
      panelColumn.removeAttribute('aria-modal')
      if (innerWidth <= 1180) panelColumn.setAttribute('inert', '')
      drawerBackdrop.hidden = true
      drawerOpenButton.setAttribute('aria-expanded', 'false')
      document.body.classList.remove('drawer-open')
      if (restoreFocus !== false) drawerOpenButton.focus()
    }

    drawerOpenButton.addEventListener('click', openDrawer)
    drawerCloseButton.addEventListener('click', function () { closeDrawer(true) })
    drawerBackdrop.addEventListener('click', function () { closeDrawer(true) })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.drawerOpen) {
        event.preventDefault()
        closeDrawer(true)
      } else if (event.key === 'Escape' && state.mobileNavOpen) {
        event.preventDefault()
        setMobileNav(false)
        mobileNavButton.focus()
      }
    })

    let frame = 0
    function updateReadingState() {
      frame = 0
      const readingLine = innerHeight * 0.42
      let next = -1
      anchors.forEach(function (anchor, index) {
        if (anchor.getBoundingClientRect().top <= readingLine) next = index
      })
      activateCheckpoint(next)
      const rect = article.getBoundingClientRect()
      const travel = Math.max(1, rect.height - innerHeight * 0.55)
      const progress = Math.min(1, Math.max(0, (-rect.top + 72) / travel))
      progressBar.style.width = progress * 100 + '%'
    }
    function scheduleReadingUpdate() {
      if (!frame) frame = requestAnimationFrame(updateReadingState)
    }
    addEventListener('scroll', scheduleReadingUpdate, { passive: true })
    addEventListener('resize', function () {
      scheduleReadingUpdate()
      if (innerWidth > 1180) closeDrawer(false)
      if (innerWidth > 1180) panelColumn.removeAttribute('inert')
      else if (!state.drawerOpen) panelColumn.setAttribute('inert', '')
      if (innerWidth > 680) setMobileNav(false)
    })

    updateThemeButton()
    updateLockButton()
    renderPanel({ followCheckpoint: false })
    if (innerWidth <= 1180) panelColumn.setAttribute('inert', '')
    updateReadingState()
    document.querySelectorAll('a[href^="http"]').forEach(function (link) {
      if (new URL(link.href).origin !== location.origin) { link.target = '_blank'; link.rel = 'noreferrer' }
    })
  </script>
</body>
</html>`
}

function resolveRequestedFile(pathname) {
  const requested = pathname === '/' ? 'README.md' : decodeURIComponent(pathname.slice(1))
  const segments = requested.split('/')
  if (segments.some(segment => segment.startsWith('.') || segment === 'node_modules')) {
    throw Object.assign(new Error('not found'), { status: 404 })
  }
  const absolute = resolve(root, requested)
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw Object.assign(new Error('forbidden'), { status: 403 })
  }
  return { absolute, requested }
}

async function renderPath(pathname) {
  if (pathname === '/') return tutorialLayout()
  const { absolute, requested } = resolveRequestedFile(pathname)
  const info = await stat(absolute)
  if (!info.isFile()) throw Object.assign(new Error('not found'), { status: 404 })
  const extension = extname(requested).toLowerCase()
  const allowed = new Set(['.md', '.ts', '.json', '.yml', '.yaml', '.patch', '.txt'])
  if (!allowed.has(extension) && requested !== 'LICENSE') {
    throw Object.assign(new Error('not found'), { status: 404 })
  }
  const source = await readFile(absolute, 'utf8')
  const currentPath = `/${relative(root, absolute).split(sep).join('/')}`
  if (extension === '.md') {
    const title = /^#\s+(.+)$/m.exec(source)?.[1] ?? requested
    const html = addHeadingIds(marked.parse(source))
    return documentLayout(title, html, currentPath)
  }
  const language = extension.slice(1) || 'text'
  return documentLayout(requested, `<h1>${escapeHtml(requested)}</h1>${renderCode(source, language)}`, currentPath)
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const html = await renderPath(url.pathname)
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    response.end(request.method === 'HEAD' ? undefined : html)
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 500
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(status === 500 ? String(error) : `${status} not found`)
  }
})

server.listen(port, '127.0.0.1', () => {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('preview server has no TCP address')
  process.stdout.write(`Preview ready: http://127.0.0.1:${address.port}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
