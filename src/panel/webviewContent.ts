export function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RepoGraph AI</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}

body{
  font-family:var(--vscode-font-family,'Segoe UI',sans-serif);
  font-size:12px;
  background:var(--vscode-editor-background);
  color:var(--vscode-editor-foreground);
  height:100vh;
  display:flex;
  flex-direction:column;
  overflow:hidden;
}

/* ── Tabs ───────────────────────────────────────────────────────── */
.tabs{
  display:flex;
  border-bottom:1px solid var(--vscode-panel-border);
  flex-shrink:0;
  background:var(--vscode-sideBar-background);
}
.tab{
  flex:1;
  padding:8px 2px;
  font-size:10.5px;
  background:none;
  border:none;
  color:var(--vscode-descriptionForeground);
  cursor:pointer;
  border-bottom:2px solid transparent;
  font-family:inherit;
  letter-spacing:0.03em;
  transition:color .15s,border-color .15s;
}
.tab.active{color:var(--vscode-editor-foreground);border-bottom-color:var(--vscode-button-background)}
.tab:hover:not(.active){color:var(--vscode-editor-foreground)}

/* ── Screens ────────────────────────────────────────────────────── */
.screen{display:none;flex:1;flex-direction:column;overflow:hidden;min-height:0}
.screen.active{display:flex}

.scroll{overflow-y:auto;flex:1;padding:10px}
.scroll::-webkit-scrollbar{width:4px}
.scroll::-webkit-scrollbar-thumb{background:var(--vscode-panel-border);border-radius:2px}

/* ── Forms ──────────────────────────────────────────────────────── */
label{
  font-size:11px;
  color:var(--vscode-descriptionForeground);
  display:block;
  margin-bottom:3px;
  margin-top:10px;
}
label:first-child{margin-top:0}

input,select,textarea{
  width:100%;
  background:var(--vscode-input-background);
  border:1px solid var(--vscode-input-border,#555);
  border-radius:3px;
  padding:5px 7px;
  color:var(--vscode-input-foreground);
  font-size:11.5px;
  font-family:inherit;
  outline:none;
}
input:focus,select:focus,textarea:focus{
  border-color:var(--vscode-button-background)
}

/* ── Buttons ────────────────────────────────────────────────────── */
.btn{
  padding:5px 12px;
  background:var(--vscode-button-background);
  border:none;
  border-radius:3px;
  color:var(--vscode-button-foreground);
  font-size:11.5px;
  cursor:pointer;
  font-family:inherit;
  font-weight:600;
  transition:opacity .15s;
  display:inline-flex;
  align-items:center;
  gap:5px;
}
.btn:hover{opacity:.85}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-secondary{
  background:var(--vscode-sideBar-background);
  border:1px solid var(--vscode-panel-border);
  color:var(--vscode-editor-foreground);
  font-weight:500;
}
.btn-secondary:hover{background:var(--vscode-list-hoverBackground);opacity:1}
.btn-sm{padding:3px 8px;font-size:11px}
.btn-block{width:100%;justify-content:center}
.btn-danger{
  background:rgba(244,71,71,.15);
    <button class="tab active" data-tab="analyze">Analyze</button>
    <button class="tab" data-tab="graph">Graph</button>
    <button class="tab" data-tab="summary">Summary</button>
    <button class="tab" data-tab="qa">Q&amp;A</button>
    <button class="tab" data-tab="settings">Settings</button>

/* ── Cards / Alerts ─────────────────────────────────────────────── */
.card{
  background:var(--vscode-sideBar-background);
  border:1px solid var(--vscode-panel-border);
    document.querySelectorAll('[data-tab]').forEach((node) => {
      const tab = node.getAttribute('data-tab');
      if (!tab) return;
      node.addEventListener('click', () => showTab(tab));
.card-body{font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.65}

.alert{
  padding:7px 9px;
  border-radius:3px;
  font-size:11px;
  margin-bottom:8px;
      graphSearch(event.target.value);
  line-height:1.5;
}
.alert-error{background:rgba(244,71,71,.08);border-color:#f44747;color:#f44747}
.alert-success{background:rgba(78,201,176,.08);border-color:#4ec9b0;color:#4ec9b0}
    chatInput?.addEventListener('input', (event) => {
      autoResize(event.target);
.badge{display:inline-block;font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:10px}
.badge-free{background:rgba(78,201,176,.12);color:#4ec9b0}
.badge-paid{background:rgba(220,220,170,.12);color:#dcdcaa}
.badge-local{background:rgba(150,220,170,.12);color:#89d185}

/* ── Progress ───────────────────────────────────────────────────── */
.progress-wrap{padding:10px 0}
.progress-bar-outer{height:3px;background:var(--vscode-panel-border);border-radius:2px;overflow:hidden;margin:6px 0 4px}
.progress-bar-inner{height:100%;background:var(--vscode-button-background);border-radius:2px;transition:width .4s ease}
.progress-msg{font-size:11px;color:var(--vscode-descriptionForeground)}
.progress-steps{display:flex;justify-content:space-between;font-size:9.5px;margin-top:3px}
.progress-steps span{color:var(--vscode-panel-border)}
    document.getElementById('history-list').innerHTML = records.map(r => {
.progress-steps span.active{color:var(--vscode-button-background)}

/* ── History list ───────────────────────────────────────────────── */
      return \`<div class="history-item" data-id="\${r.id}">
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:var(--vscode-descriptionForeground);
  margin:14px 0 6px;
        <button class="history-del" data-id="\${r.id}" title="Delete">
}
.history-item{
  display:flex;
  align-items:center;
  gap:6px;
  padding:7px 9px;
  background:var(--vscode-sideBar-background);
  border:1px solid var(--vscode-panel-border);
    document.getElementById('s-entries').innerHTML = (s.entryPoints||[]).map(p =>
      \`<div style="padding:2px 0;cursor:pointer;color:#569cd6" data-path="\${p}">\${p}</div>\`
  cursor:pointer;
  transition:border-color .15s;
}
.history-item:hover{border-color:var(--vscode-button-background)}
.history-item-label{flex:1;font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.history-item-time{font-size:10px;color:var(--vscode-descriptionForeground);flex-shrink:0}
.history-del{
  width:18px;height:18px;flex-shrink:0;
  background:none;border:none;cursor:pointer;
  color:var(--vscode-descriptionForeground);
  display:flex;align-items:center;justify-content:center;
  border-radius:3px;
  opacity:.6;
}
.history-del:hover{opacity:1;color:#f44747}

/* ── Graph ──────────────────────────────────────────────────────── */
#graph-wrap{display:flex;flex-direction:column;height:100%;position:relative}

.graph-toolbar{
  display:flex;align-items:center;gap:6px;padding:5px 8px;
  border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;flex-wrap:wrap;
}
.graph-toolbar input{width:120px;flex:0 0 auto;padding:3px 6px;font-size:11px}

.zoom-btns{display:flex;gap:2px}
.zoom-btn{
  width:22px;height:22px;display:flex;align-items:center;justify-content:center;
  background:var(--vscode-sideBar-background);border:1px solid var(--vscode-panel-border);
  border-radius:3px;cursor:pointer;font-size:13px;
  color:var(--vscode-editor-foreground);font-family:monospace;
}
.zoom-btn:hover{background:var(--vscode-list-hoverBackground)}

.legend{display:flex;gap:6px;flex-wrap:wrap;flex:1}
.legend-item{display:flex;align-items:center;gap:3px;font-size:10px;color:var(--vscode-descriptionForeground)}
.legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

.graph-stats{font-size:10px;color:var(--vscode-descriptionForeground)}

#graph-canvas-wrap{flex:1;position:relative;overflow:hidden;min-height:0}
#graph-canvas{position:absolute;top:0;left:0}

/* Node detail panel */
#node-detail{
  position:absolute;right:0;top:0;bottom:0;width:200px;
  background:var(--vscode-sideBar-background);
  border-left:1px solid var(--vscode-panel-border);
  font-size:11px;overflow-y:auto;
  display:none;flex-direction:column;
}
#node-detail.open{display:flex}
#node-detail-header{
  padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border);
  display:flex;align-items:flex-start;justify-content:space-between;gap:6px;
}
#node-detail-filename{
  font-weight:700;font-size:12px;word-break:break-all;
  font-family:monospace;color:var(--vscode-editor-foreground);
}
#node-detail-close{
  cursor:pointer;color:var(--vscode-descriptionForeground);flex-shrink:0;
  background:none;border:none;font-size:14px;line-height:1;padding:0 2px;
}
#node-detail-body{padding:8px 10px;overflow-y:auto;flex:1}
.detail-label{
  font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;
  font-weight:700;color:var(--vscode-descriptionForeground);
  margin-top:10px;margin-bottom:4px;
}
.detail-label:first-child{margin-top:0}
.detail-chip{
  display:inline-block;background:var(--vscode-editor-background);
  border:1px solid var(--vscode-panel-border);border-radius:3px;
  padding:2px 5px;font-size:10px;font-family:monospace;
  margin:2px 2px 0 0;cursor:pointer;color:var(--vscode-editor-foreground);
}
.detail-chip:hover{border-color:var(--vscode-button-background)}
.detail-file-path{
  font-family:monospace;font-size:10px;
  color:var(--vscode-descriptionForeground);word-break:break-all;margin-bottom:6px;
}
.open-file-btn{margin-top:10px;width:100%;justify-content:center;padding:5px;font-size:11px}

/* Graph empty */
#graph-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:6px;color:var(--vscode-descriptionForeground);
  padding:20px;text-align:center;
}
.empty-icon{margin:0 auto 6px;opacity:.4}
.empty-title{font-size:13px;font-weight:600;color:var(--vscode-editor-foreground)}
.empty-sub{font-size:11px;line-height:1.65;max-width:220px}

/* ── Summary ────────────────────────────────────────────────────── */
.section-hdr{
  font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;
  font-weight:700;color:var(--vscode-descriptionForeground);
  margin:12px 0 6px;
}
.section-hdr:first-child{margin-top:0}

.chip{
  display:inline-block;
  background:var(--vscode-sideBar-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:10px;padding:2px 8px;font-size:10.5px;margin:2px 2px 0 0;
}

.file-card{
  background:var(--vscode-sideBar-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:4px;padding:8px 10px;margin-bottom:6px;cursor:pointer;
  transition:border-color .15s;
}
.file-card:hover{border-color:var(--vscode-button-background)}
.file-card-path{font-family:monospace;font-size:10.5px;color:#569cd6;margin-bottom:3px}
.file-card-desc{font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.6}

/* ── Q&A ────────────────────────────────────────────────────────── */
.chat-history{
  flex:1;overflow-y:auto;padding:8px;
  display:flex;flex-direction:column;gap:10px;min-height:0;
}
.chat-history::-webkit-scrollbar{width:3px}
.chat-history::-webkit-scrollbar-thumb{background:var(--vscode-panel-border);border-radius:2px}

.chat-msg{display:flex;gap:8px;align-items:flex-start}

/* SVG avatar */
.av{
  width:22px;height:22px;flex-shrink:0;margin-top:1px;
  border-radius:4px;display:flex;align-items:center;justify-content:center;
}
.av-user{background:rgba(86,156,214,.15)}
.av-ai{background:rgba(78,201,176,.12)}

.bubble{
  background:var(--vscode-sideBar-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:5px;padding:7px 9px;
  font-size:11.5px;line-height:1.7;flex:1;
  white-space:pre-wrap;word-break:break-word;
}
.bubble.user{background:rgba(86,156,214,.06);border-color:rgba(86,156,214,.2)}

/* Thinking animation */
.thinking-dots{display:flex;gap:3px;padding:4px 0;align-items:center}
.thinking-dots span{
  width:5px;height:5px;border-radius:50%;
  background:var(--vscode-descriptionForeground);
  animation:dpulse 1.2s ease-in-out infinite;
}
.thinking-dots span:nth-child(2){animation-delay:.2s}
.thinking-dots span:nth-child(3){animation-delay:.4s}
@keyframes dpulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}

.chat-footer{
  padding:7px;
  border-top:1px solid var(--vscode-panel-border);
  flex-shrink:0;
  background:var(--vscode-sideBar-background);
}
.quick-qs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.qq{
  background:var(--vscode-editor-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:10px;padding:3px 8px;font-size:10px;
  color:var(--vscode-descriptionForeground);cursor:pointer;
  font-family:inherit;
}
.qq:hover{border-color:var(--vscode-button-background);color:var(--vscode-editor-foreground)}

.chat-row{display:flex;gap:5px;align-items:flex-end}
.chat-input{
  flex:1;resize:none;min-height:32px;max-height:80px;
  line-height:1.5;font-size:12px;
}
.chat-actions{display:flex;gap:5px;margin-bottom:5px}

/* ── Settings ───────────────────────────────────────────────────── */
.provider-card{
  background:var(--vscode-sideBar-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:5px;padding:8px 10px;margin-bottom:6px;cursor:pointer;
  transition:border-color .15s;
}
.provider-card:hover,.provider-card.selected{border-color:var(--vscode-button-background)}
.provider-card.selected{background:rgba(0,120,212,.05)}

.provider-hdr{display:flex;align-items:center;gap:7px}
.p-icon{
  width:22px;height:22px;border-radius:4px;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;font-family:monospace;flex-shrink:0;
}
.p-name{font-size:12px;font-weight:600;flex:1}

.provider-fields{
  display:none;margin-top:8px;padding-top:8px;
  border-top:1px solid var(--vscode-panel-border);
}
.provider-fields.open{display:block}

.model-row{display:flex;gap:6px;align-items:center}
.model-row select,.model-row input{flex:1}
</style>
</head>
<body>

<div class="tabs">
  <button class="tab active" data-tab="analyze">Analyze</button>
  <button class="tab" data-tab="graph">Graph</button>
  <button class="tab" data-tab="summary">Summary</button>
  <button class="tab" data-tab="qa">Q&amp;A</button>
  <button class="tab" data-tab="settings">Settings</button>
</div>

<!-- ═══════════════════════════════════
     ANALYZE TAB
═══════════════════════════════════ -->
<div id="tab-analyze" class="screen active">
  <div class="scroll">
    <div id="analyze-alert"></div>

    <div class="card">
      <div class="card-title" id="ws-name">No workspace open</div>
      <div class="card-body" id="ws-sub">Open a folder in VS Code to get started</div>
    </div>

    <button class="btn btn-block" id="local-analyze-btn" onclick="analyzeLocal()" style="margin-bottom:12px">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="6.5" cy="6.5" r="4.5"/><path d="M11 11l3 3"/>
      </svg>
      Analyze Workspace
    </button>

    <div style="font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.7;margin-bottom:12px">
      Scans your workspace, maps all file relationships, generates AI summaries and enables codebase Q&amp;A.
      Skips <code>node_modules</code>, <code>dist</code>, build outputs, and generated files automatically.
    </div>

    <!-- Progress -->
    <div id="progress-wrap" style="display:none" class="progress-wrap">
      <div class="progress-bar-outer">
        <div class="progress-bar-inner" id="pbar" style="width:8%"></div>
      </div>
      <div class="progress-msg" id="progress-msg">Starting...</div>
      <div class="progress-steps">
        <span id="ps1">1. Scan</span>
        <span id="ps2">2. Graph</span>
        <span id="ps3">3. Summary</span>
        <span id="ps4">4. Files</span>
      </div>
    </div>

    <!-- Analysis history -->
    <div id="history-section" style="display:none">
      <div class="history-header">Previous Analyses</div>
      <div id="history-list"></div>
    </div>

  </div>
</div>

<!-- ═══════════════════════════════════
     GRAPH TAB
═══════════════════════════════════ -->
<div id="tab-graph" class="screen">

  <div id="graph-empty" style="display:flex">
    <div class="empty-icon">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6">
        <circle cx="8" cy="8" r="5"/><circle cx="32" cy="8" r="5"/>
        <circle cx="8" cy="32" r="5"/><circle cx="32" cy="32" r="5"/><circle cx="20" cy="20" r="5"/>
        <line x1="13" y1="8" x2="27" y2="8"/><line x1="8" y1="13" x2="8" y2="27"/>
        <line x1="13" y1="8" x2="15" y2="15"/><line x1="25" y1="25" x2="27" y2="27"/>
        <line x1="15" y1="25" x2="13" y2="32"/>
      </svg>
    </div>
    <div class="empty-title">Dependency Graph</div>
    <div class="empty-sub">Analyze a workspace to visualize how files connect through imports</div>
  </div>

  <div id="graph-wrap" style="display:none;flex:1;flex-direction:column;min-height:0">
    <div class="graph-toolbar">
      <input type="text" id="graph-search" placeholder="Search file..." oninput="graphSearch(this.value)">
      <div class="zoom-btns">
        <div class="zoom-btn" onclick="zoom(1.2)" title="Zoom in">+</div>
        <div class="zoom-btn" onclick="zoom(0.83)" title="Zoom out">-</div>
        <div class="zoom-btn" onclick="fitView()" title="Fit">&#x2922;</div>
      </div>
      <div class="legend" id="graph-legend"></div>
      <div class="graph-stats" id="graph-stats"></div>
    </div>
    <div id="graph-canvas-wrap">
      <canvas id="graph-canvas"></canvas>
      <div id="node-detail">
        <div id="node-detail-header">
          <div id="node-detail-filename"></div>
          <button id="node-detail-close" onclick="closeNodeDetail()">&#x2715;</button>
        </div>
        <div id="node-detail-body"></div>
      </div>
    </div>
  </div>

</div>

<!-- ═══════════════════════════════════
     SUMMARY TAB
═══════════════════════════════════ -->
<div id="tab-summary" class="screen">
  <div id="summary-empty" style="display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--vscode-descriptionForeground);padding:20px;text-align:center">
    <div class="empty-icon">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6">
        <rect x="4" y="4" width="28" height="28" rx="3"/>
        <line x1="10" y1="12" x2="26" y2="12"/>
        <line x1="10" y1="18" x2="22" y2="18"/>
        <line x1="10" y1="24" x2="19" y2="24"/>
      </svg>
    </div>
    <div class="empty-title">No Summary Yet</div>
    <div class="empty-sub">Analyze a workspace to generate AI-powered summaries</div>
  </div>
  <div id="summary-ready" class="scroll" style="display:none">
    <div class="section-hdr">Overview</div>
    <div class="card">
      <div class="card-title" id="s-name"></div>
      <div class="card-body" id="s-overview"></div>
    </div>
    <div class="section-hdr">Architecture</div>
    <div class="card"><div class="card-body" id="s-arch"></div></div>
    <div class="section-hdr">Tech Stack</div>
    <div id="s-tech" style="margin-bottom:8px"></div>
    <div class="section-hdr">Key Modules</div>
    <div id="s-modules"></div>
    <div class="section-hdr">Entry Points</div>
    <div id="s-entries" style="margin-bottom:8px;font-family:monospace;font-size:11px"></div>
    <div class="section-hdr">
      File Summaries
      <span id="s-file-count" style="font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;margin-left:4px"></span>
    </div>
    <div id="s-files"></div>
  </div>
</div>

<!-- ═══════════════════════════════════
     Q&A TAB
═══════════════════════════════════ -->
<div id="tab-qa" class="screen">
  <div id="qa-empty" style="display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--vscode-descriptionForeground);padding:20px;text-align:center">
    <div class="empty-icon">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6">
        <path d="M4 6a2 2 0 012-2h24a2 2 0 012 2v16a2 2 0 01-2 2H12l-8 6V6z"/>
      </svg>
    </div>
    <div class="empty-title">Q&amp;A Not Ready</div>
    <div class="empty-sub">Analyze a workspace first, then ask anything about the codebase</div>
  </div>

  <div id="qa-ready" style="display:none;flex-direction:column;height:100%;min-height:0;flex:1">
    <div class="chat-history" id="chat-history"></div>
    <div class="chat-footer">
      <div class="chat-actions">
        <button class="btn btn-secondary btn-sm" onclick="clearChat()">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M2 4h12M6 4V2h4v2M3 4l1 10h8l1-10"/>
          </svg>
          Clear chat
        </button>
      </div>
      <div class="quick-qs">
        <button class="qq" onclick="askQuick('What does this project do?')">What does it do?</button>
        <button class="qq" onclick="askQuick('Where is the entry point?')">Entry point?</button>
        <button class="qq" onclick="askQuick('How is authentication handled?')">Auth?</button>
        <button class="qq" onclick="askQuick('What are the main modules?')">Key modules?</button>
        <button class="qq" onclick="askQuick('How do I run this project locally?')">How to run?</button>
        <button class="qq" onclick="askQuick('What databases or external services are used?')">DB/Services?</button>
      </div>
      <div class="chat-row">
        <textarea class="chat-input" id="chat-input"
          placeholder="Ask anything about the codebase..."
          rows="1"
          onkeydown="chatKey(event)"
          oninput="autoResize(this)"></textarea>
        <button class="btn btn-sm" onclick="sendQ()" id="send-btn">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 1.5l13 6.5-13 6.5V9.5l9-3-9-3V1.5z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════
     SETTINGS TAB
═══════════════════════════════════ -->
<div id="tab-settings" class="screen">
  <div class="scroll">
    <div id="settings-alert"></div>

    <div style="font-size:11.5px;font-weight:600;margin-bottom:4px">AI Provider</div>
    <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:10px;line-height:1.65">
      Your API key is stored in VS Code's encrypted SecretStorage and never sent anywhere except the provider you select.
    </div>

    <!-- Groq -->
    <div class="provider-card" id="pc-groq" onclick="selProv('groq')">
      <div class="provider-hdr">
        <div class="p-icon" style="background:#0a2a1e;color:#4ec9b0">G</div>
        <div class="p-name">Groq</div>
        <span class="badge badge-free">FREE</span>
      </div>
      <div class="provider-fields" id="pf-groq">
        <label>API Key</label>
        <input id="key-groq" type="password" placeholder="gsk_...">
        <label>Model</label>
        <div class="model-row">
          <select id="model-groq" onchange="toggleCustomModel('groq')">
            <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (recommended)</option>
            <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
            <option value="gemma2-9b-it">gemma2-9b-it</option>
            <option value="__custom__">Other (type below)</option>
          </select>
          <input id="custom-model-groq" type="text" placeholder="model name" style="display:none">
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
          <button class="btn btn-sm" onclick="saveProv('groq')">Save</button>
          <a href="https://console.groq.com/keys" style="font-size:10.5px;color:#569cd6;text-decoration:none">Get free key</a>
        </div>
      </div>
    </div>

    <!-- Ollama -->
    <div class="provider-card" id="pc-ollama" onclick="selProv('ollama')">
      <div class="provider-hdr">
        <div class="p-icon" style="background:#2a1f0e;color:#dcdcaa">O</div>
        <div class="p-name">Ollama (Local)</div>
        <span class="badge badge-local">100% LOCAL</span>
      </div>
      <div class="provider-fields" id="pf-ollama">
        <div class="alert alert-info" style="margin-bottom:6px">Runs fully on your machine. No API key needed. Install from ollama.com first.</div>
        <label>Model</label>
        <input id="model-ollama" type="text" value="llama3.2" placeholder="llama3.2">
        <label>Base URL</label>
        <input id="baseurl-ollama" type="text" value="http://localhost:11434">
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" onclick="saveProv('ollama')">Save</button>
          <a href="https://ollama.com" style="font-size:10.5px;color:#569cd6;text-decoration:none">Download Ollama</a>
        </div>
      </div>
    </div>

    <!-- Gemini -->
    <div class="provider-card" id="pc-gemini" onclick="selProv('gemini')">
      <div class="provider-hdr">
        <div class="p-icon" style="background:#1c2a3e;color:#9cdcfe">G</div>
        <div class="p-name">Google Gemini</div>
        <span class="badge badge-free">FREE tier</span>
      </div>
      <div class="provider-fields" id="pf-gemini">
        <label>API Key</label>
        <input id="key-gemini" type="password" placeholder="AIza...">
        <label>Model</label>
        <div class="model-row">
          <select id="model-gemini" onchange="toggleCustomModel('gemini')">
            <option value="gemini-1.5-flash">gemini-1.5-flash (free)</option>
            <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            <option value="__custom__">Other (type below)</option>
          </select>
          <input id="custom-model-gemini" type="text" placeholder="model name" style="display:none">
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" onclick="saveProv('gemini')">Save</button>
          <a href="https://aistudio.google.com/app/apikey" style="font-size:10.5px;color:#569cd6;text-decoration:none">Get free key</a>
        </div>
      </div>
    </div>

    <!-- Anthropic -->
    <div class="provider-card" id="pc-anthropic" onclick="selProv('anthropic')">
      <div class="provider-hdr">
        <div class="p-icon" style="background:#2a1f3a;color:#b39ddb">A</div>
        <div class="p-name">Anthropic Claude</div>
        <span class="badge badge-paid">PAID</span>
      </div>
      <div class="provider-fields" id="pf-anthropic">
        <label>API Key</label>
        <input id="key-anthropic" type="password" placeholder="sk-ant-...">
        <label>Model</label>
        <div class="model-row">
          <select id="model-anthropic" onchange="toggleCustomModel('anthropic')">
            <option value="claude-haiku-4-5-20251001">claude-haiku (fastest)</option>
            <option value="claude-sonnet-4-5">claude-sonnet (best)</option>
            <option value="__custom__">Other (type below)</option>
          </select>
          <input id="custom-model-anthropic" type="text" placeholder="model name" style="display:none">
        </div>
        <div style="margin-top:8px">
          <button class="btn btn-sm" onclick="saveProv('anthropic')">Save</button>
        </div>
      </div>
    </div>

    <!-- OpenAI -->
    <div class="provider-card" id="pc-openai" onclick="selProv('openai')">
      <div class="provider-hdr">
        <div class="p-icon" style="background:#1a2d1a;color:#4ec9b0">O</div>
        <div class="p-name">OpenAI</div>
        <span class="badge badge-paid">PAID</span>
      </div>
      <div class="provider-fields" id="pf-openai">
        <label>API Key</label>
        <input id="key-openai" type="password" placeholder="sk-...">
        <label>Model</label>
        <div class="model-row">
          <select id="model-openai" onchange="toggleCustomModel('openai')">
            <option value="gpt-4o-mini">gpt-4o-mini (cheapest)</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="__custom__">Other (type below)</option>
          </select>
          <input id="custom-model-openai" type="text" placeholder="model name" style="display:none">
        </div>
        <div style="margin-top:8px">
          <button class="btn btn-sm" onclick="saveProv('openai')">Save</button>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
/* ═══════════════════════════════════════════════════════
   VSCODE API
═══════════════════════════════════════════════════════ */
let vscode;
try { vscode = acquireVsCodeApi(); } catch(e) {}
function post(msg) { vscode?.postMessage(msg); }

let interactionsWired = false;

function handleDelegatedClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const tab = target.closest('[data-tab]');
  if (tab) {
    const name = tab.getAttribute('data-tab');
    if (name) showTab(name);
    return;
  }

  const analyzeButton = target.closest('#local-analyze-btn');
  if (analyzeButton) { analyzeLocal(); return; }

  const zoomButton = target.closest('.zoom-btn');
  if (zoomButton) {
    const buttons = Array.from(document.querySelectorAll('.zoom-btn'));
    const index = buttons.indexOf(zoomButton);
    if (index === 0) zoom(1.2);
    if (index === 1) zoom(0.83);
    if (index === 2) fitView();
    return;
  }

  const quickQuestion = target.closest('.qq');
  if (quickQuestion) { askQuick(quickQuestion.textContent?.trim() || ''); return; }

  const sendButton = target.closest('#send-btn');
  if (sendButton) { sendQ(); return; }

  const providerCard = target.closest('.provider-card');
  if (providerCard?.id) { selProv(providerCard.id.replace('pc-', '')); return; }

  const saveButton = target.closest('.provider-fields .btn.btn-sm');
  if (saveButton) {
    const card = saveButton.closest('.provider-card');
    const name = card?.id?.replace('pc-', '');
    if (name) saveProv(name);
    return;
  }

  const closeButton = target.closest('#node-detail-close');
  if (closeButton) { closeNodeDetail(); return; }

  const historyDelete = target.closest('.history-del');
  if (historyDelete) {
    const id = historyDelete.getAttribute('data-id');
    if (id) deleteAnalysis(event, id);
    return;
  }

  const historyItem = target.closest('.history-item');
  if (historyItem) {
    const id = historyItem.getAttribute('data-id');
    if (id) loadAnalysis(id);
    return;
  }

  const detailChip = target.closest('.detail-chip');
  if (detailChip) {
    const id = detailChip.getAttribute('data-id');
    if (id) selectNodeById(id);
    return;
  }

  const openFileTarget = target.closest('.open-file-btn, .file-card, #s-entries [data-path]');
  if (openFileTarget) {
    const path = openFileTarget.getAttribute('data-path');
    if (path) openFile(path);
  }
}

function wireInteractions() {
  if (interactionsWired) return;
  interactionsWired = true;

  const graphSearchInput = document.getElementById('graph-search');
  graphSearchInput?.addEventListener('input', (event) => {
    graphSearch(event.target.value);
  });

  const chatInput = document.getElementById('chat-input');
  chatInput?.addEventListener('keydown', chatKey);
  chatInput?.addEventListener('input', (event) => {
    autoResize(event.target);
  });

  const sendBtn = document.getElementById('send-btn');
  sendBtn?.addEventListener('click', sendQ);

  ['groq', 'gemini', 'anthropic', 'openai'].forEach((name) => {
    document.getElementById('model-' + name)?.addEventListener('change', () => toggleCustomModel(name));
    document.getElementById('custom-model-' + name)?.addEventListener('input', () => toggleCustomModel(name));
  });
}

document.addEventListener('click', handleDelegatedClick, true);

/* ═══════════════════════════════════════════════════════
   TABS
═══════════════════════════════════════════════════════ */
const TAB_ORDER = ['analyze','graph','summary','qa','settings'];

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => {
    t.classList.toggle('active', TAB_ORDER[i] === name);
  });
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');

  if (name === 'graph' && graphBuilt) {
    setTimeout(() => { resizeCanvas(); fitView(); render(); }, 50);
  }
}

/* ═══════════════════════════════════════════════════════
   ANALYZE
═══════════════════════════════════════════════════════ */
let analyzing = false;

function analyzeLocal() {
  if (analyzing) return;
  clearAlert('analyze');
  setAnalyzing(true);
  post({ type: 'analyzeLocal' });
}

function setAnalyzing(on) {
  analyzing = on;
  document.getElementById('local-analyze-btn').disabled = on;
  document.getElementById('progress-wrap').style.display = on ? 'block' : 'none';
  if (on) setProgress(1, 8, 'Starting...');
}

const stepPct = { 1: 15, 2: 40, 3: 65, 4: 85 };

function setProgress(step, pct, msg) {
  document.getElementById('pbar').style.width = pct + '%';
  document.getElementById('progress-msg').textContent = msg;
  ['ps1','ps2','ps3','ps4'].forEach((id, i) => {
    const el = document.getElementById(id);
    const s = i + 1;
    el.className = s < step ? 'done' : s === step ? 'active' : '';
  });
}

/* ═══════════════════════════════════════════════════════
   HISTORY
═══════════════════════════════════════════════════════ */
function renderHistory(records) {
  if (!records || records.length === 0) {
    document.getElementById('history-section').style.display = 'none';
    return;
  }
  document.getElementById('history-section').style.display = 'block';
  document.getElementById('history-list').innerHTML = records.map(r => {
    const date = new Date(r.timestamp).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    return \`<div class="history-item" data-id="\${r.id}">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink:0;opacity:.6">
        <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
      </svg>
      <div class="history-item-label" title="\${r.label}">\${r.repoName}</div>
      <div class="history-item-time">\${date}</div>
      <button class="history-del" data-id="\${r.id}" title="Delete">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8">
          <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
        </svg>
      </button>
    </div>\`;
  }).join('');
}

function loadAnalysis(id) {
  post({ type: 'loadAnalysis', payload: { id } });
}

function deleteAnalysis(e, id) {
  e.stopPropagation();
  post({ type: 'deleteAnalysis', payload: { id } });
}

/* ═══════════════════════════════════════════════════════
   GRAPH ENGINE
═══════════════════════════════════════════════════════ */
let canvas, ctx, canvasWrap;
let graphNodes = [], graphEdges = [];
let cam = { x: 0, y: 0, scale: 1 };
let dragging = false, dragNode = null;
let lastMouse = { x: 0, y: 0 };
let selectedNode = null;
let graphBuilt = false;
let searchTerm = '';
const fileSummaryMap = {};
let pointer = { down: false, moved: false, startX: 0, startY: 0, node: null };

const GROUP_COLORS = [
  '#569cd6','#4ec9b0','#d7ba7d','#ce9178',
  '#9cdcfe','#4fc1ff','#f48771','#b5cea8',
  '#646695','#c8c8c8','#89d185'
];
const groupColorMap = {};

function initGraph(data) {
  graphBuilt = true;
  document.getElementById('graph-empty').style.display = 'none';
  document.getElementById('graph-wrap').style.display = 'flex';

  canvas = document.getElementById('graph-canvas');
  ctx = canvas.getContext('2d');
  canvasWrap = document.getElementById('graph-canvas-wrap');

  // Assign group colors
  const groups = [...new Set(data.nodes.map(n => n.group))];
  groups.forEach((g, i) => { groupColorMap[g] = GROUP_COLORS[i % GROUP_COLORS.length]; });

  // Legend (top 6 groups)
  document.getElementById('graph-legend').innerHTML = groups.slice(0, 6).map(g =>
    \`<div class="legend-item"><div class="legend-dot" style="background:\${groupColorMap[g]}"></div>\${g}</div>\`
  ).join('');

  // Rank by connectivity, cap at 100 nodes
  const ranked = [...data.nodes]
    .sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree));
  const seedIds = new Set(ranked.slice(0, 60).map(n => n.id));

  // Expand to include connected neighbours (up to 100 total)
  for (const edge of data.edges) {
    if (seedIds.size >= 100) break;
    if (seedIds.has(edge.source) && !seedIds.has(edge.target)) seedIds.add(edge.target);
    else if (seedIds.has(edge.target) && !seedIds.has(edge.source)) seedIds.add(edge.source);
  }

  const visible = ranked.filter(n => seedIds.has(n.id)).slice(0, 100);
  const count = visible.length;

  // Initial positions on a circle
  graphNodes = visible.map((n, i) => {
    const angle = (i / count) * Math.PI * 2;
    const r = 50 + Math.sqrt(count) * 20;
    return {
      ...n,
      x: Math.cos(angle) * r + (Math.random() - 0.5) * 40,
      y: Math.sin(angle) * r + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0,
      radius: Math.max(12, Math.min(26, 12 + n.inDegree * 2.2)),
      color: groupColorMap[n.group] || GROUP_COLORS[0],
    };
  });

  graphEdges = data.edges.filter(e => seedIds.has(e.source) && seedIds.has(e.target));

  document.getElementById('graph-stats').textContent =
    \`\${count} files · \${graphEdges.length} imports\`;

  // Run force simulation
  for (let i = 0; i < 250; i++) tickForce();

  setupCanvasEvents();
  resizeCanvas();
  fitView();
  render();
}

/* Force-directed layout ──────────────────────────────── */
function tickForce() {
  const REP = 2000, ATTR = 0.05, IDEAL = 110, CENTER = 0.002;

  for (let i = 0; i < graphNodes.length; i++) {
    for (let j = i + 1; j < graphNodes.length; j++) {
      const a = graphNodes[i], b = graphNodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const distSq = Math.max(dx*dx + dy*dy, 1);
      const dist = Math.sqrt(distSq);
      const f = REP / distSq;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }

  const nodeIndex = new Map(graphNodes.map(n => [n.id, n]));
  for (const e of graphEdges) {
    const a = nodeIndex.get(e.source), b = nodeIndex.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
    const f = (dist - IDEAL) / dist * ATTR;
    a.vx += dx*f; a.vy += dy*f;
    b.vx -= dx*f; b.vy -= dy*f;
  }

  for (const n of graphNodes) {
    n.vx -= n.x * CENTER;
    n.vy -= n.y * CENTER;
    n.x += n.vx * 0.5;
    n.y += n.vy * 0.5;
    n.vx *= 0.72;
    n.vy *= 0.72;
  }
}

/* Canvas events ──────────────────────────────────────── */
function setupCanvasEvents() {
  canvas.onwheel = e => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    cam.x = mx - (mx - cam.x) * f;
    cam.y = my - (my - cam.y) * f;
    cam.scale = Math.max(0.1, Math.min(6, cam.scale * f));
    render();
  };

  canvas.onmousedown = e => {
    const { gx, gy } = s2g(e.offsetX, e.offsetY);
    const hit = hitTest(gx, gy);
    pointer = { down: true, moved: false, startX: e.clientX, startY: e.clientY, node: hit };
    dragNode = hit;
    dragging = !hit;
    lastMouse = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = dragging ? 'grabbing' : 'pointer';
  };

  canvas.onmouseup = e => {
    const dist = Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY);
    if (pointer.down && !pointer.moved && dist < 5) {
      if (pointer.node) selectNode(pointer.node);
      else { selectedNode = null; closeNodeDetail(); }
    }
    dragging = false; dragNode = null; pointer.down = false;
    canvas.style.cursor = 'default';
    render();
  };

  canvas.onmousemove = e => {
    if (pointer.down && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 4) {
      pointer.moved = true;
    }
    if (dragging) {
      cam.x += e.clientX - lastMouse.x;
      cam.y += e.clientY - lastMouse.y;
      lastMouse = { x: e.clientX, y: e.clientY };
      render();
    } else if (dragNode) {
      dragNode.x += (e.clientX - lastMouse.x) / cam.scale;
      dragNode.y += (e.clientY - lastMouse.y) / cam.scale;
      dragNode.vx = 0; dragNode.vy = 0;
      lastMouse = { x: e.clientX, y: e.clientY };
      render();
    } else {
      const { gx, gy } = s2g(e.offsetX, e.offsetY);
      canvas.style.cursor = hitTest(gx, gy) ? 'pointer' : 'grab';
    }
  };

  canvas.ondblclick = e => {
    const { gx, gy } = s2g(e.offsetX, e.offsetY);
    const hit = hitTest(gx, gy);
    if (hit) post({ type: 'openFile', payload: { path: hit.path } });
  };

  window.addEventListener('resize', () => { resizeCanvas(); render(); });
}

function s2g(sx, sy) { return { gx: (sx - cam.x) / cam.scale, gy: (sy - cam.y) / cam.scale }; }
function hitTest(gx, gy) {
  return graphNodes.find(n => Math.hypot(n.x - gx, n.y - gy) < n.radius + 3) || null;
}

function resizeCanvas() {
  if (!canvas || !canvasWrap) return;
  const r = canvasWrap.getBoundingClientRect();
  if (!r.width || !r.height) return;
  canvas.width = r.width; canvas.height = r.height;
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
}

function fitView() {
  if (!graphNodes.length || !canvas) return;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const n of graphNodes) {
    minX = Math.min(minX, n.x - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }
  const pad = 40;
  const W = canvas.width - pad*2, H = canvas.height - pad*2;
  const gW = maxX - minX || 1, gH = maxY - minY || 1;
  cam.scale = Math.max(0.1, Math.min(2.5, Math.min(W/gW, H/gH)));
  cam.x = pad - minX * cam.scale;
  cam.y = pad - minY * cam.scale;
  render();
}

function zoom(f) {
  cam.scale = Math.max(0.1, Math.min(6, cam.scale * f));
  render();
}

/* Render ─────────────────────────────────────────────── */
function render() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.scale, cam.scale);

  const selId = selectedNode?.id;
  const connIds = new Set();
  if (selId) {
    graphEdges.forEach(e => {
      if (e.source === selId) connIds.add(e.target);
      if (e.target === selId) connIds.add(e.source);
    });
  }

  const nodeIndex = new Map(graphNodes.map(n => [n.id, n]));

  // Draw edges
  for (const e of graphEdges) {
    const a = nodeIndex.get(e.source), b = nodeIndex.get(e.target);
    if (!a || !b) continue;

    const isRel = selId && (e.source === selId || e.target === selId);
    const dimmed = selId && !isRel;

    if (searchTerm) {
      if (!a.label.toLowerCase().includes(searchTerm) &&
          !b.label.toLowerCase().includes(searchTerm)) continue;
    }

    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 1) continue;

    const sx = a.x + (dx/dist)*a.radius;
    const sy = a.y + (dy/dist)*a.radius;
    const ex = b.x - (dx/dist)*(b.radius + 7);
    const ey = b.y - (dy/dist)*(b.radius + 7);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);

    if (isRel && e.source === selId) {
      ctx.strokeStyle = 'rgba(86,156,214,0.9)'; ctx.lineWidth = 1.8;
    } else if (isRel) {
      ctx.strokeStyle = 'rgba(78,201,176,0.7)'; ctx.lineWidth = 1.4;
    } else if (dimmed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 0.8;
    }
    ctx.stroke();

    // Arrowhead
    if (!dimmed) {
      const ang = Math.atan2(ey - sy, ex - sx);
      const al = 7, aa = 0.42;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - al*Math.cos(ang-aa), ey - al*Math.sin(ang-aa));
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - al*Math.cos(ang+aa), ey - al*Math.sin(ang+aa));
      ctx.strokeStyle = isRel ? 'rgba(86,156,214,0.9)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = isRel ? 1.8 : 0.8;
      ctx.stroke();
    }

    // Edge label when zoomed and selected
    if (isRel && e.label && cam.scale > 0.9) {
      const mx = (sx+ex)/2, my = (sy+ey)/2;
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(150,180,220,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(e.label.slice(0,22), mx, my - 4);
    }
  }

  // Draw nodes
  for (const n of graphNodes) {
    const isSel = n.id === selId;
    const isConn = connIds.has(n.id);
    const dimmed = selId && !isSel && !isConn;
    const searchHide = searchTerm && !n.label.toLowerCase().includes(searchTerm);

    ctx.globalAlpha = searchHide ? 0.12 : dimmed ? 0.22 : 1;
    ctx.shadowColor = isSel ? n.color : isConn ? n.color : 'transparent';
    ctx.shadowBlur = isSel ? 18 : isConn ? 8 : 0;

    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI*2);
    ctx.fillStyle = isSel ? n.color : n.color + '55';
    ctx.fill();
    ctx.strokeStyle = n.color;
    ctx.lineWidth = isSel ? 2.5 : isConn ? 1.8 : 0.8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (cam.scale > 0.42 || isSel || isConn) {
      const fs = Math.max(7, Math.min(11, 9 / cam.scale));
      ctx.font = \`\${isSel || isConn ? 600 : 400} \${fs}px var(--vscode-font-family,'Segoe UI',sans-serif)\`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isSel ? '#fff' : isConn ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.6)';
      let lbl = n.label;
      if (lbl.length > 18) lbl = lbl.slice(0, 16) + '...';
      ctx.fillText(lbl, n.x, n.y + n.radius + fs + 2);
    }

    if (isSel) {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(\`in:\${n.inDegree} out:\${n.outDegree}\`, n.x, n.y);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/* Node detail panel ──────────────────────────────────── */
function selectNode(node) {
  selectedNode = node;
  document.getElementById('node-detail').classList.add('open');
  document.getElementById('node-detail-filename').textContent = node.label;

  const idx = new Map(graphNodes.map(n => [n.id, n]));
  const importing = graphEdges.filter(e => e.source === node.id).map(e => idx.get(e.target)).filter(Boolean);
  const usedBy = graphEdges.filter(e => e.target === node.id).map(e => idx.get(e.source)).filter(Boolean);

  let html = \`<div class="detail-file-path">\${node.path}</div>\`;
  html += \`<div style="display:flex;gap:10px;margin-bottom:8px;font-size:11px;color:var(--vscode-descriptionForeground)">
    <span>imports <b>\${importing.length}</b></span>
    <span>used by <b>\${usedBy.length}</b></span>
    <span>\${node.language}</span>
  </div>\`;

  const s = fileSummaryMap[node.path];
  if (s) {
    html += \`<div class="detail-label">Purpose</div>
    <div style="font-size:11px;line-height:1.6">\${s.purpose}</div>\`;
    if (s.exports) html += \`<div class="detail-label">Exports</div>
    <div style="font-size:10.5px;color:var(--vscode-descriptionForeground)">\${s.exports}</div>\`;
  }

  if (importing.length) {
    html += \`<div class="detail-label">Imports (\${importing.length})</div>\`;
    html += importing.slice(0, 10).map(n =>
      \`<span class="detail-chip" data-id="\${n.id}">\${n.label}</span>\`
    ).join('');
    if (importing.length > 10) html += \`<span style="font-size:10px;color:var(--vscode-descriptionForeground)"> +\${importing.length-10} more</span>\`;
  }

  if (usedBy.length) {
    html += \`<div class="detail-label">Used By (\${usedBy.length})</div>\`;
    html += usedBy.slice(0, 10).map(n =>
      \`<span class="detail-chip" data-id="\${n.id}">\${n.label}</span>\`
    ).join('');
    if (usedBy.length > 10) html += \`<span style="font-size:10px;color:var(--vscode-descriptionForeground)"> +\${usedBy.length-10} more</span>\`;
  }

  if (node.exports?.length) {
    html += \`<div class="detail-label">Exports</div>\`;
    html += node.exports.map(e => \`<span class="detail-chip" style="cursor:default">\${e}</span>\`).join('');
  }

  html += \`<button class="btn btn-secondary open-file-btn" data-path="\${node.path}">
    Open File
  </button>\`;

  document.getElementById('node-detail-body').innerHTML = html;
  render();
}

function selectNodeById(id) {
  const n = graphNodes.find(x => x.id === id);
  if (n) selectNode(n);
}

function closeNodeDetail() {
  document.getElementById('node-detail').classList.remove('open');
  selectedNode = null;
  render();
}

function graphSearch(val) {
  searchTerm = val.toLowerCase().trim();
  render();
}

/* ═══════════════════════════════════════════════════════
   SUMMARY
═══════════════════════════════════════════════════════ */
function showSummary(s, name) {
  document.getElementById('summary-empty').style.display = 'none';
  document.getElementById('summary-ready').style.display = 'block';
  document.getElementById('s-name').textContent = name;
  document.getElementById('s-overview').textContent = s.overview || '';
  document.getElementById('s-arch').textContent = s.architecture || '';
  document.getElementById('s-tech').innerHTML = (s.techStack||[]).map(t => \`<span class="chip">\${t}</span>\`).join('');
  document.getElementById('s-modules').innerHTML = (s.keyModules||[]).map(m =>
    \`<div class="card"><div class="card-title">\${m.name}</div><div class="card-body">\${m.description}</div></div>\`
  ).join('');
  document.getElementById('s-entries').innerHTML = (s.entryPoints||[]).map(p =>
    \`<div style="padding:2px 0;cursor:pointer;color:#569cd6" data-path="\${p}">\${p}</div>\`
  ).join('') || '<span style="color:var(--vscode-descriptionForeground)">None detected</span>';
}

function showFileSummaries(files) {
  document.getElementById('s-file-count').textContent = '(' + files.length + ')';
  files.forEach(f => { fileSummaryMap[f.path] = f; });
  document.getElementById('s-files').innerHTML = files.map(f =>
    \`<div class="file-card" data-path="\${f.path}">
      <div class="file-card-path">\${f.path}</div>
      <div class="file-card-desc">\${f.purpose}</div>
      \${f.exports ? \`<div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px">Exports: \${f.exports}</div>\` : ''}
    </div>\`
  ).join('');
}

/* ═══════════════════════════════════════════════════════
   Q&A
═══════════════════════════════════════════════════════ */
let chatLocked = false;

function enableQA() {
  document.getElementById('qa-empty').style.display = 'none';
  document.getElementById('qa-ready').style.display = 'flex';
}

function askQuick(q) {
  document.getElementById('chat-input').value = q;
  sendQ();
}

function chatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQ(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
}

function sendQ() {
  if (chatLocked) return;
  const inp = document.getElementById('chat-input');
  const q = inp.value.trim();
  if (!q) return;
  inp.value = '';
  inp.style.height = 'auto';

  addMsg('user', q);
  addThinking();
  chatLocked = true;
  document.getElementById('send-btn').disabled = true;
  post({ type: 'askQuestion', payload: { question: q } });
}

function addMsg(role, text) {
  const h = document.getElementById('chat-history');
  const empty = h.querySelector('.chat-empty-placeholder');
  if (empty) empty.remove();

  const d = document.createElement('div');
  d.className = 'chat-msg';

  // SVG avatars
  const userSvg = \`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#569cd6">
    <circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
  </svg>\`;
  const aiSvg = \`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#4ec9b0">
    <rect x="2" y="3" width="12" height="9" rx="2"/>
    <circle cx="5.5" cy="7.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/>
    <path d="M5.5 10.5c.8.7 3.7.7 5 0"/>
    <line x1="8" y1="1" x2="8" y2="3"/>
  </svg>\`;

  const avClass = role === 'user' ? 'av-user' : 'av-ai';
  const avIcon = role === 'user' ? userSvg : aiSvg;
  const bubbleClass = role === 'user' ? 'user' : '';

  // Light code formatting
  const formatted = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\`([^\`]+)\`/g, '<code style="font-family:monospace;font-size:10.5px;background:var(--vscode-editor-background);padding:1px 4px;border-radius:3px">$1</code>')
    .replace(/\n/g, '<br>');

  d.innerHTML = \`
    <div class="av \${avClass}">\${avIcon}</div>
    <div class="bubble \${bubbleClass}">\${formatted}</div>
  \`;
  h.appendChild(d);
  h.scrollTop = h.scrollHeight;
}

function addThinking() {
  const h = document.getElementById('chat-history');
  const d = document.createElement('div');
  d.id = 'thinking-msg';
  d.className = 'chat-msg';

  const aiSvg = \`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#4ec9b0">
    <rect x="2" y="3" width="12" height="9" rx="2"/>
    <circle cx="5.5" cy="7.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/>
    <path d="M5.5 10.5c.8.7 3.7.7 5 0"/>
    <line x1="8" y1="1" x2="8" y2="3"/>
  </svg>\`;

  d.innerHTML = \`
    <div class="av av-ai">\${aiSvg}</div>
    <div class="bubble">
      <div class="thinking-dots"><span></span><span></span><span></span></div>
    </div>
  \`;
  h.appendChild(d);
  h.scrollTop = h.scrollHeight;
}

function removeThinking() {
  document.getElementById('thinking-msg')?.remove();
}

function clearChat() {
  document.getElementById('chat-history').innerHTML = '';
  post({ type: 'clearChat' });
}

function openFile(path) {
  post({ type: 'openFile', payload: { path } });
}

/* ═══════════════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════════════ */
function selProv(name) {
  document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.provider-fields').forEach(f => f.classList.remove('open'));
  document.getElementById('pc-'+name).classList.add('selected');
  document.getElementById('pf-'+name).classList.add('open');
}

function saveProv(name) {
  const payload = { name };
  const keyEl = document.getElementById('key-'+name);
  if (keyEl) payload.apiKey = keyEl.value.trim();
  const modelEl = document.getElementById('model-'+name);
  if (modelEl) {
    const customEl = document.getElementById('custom-model-'+name);
    payload.model = modelEl.value === '__custom__' ? (customEl?.value.trim()||'') : modelEl.value;
  }
  const baseEl = document.getElementById('baseurl-'+name);
  if (baseEl) payload.baseUrl = baseEl.value.trim();
  post({ type: 'saveProvider', payload });
}

function toggleCustomModel(name) {
  const sel = document.getElementById('model-'+name);
  const inp = document.getElementById('custom-model-'+name);
  if (!sel || !inp) return;
  inp.style.display = sel.value === '__custom__' ? 'block' : 'none';
}

/* ═══════════════════════════════════════════════════════
   ALERTS
═══════════════════════════════════════════════════════ */
function showAlert(screen, msg, type) {
  const el = document.getElementById(screen+'-alert');
  if (el) el.innerHTML = \`<div class="alert alert-\${type}">\${msg}</div>\`;
}
function clearAlert(screen) {
  const el = document.getElementById(screen+'-alert');
  if (el) el.innerHTML = '';
}

/* ═══════════════════════════════════════════════════════
   MESSAGE HANDLER
═══════════════════════════════════════════════════════ */
let _summary = null, _repoName = '';

window.addEventListener('message', e => {
  const { type, payload } = e.data;

  switch (type) {
    case 'workspaceStatus':
      if (payload.hasWorkspace) {
        document.getElementById('ws-name').textContent = payload.name || 'Workspace';
        document.getElementById('ws-sub').textContent = 'Ready to analyze';
      }
      break;

    case 'progress':
      setProgress(payload.step, stepPct[payload.step] || 10, payload.message);
      break;

    case 'graphReady':
      setProgress(2, 40, 'Graph built');
      initGraph(payload);
      break;

    case 'summaryReady':
      _summary = payload;
      setProgress(3, 65, 'Summary generated');
      break;

    case 'fileSummariesReady':
      setProgress(4, 88, 'File summaries done');
      showFileSummaries(payload);
      break;

    case 'analysisComplete':
      _repoName = payload.repoName;
      setProgress(4, 100, 'Analysis complete');
      setAnalyzing(false);
      if (_summary) showSummary(_summary, _repoName);
      enableQA();
      showAlert('analyze', 'Done. Open Graph, Summary, and Q&A tabs.', 'success');
      break;

    case 'historyLoaded':
      renderHistory(payload.records);
      break;

    case 'analysisRestored':
      _repoName = payload.repoName;
      _summary = payload.summary;
      setAnalyzing(false);
      initGraph(payload.graph);
      showFileSummaries(payload.fileSummaries || []);
      if (_summary) showSummary(_summary, _repoName);
      if (payload.hasQA) enableQA();
      showAlert('analyze', \`Loaded: \${payload.repoName}\`, 'info');
      break;

    case 'answer':
      removeThinking();
      chatLocked = false;
      document.getElementById('send-btn').disabled = false;
      addMsg('ai', payload.answer);
      break;

    case 'thinking':
      // already shown via sendQ
      break;

    case 'providerSaved':
      showAlert('settings', \`Saved: \${payload.name}\`, 'success');
      break;

    case 'settingsLoaded': {
      const { providerName, model, baseUrl, hasKey } = payload;
      if (!providerName) break;
      selProv(providerName);
      if (hasKey) {
        const k = document.getElementById('key-'+providerName);
        if (k) k.placeholder = '(saved) paste to update';
      }
      if (model) {
        const m = document.getElementById('model-'+providerName);
        const c = document.getElementById('custom-model-'+providerName);
        if (m) {
          const known = Array.from(m.options).map(o => o.value);
          if (known.includes(model)) {
            m.value = model;
            if (c) c.style.display = 'none';
          } else {
            m.value = '__custom__';
            if (c) { c.value = model; c.style.display = 'block'; }
          }
        }
      }
      if (baseUrl) {
        const b = document.getElementById('baseurl-'+providerName);
        if (b) b.value = baseUrl;
      }
      break;
    }

    case 'error':
      setAnalyzing(false);
      chatLocked = false;
      document.getElementById('send-btn').disabled = false;
      removeThinking();
      showAlert('analyze', payload.message, 'error');
      showAlert('settings', payload.message, 'error');
      break;
  }
});

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
window.addEventListener('load', () => {
  wireInteractions();
  post({ type: 'getSettings' });
});

wireInteractions();
</script>
</body>
</html>`;
}