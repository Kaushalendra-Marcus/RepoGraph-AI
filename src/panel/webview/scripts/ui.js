/* ui.js — shared webview UI helpers and button wiring */

const vscode = acquireVsCodeApi();

// 6 tabs: Analyze, Graph, Insights (=summary), Flow, History, Settings
// (Q&A merged into Insights, AI Tools removed)
const TAB_IDS = [
  'tab-analyze',
  'tab-graph',
  'tab-summary',
  'tab-flow',
  'tab-history',
  'tab-settings',
];

const PROVIDERS = ['groq', 'ollama', 'gemini', 'anthropic', 'openai'];

function postMsg(message) {
  vscode.postMessage(message);
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(value) {
  return escHtml(value).replace(/`/g, '&#96;');
}

function byId(id) {
  return document.getElementById(id);
}

function bindClick(id, handler) {
  const el = byId(id);
  if (el) el.addEventListener('click', handler);
}

function bindInput(id, handler) {
  const el = byId(id);
  if (el) el.addEventListener('input', handler);
}

function bindChange(id, handler) {
  const el = byId(id);
  if (el) el.addEventListener('change', handler);
}

function activateTab(index) {
  const buttons = document.querySelectorAll('.tabs .tab');
  const screens = TAB_IDS.map((id) => byId(id)).filter(Boolean);

  buttons.forEach((btn, i) => btn.classList.toggle('active', i === index));
  screens.forEach((screen, i) => {
    screen.classList.toggle('active', i === index);
    screen.style.display = i === index ? 'flex' : 'none';
  });

  // Graph canvas measures 0 while hidden → re-fit every time tab opens
  if (TAB_IDS[index] === 'tab-graph' && typeof refreshGraphView === 'function') {
    setTimeout(refreshGraphView, 60);
  }
}

function gotoSettings() {
  const idx = TAB_IDS.indexOf('tab-settings');
  if (idx >= 0) activateTab(idx);
}

function showAlert(scope, message, kind = 'info') {
  const el = byId(`${scope}-alert`);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${kind}">${escHtml(message)}</div>`;
}

function showExportStatus(message, kind = 'info') {
  const stats = byId('graph-stats');
  if (!stats) return;
  if (!stats.dataset.locked) {
    stats.dataset.original = stats.textContent;
  }
  stats.dataset.locked = '1';
  stats.textContent = message;
  stats.style.color = kind === 'error' ? 'var(--vscode-errorForeground, #f44747)' : '';
  clearTimeout(stats._exportStatusTimer);
  stats._exportStatusTimer = setTimeout(() => {
    stats.textContent = stats.dataset.original || '';
    stats.style.color = '';
    stats.dataset.locked = '';
  }, 4000);
}

function setProgress(step, pct, message) {
  const wrap = byId('progress-wrap');
  const bar = byId('pbar');
  const msg = byId('progress-msg');
  if (wrap) wrap.style.display = 'block';
  if (bar) bar.style.width = `${pct}%`;
  if (msg) msg.textContent = message || 'Working...';

  for (let i = 1; i <= 5; i++) {
    const el = byId(`ps${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  }
}

function setAnalyzing(isBusy) {
  const btn = byId('local-analyze-btn');
  if (btn) {
    btn.disabled = !!isBusy;
    btn.textContent = isBusy ? 'Analyzing…' : 'Analyze current workspace';
  }
  const wrap = byId('progress-wrap');
  if (wrap && isBusy) wrap.style.display = 'block';
}

// ── AI upgrade nudge (shown when analysis ran without a key) ──────────────

function showAiUpgrade(reason) {
  const card = byId('ai-upgrade-card');
  if (card) card.style.display = 'block';

  const note = byId('graph-ai-note');
  if (note) {
    note.style.display = 'block';
    note.textContent = 'Static graph ready. Add a free Groq key in Settings for AI summaries, Q&A and custom flows.';
  }
  const insightsNote = byId('insights-ai-note');
  if (insightsNote) {
    insightsNote.style.display = 'block';
    insightsNote.textContent = reason ||
      'AI summary is locked (no AI key). Add a free Groq key in Settings for real AI summaries + Q&A.';
  }
}

function hideAiUpgrade() {
  const card = byId('ai-upgrade-card');
  if (card) card.style.display = 'none';
  const note = byId('graph-ai-note');
  if (note) note.style.display = 'none';
  const insightsNote = byId('insights-ai-note');
  if (insightsNote) insightsNote.style.display = 'none';
}

// ── Insights lock (no API key → AI insights stay empty) ───────────────────

function showInsightsLocked(reason) {
  const empty = byId('summary-empty');
  const ready = byId('summary-ready');
  if (empty) empty.style.display = 'flex';
  if (ready) ready.style.display = 'none';
  const title = byId('summary-empty-title');
  const sub = byId('summary-empty-sub');
  if (title) title.textContent = 'AI Insights Locked';
  if (sub) sub.textContent = reason ||
    'Add an API key in Settings (free Groq key works), then click Analyze. Graph + Flow tabs work without a key.';
  lockQA();
}

function resetInsightsEmpty() {
  const title = byId('summary-empty-title');
  const sub = byId('summary-empty-sub');
  if (title) title.textContent = 'No Insights Yet';
  if (sub) sub.textContent = 'Analyze a project first to see the summary, key files and Q&A';
}

// ── Insights Q&A (merged from old Q&A tab) ────────────────────────────────

function enableQA() {
  const locked = byId('insights-qa-locked');
  const ready = byId('insights-qa-ready');
  if (locked) locked.style.display = 'none';
  if (ready) ready.style.display = 'block';
}

function lockQA() {
  const locked = byId('insights-qa-locked');
  const ready = byId('insights-qa-ready');
  if (locked) locked.style.display = 'block';
  if (ready) ready.style.display = 'none';
}

function addMsg(role, text) {
  const history = byId('chat-history');
  if (!history) return;

  const row = document.createElement('div');
  row.className = `chat-msg chat-${role}`;
  row.style.cssText = 'margin-bottom:8px;padding:8px 10px;border:1px solid var(--vscode-panel-border);border-radius:6px;white-space:pre-wrap;line-height:1.55;';
  row.textContent = text;
  history.appendChild(row);
  history.scrollTop = history.scrollHeight;
}

function removeThinking() {
  byId('thinking-msg')?.remove();
}

function addThinking() {
  removeThinking();
  const history = byId('chat-history');
  if (!history) return;

  const row = document.createElement('div');
  row.id = 'thinking-msg';
  row.className = 'chat-msg chat-ai';
  row.style.cssText = 'margin-bottom:8px;padding:8px 10px;border:1px solid var(--vscode-panel-border);border-radius:6px;opacity:0.8;font-style:italic;';
  row.textContent = 'Thinking...';
  history.appendChild(row);
  history.scrollTop = history.scrollHeight;
}

function sendQ() {
  const input = byId('chat-input');
  if (!input) return;

  const question = input.value.trim();
  if (!question) return;

  input.value = '';
  addMsg('user', question);
  addThinking();
  postMsg({ type: 'askQuestion', payload: { question } });
}

function chatKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendQ();
  }
}

// ── Insights summary: top 5 + show-all + file lookup ──────────────────────

let _showAllFiles = false;

function fileCardHtml(file) {
  return `
      <div class="card" style="margin-bottom:6px">
        <div class="card-title" style="display:flex;justify-content:space-between;gap:8px">
          <span style="word-break:break-all">${escHtml(file.path)}</span>
          <span class="badge badge-${escAttr(file.complexity || 'low')}">${escHtml(file.complexity || 'low')}</span>
        </div>
        <div class="card-body">${escHtml(file.purpose || '')}</div>
        ${file.exports ? `<div class="card-body" style="margin-top:3px;font-family:monospace;font-size:10px">↳ ${escHtml(file.exports)}</div>` : ''}
      </div>`;
}

function showSummary(summary, repoName) {
  const empty = byId('summary-empty');
  const ready = byId('summary-ready');
  if (empty) empty.style.display = 'none';
  if (ready) ready.style.display = 'block';

  const files = Object.values(fileSummaryMap || {});
  const hasAI = summary && summary._ai !== false;
  if (hasAI) hideAiUpgrade();

  if (byId('s-name')) byId('s-name').textContent = repoName || '';
  if (byId('s-overview')) byId('s-overview').textContent = summary?.overview || '';
  if (byId('s-arch')) byId('s-arch').textContent = summary?.architecture || '';

  const tech = byId('s-tech');
  if (tech) {
    tech.innerHTML = (summary?.techStack || []).map((t) => `<span class="chip">${escHtml(t)}</span>`).join(' ');
  }

  const modules = byId('s-modules');
  if (modules) {
    modules.innerHTML = (summary?.keyModules || []).map((m) => `
      <div class="card" style="margin-bottom:6px">
        <div class="card-title">${escHtml(m.name)}</div>
        <div class="card-body">${escHtml(m.description)}</div>
      </div>
    `).join('');
  }

  const entries = byId('s-entries');
  if (entries) {
    entries.innerHTML = (summary?.entryPoints || []).map((p) => `<div>${escHtml(p)}</div>`).join('');
  }

  const count = byId('s-file-count');
  if (count) count.textContent = files.length ? `(top ${Math.min(5, files.length)} of ${files.length})` : '';

  const list = byId('s-files');
  const showAllBtn = byId('show-all-files-btn');
  if (list) {
    const visible = _showAllFiles ? files : files.slice(0, 5);
    list.innerHTML = visible.map(fileCardHtml).join('') ||
      '<div class="card-body">No file summaries yet.</div>';
    if (showAllBtn) {
      showAllBtn.style.display = files.length > 5 ? 'block' : 'none';
      showAllBtn.textContent = _showAllFiles ? 'Show less' : `Show all ${files.length}`;
    }
  }
}

function showFileSummaries(items) {
  for (const key of Object.keys(fileSummaryMap)) delete fileSummaryMap[key];
  (items || []).forEach((item) => { fileSummaryMap[item.path] = item; });
  _showAllFiles = false;

  if (byId('summary-ready')?.style.display !== 'none') {
    showSummary(_summary, _repoName);
  }
}

// ── File lookup ───────────────────────────────────────────────────────────

function requestFileLookup() {
  const input = byId('file-lookup-input');
  const status = byId('file-lookup-status');
  const result = byId('file-lookup-result');
  if (!input) return;
  const path = input.value.trim();
  if (!path) {
    if (status) status.textContent = 'Type part of a filename first.';
    return;
  }
  if (status) status.textContent = `Explaining ${path}...`;
  if (result) result.innerHTML = '';
  postMsg({ type: 'summarizeFile', payload: { path } });
}

function showSingleFileSummary(file) {
  const status = byId('file-lookup-status');
  const result = byId('file-lookup-result');
  if (status) status.textContent = file._ai === false ? 'Static explanation (add AI key for deeper detail):' : 'AI explanation:';
  if (result) {
    result.innerHTML = fileCardHtml(file) +
      `<button class="btn btn-sm btn-secondary btn-block" data-open="${escAttr(file.path)}">Open file</button>`;
    result.querySelector('[data-open]')?.addEventListener('click', function () {
      postMsg({ type: 'openFile', payload: { path: this.dataset.open } });
    });
  }
}

// ── Agent context export (one click → save + copy) ────────────────────────

let _lastAgentMarkdown = '';

function requestAgentExport(statusElId) {
  const status = statusElId ? byId(statusElId) : null;
  if (status) status.textContent = 'Building compact context...';
  postMsg({ type: 'exportAgentContext', payload: { save: true } });
}

function handleAgentContextReady(payload) {
  _lastAgentMarkdown = payload.markdown || '';
  const msg = payload.path
    ? `✓ Saved ${payload.filename} (~${payload.approxTokens} tokens, ~${payload.savedPct}% smaller). Copied to clipboard.`
    : `✓ Context ready (~${payload.approxTokens} tokens). Copied to clipboard.`;
  for (const id of ['agent-export-status-analyze', 'agent-export-status-insights', 'agent-export-status-graph']) {
    const el = byId(id);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  // Copy to clipboard so agents can paste instantly
  try {
    if (navigator?.clipboard?.writeText && _lastAgentMarkdown) {
      navigator.clipboard.writeText(_lastAgentMarkdown).catch(() => {});
    }
  } catch { /* clipboard unavailable — file save is enough */ }
  const card = byId('agent-export-card');
  if (card) card.style.display = 'block';
}

function showHistory(records) {
  const empty = byId('history-empty');
  const ready = byId('history-ready');
  const list = byId('history-list');
  if (empty) empty.style.display = records?.length ? 'none' : 'flex';
  if (ready) ready.style.display = records?.length ? 'block' : 'none';
  if (!list) return;

  if (!records?.length) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = records.map((record) => `
    <div class="card" style="margin-bottom:8px">
      <div class="card-title" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <span style="word-break:break-word">${escHtml(record.label || record.repoName || 'Analysis')}</span>
        <span style="font-size:10px;color:var(--vscode-descriptionForeground)">${new Date(record.timestamp).toLocaleString()}</span>
      </div>
      <div class="card-body" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span class="chip">${escHtml(record.repoName || '')}</span>
        <button class="btn btn-sm load-history-btn" data-id="${escAttr(record.id)}">Load</button>
        <button class="btn btn-sm btn-secondary delete-history-btn" data-id="${escAttr(record.id)}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.load-history-btn').forEach((btn) => {
    btn.addEventListener('click', () => postMsg({ type: 'loadAnalysis', payload: { id: btn.dataset.id } }));
  });
  list.querySelectorAll('.delete-history-btn').forEach((btn) => {
    btn.addEventListener('click', () => postMsg({ type: 'deleteAnalysis', payload: { id: btn.dataset.id } }));
  });
}

function markProviderSaved(name, hasKey) {
  const card = byId(`pc-${name}`);
  if (card && card.tagName === 'DETAILS') {
    card.open = true;
    card.classList.add('selected');
  }
  const chk = byId(`check-${name}`);
  if (chk) chk.style.display = (hasKey === false && name !== 'ollama') ? 'none' : 'inline-flex';
}

function applySettingsLoaded(payload) {
  if (!payload?.providerName) return;
  markProviderSaved(payload.providerName, payload.hasKey);

  for (const provider of PROVIDERS) {
    const modelSelect = byId(`model-${provider}`);
    const customModel = byId(`custom-model-${provider}`);
    const baseUrl = byId(`baseurl-${provider}`);
    if (modelSelect && payload.providerName === provider && payload.model) {
      const hasOption = [...modelSelect.options].some((opt) => opt.value === payload.model);
      if (hasOption) {
        modelSelect.value = payload.model;
        if (customModel) customModel.style.display = 'none';
      } else {
        modelSelect.value = '__custom__';
        if (customModel) {
          customModel.style.display = 'block';
          customModel.value = payload.model;
        }
      }
    }
    if (baseUrl && payload.providerName === provider && payload.baseUrl) baseUrl.value = payload.baseUrl;
  }

  if (payload.hasKey === false) {
    showAlert('settings', `Loaded ${payload.providerName} settings. Add an API key if needed.`, 'info');
  }
}

function updateTokenDisplay(total) {
  const el = byId('token-display');
  if (el) el.textContent = `Total tokens used: ${total || 0}`;
}


function collectProviderPayload(name) {
  const key = byId(`key-${name}`)?.value?.trim() || '';
  const modelSelect = byId(`model-${name}`);
  const customModel = byId(`custom-model-${name}`)?.value?.trim() || '';
  const baseUrl = byId(`baseurl-${name}`)?.value?.trim() || '';
  const model = modelSelect?.value === '__custom__' ? customModel : modelSelect?.value;

  const payload = { name };
  if (key) payload.apiKey = key;
  if (model) payload.model = model;
  if (baseUrl) payload.baseUrl = baseUrl;
  return payload;
}

function syncCustomModelField(name) {
  const select = byId(`model-${name}`);
  const custom = byId(`custom-model-${name}`);
  if (!select || !custom) return;
  custom.style.display = select.value === '__custom__' ? 'block' : 'none';
}

function wireProviderControls() {
  for (const provider of PROVIDERS) {
    const card = byId(`pc-${provider}`);
    const fields = byId(`pf-${provider}`);
    const select = byId(`model-${provider}`);
    if (select) {
      select.addEventListener('change', () => syncCustomModelField(provider));
      syncCustomModelField(provider);
    }
    const btn = document.querySelector(`.save-provider-btn[data-name="${provider}"]`);
    if (btn) {
      btn.addEventListener('click', () => {
        postMsg({ type: 'saveProvider', payload: collectProviderPayload(provider) });
      });
    }

    if (card && fields) {
      // <details> handles expand/collapse natively; mark open cards selected.
      card.addEventListener('toggle', () => {
        card.classList.toggle('selected', card.open);
      });
    }
  }
}

function wireUi() {
  document.querySelectorAll('.tabs .tab').forEach((btn, index) => {
    btn.addEventListener('click', () => activateTab(index));
  });

  bindClick('local-analyze-btn', () => postMsg({ type: 'analyzeLocal' }));
  bindClick('goto-settings-btn', () => gotoSettings());

  // Insights: show all + file lookup + chat
  bindClick('show-all-files-btn', () => {
    _showAllFiles = !_showAllFiles;
    if (_summary) showSummary(_summary, _repoName);
  });
  bindClick('file-lookup-btn', () => requestFileLookup());
  const lookupInput = byId('file-lookup-input');
  if (lookupInput) lookupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); requestFileLookup(); }
  });
  bindClick('chat-send-btn', () => sendQ());
  const qaLink = byId('insights-qa-settings-link');
  if (qaLink) qaLink.addEventListener('click', (e) => { e.preventDefault(); gotoSettings(); });

  // Agent export (3 entry points, same action)
  bindClick('agent-export-btn-analyze', () => requestAgentExport('agent-export-status-analyze'));
  bindClick('agent-export-btn-insights', () => requestAgentExport('agent-export-status-insights'));
  bindClick('agent-export-btn-graph', () => requestAgentExport('agent-export-status-graph'));

  bindClick('flow-ask-btn', () => askFlowDiagram());
  bindClick('flow-copy-btn', () => copyFlowDiagram());
  bindClick('flow-custom-copy-btn', () => copyCustomFlowDiagram());

  bindClick('clear-filter-btn', () => clearFilters());
  bindInput('depth-filter', () => applyFilters());

  bindClick('node-detail-close', () => closeNodeDetail());

  bindInput('chat-input', () => {});
  const chatInput = byId('chat-input');
  if (chatInput) chatInput.addEventListener('keydown', chatKey);

  document.querySelectorAll('.qq').forEach((chip) => {
    chip.addEventListener('click', () => {
      const input = byId('chat-input');
      if (!input) return;
      input.value = chip.dataset.q || chip.textContent || '';
      input.focus();
    });
  });

  // Flow preset buttons (in flow.html toolbar)
  document.querySelectorAll('.flow-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q || btn.textContent || '';
      const input = byId('flow-ask-input');
      if (input) input.value = q;
      postMsg({ type: 'generateCustomFlow', payload: { question: q } });
      const st = byId('flow-status');
      if (st) st.textContent = `Generating "${q}"...`;
    });
  });

  wireProviderControls();
  lockQA();
  activateTab(0);
}

wireUi();
