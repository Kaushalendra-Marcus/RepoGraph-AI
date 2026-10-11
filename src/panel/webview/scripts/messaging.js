/* messaging.js — all window.postMessage handlers from the extension */

const fileSummaryMap = {};
let _summary = null;
let _repoName = '';

const STEP_PCT = { 1: 15, 2: 40, 3: 65, 4: 85, 5: 95 };

window.addEventListener('message', e => {
  const { type, payload } = e.data;

  switch (type) {
    // ── Workspace ──
    case 'workspaceStatus':
      if (payload.hasWorkspace) {
        document.getElementById('ws-name').textContent = payload.name;
        document.getElementById('ws-sub').textContent  = 'Ready to analyze. Click the button below.';
      }
      break;

    // ── Analysis progress ──
    case 'progress':
      setProgress(payload.step, STEP_PCT[payload.step] || 10, payload.message);
      if (payload.step === 1) {
        // Fresh run: drop previous AI summary so a failed/locked run can
        // never display stale prose as if it were new.
        _summary = null;
      }
      break;

    case 'graphReady':
      setProgress(2, 40, 'Graph built!');
      initGraph(payload);
      break;

    case 'summaryReady':
      _summary = payload;
      setProgress(3, 65, payload._ai === false ? 'Static overview ready!' : 'Summary generated!');
      break;

    case 'fileSummariesReady':
      setProgress(4, 88, 'File summaries done!');
      showFileSummaries(payload);
      break;

    case 'flowMapReady':
      setProgress(5, 96, 'Flow diagrams ready!');
      renderFlowMap(payload);
      break;

    case 'analysisComplete': {
      _repoName = payload.repoName;
      setProgress(5, 100, 'Analysis complete!');
      setAnalyzing(false);
      if (payload.hasAI) {
        hideAiUpgrade();
        resetInsightsEmpty();
        if (_summary) showSummary(_summary, _repoName);
        enableQA();
      } else {
        // No key → Insights stays locked, only Graph + Flow are usable
        showInsightsLocked();
        showAiUpgrade('Graph + flows ready without AI. Add a free Groq key in Settings, then Analyze again for AI insights + Q&A.');
      }
      const card = document.getElementById('agent-export-card');
      if (card) card.style.display = 'block';
      showAlert('analyze', payload.hasAI
        ? '✓ Done! See Graph, Insights and Flow tabs.'
        : '✓ Graph + flows ready (no AI key). Add a free key in Settings for AI summaries + Q&A.', payload.hasAI ? 'success' : 'info');
      break;
    }

    case 'analysisRestored':
      _repoName = payload.repoName;
      _summary  = payload.summary;
      setAnalyzing(false);
      initGraph(payload.graph);
      showFileSummaries(payload.fileSummaries || []);
      if (payload.hasAI === false) {
        showInsightsLocked();
        showAiUpgrade();
      } else {
        resetInsightsEmpty();
        if (_summary) showSummary(_summary, _repoName);
        if (payload.hasQA) enableQA(); else lockQA();
      }
      if (payload.flowMap) renderFlowMap(payload.flowMap);
      {
        const card = document.getElementById('agent-export-card');
        if (card) card.style.display = 'block';
      }
      showAlert('analyze', '✓ Restored previous analysis.', 'success');
      break;

    case 'aiUpgrade':
      showAiUpgrade(payload.reason);
      break;

    // ── Insights Q&A ──
    case 'answer':
      removeThinking();
      addMsg('ai', payload.answer);
      break;

    // ── On-demand file summary ──
    case 'fileSummaryReady':
      showSingleFileSummary(payload);
      // also cache for node detail
      fileSummaryMap[payload.path] = payload;
      break;

    case 'fileSummaryError': {
      const status = document.getElementById('file-lookup-status');
      if (status) status.textContent = '✗ ' + payload.message;
      break;
    }

    case 'fileSummaryBusy': {
      const status = document.getElementById('file-lookup-status');
      if (status && payload.busy) status.textContent = `Explaining ${payload.path}...`;
      break;
    }

    // ── Settings ──
    case 'providerSaved':
      markProviderSaved(payload.name, true);
      showAlert('settings', '✓ Provider saved: ' + payload.name, 'success');
      hideAiUpgrade();
      showAlert('analyze', '✓ Key saved. Click Analyze again to unlock AI insights + Q&A.', 'success');
      break;

    case 'settingsLoaded':
      applySettingsLoaded(payload);
      // Show upgrade nudge if no key saved yet
      if (payload.hasKey === false) showAiUpgrade();
      break;

    // ── History ──
    case 'historyLoaded':
      showHistory(payload.records);
      break;

    case 'tokenUsage':
      updateTokenDisplay(payload.total);
      break;

    case 'layoutLoaded':
      applyLayout(payload.positions);
      break;

    // ── Flow ──
    case 'customFlowReady':
      addCustomFlowTile(payload.diagram || payload);
      {
        const st = document.getElementById('flow-status');
        if (st) st.textContent = '';
      }
      break;

    case 'customFlowBusy': {
      const st = document.getElementById('flow-status');
      if (st) st.textContent = payload.busy ? 'Generating custom flow...' : '';
      const btn = document.getElementById('flow-ask-btn');
      if (btn) btn.disabled = !!payload.busy;
      break;
    }

    // ── Agent context ──
    case 'agentContextReady':
      handleAgentContextReady(payload);
      break;

    case 'agentContextError': {
      const msg = '✗ ' + payload.message;
      for (const id of ['agent-export-status-analyze', 'agent-export-status-insights', 'agent-export-status-graph']) {
        const el = document.getElementById(id);
        if (el) { el.textContent = msg; el.style.display = 'block'; }
      }
      break;
    }

    // ── Errors ──
    case 'error':
      setAnalyzing(false);
      showAlert('analyze',  '✗ ' + payload.message, 'error');
      showAlert('settings', '✗ ' + payload.message, 'error');
      break;

    // ── Export ──
    case 'exportSaved':
      showExportStatus(`✓ Saved ${payload.format.toUpperCase()} to ${payload.path}`, 'success');
      break;

    case 'exportError':
      showExportStatus('✗ ' + payload.message, 'error');
      break;
  }
});
