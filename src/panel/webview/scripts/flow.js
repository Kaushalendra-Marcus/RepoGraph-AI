/* flow.js — Flow diagram tab: hybrid Mermaid (CDN) + local SVG fallback.
   Works offline and with AI-generated or static diagrams. */

let _flowMap = null;
let _currentDiagram = null;

// ── Render overview grid ──────────────────────────────────────────────────

function renderFlowMap(flowMap) {
  _flowMap = flowMap;
  const empty = document.getElementById('flow-empty');
  const ready = document.getElementById('flow-ready');
  if (empty) empty.style.display = 'none';
  if (ready) ready.style.display = 'flex';

  const diagrams = (flowMap && flowMap.subDiagrams) || [];
  const main = diagrams[0];
  if (!main) {
    const t = document.getElementById('flow-main-title');
    if (t) t.textContent = 'No flows detected';
    const d = document.getElementById('flow-main-desc');
    if (d) d.textContent = 'Static analysis found no routes or file chains. The dependency Graph tab still shows all connections.';
    return;
  }
  _currentDiagram = main;
  renderMainDiagram(main);
  const cw = document.getElementById('flow-custom-wrap');
  if (cw) cw.style.display = 'none';
}

function renderMainDiagram(diagram) {
  const title = document.getElementById('flow-main-title');
  if (title) title.textContent = diagram.title || 'Data flow';
  const desc = document.getElementById('flow-main-desc');
  if (desc) desc.textContent = diagram.description || '';
  const src = document.getElementById('flow-main-source');
  if (src) src.textContent = diagram.mermaidCode || '';
  const mermaidEl = document.getElementById('flow-main-mermaid');
  if (mermaidEl) {
    mermaidEl.innerHTML = '';
    mermaidEl.removeAttribute('data-processed');
    renderMermaid(diagram.mermaidCode || '', mermaidEl);
  }
  wireFlowViewport();
  flowFit();
  renderFileChips('flow-main-files', diagram);
  const expMmd = document.getElementById('flow-export-mmd');
  if (expMmd) expMmd.onclick = () => postMsg({ type: 'exportFlow', payload: { format: 'mmd', id: diagram.id } });
  const expSvg = document.getElementById('flow-export-svg');
  if (expSvg) expSvg.onclick = () => {
    const svg = document.querySelector('#flow-main-mermaid svg');
    postMsg({ type: 'exportFlow', payload: { format: 'svg', id: diagram.id, svgText: svg ? svg.outerHTML : undefined } });
  };
  const expJson = document.getElementById('flow-export-json');
  if (expJson) expJson.onclick = () => postMsg({ type: 'exportFlow', payload: { format: 'json', id: diagram.id } });
  const fnBtn = document.getElementById('flow-fn-btn');
  if (fnBtn) fnBtn.onclick = () => askFunctionFlow();
}

function renderFileChips(elId, diagram) {
  const filesEl = document.getElementById(elId);
  if (!filesEl) return;
  const lines = diagram.relatedLines || [];
  const files = diagram.relatedFiles || [];
  let html = '';
  if (lines.length) {
    html += '<strong style="font-weight:600">Jump to code:</strong><br>' +
      lines.slice(0, 12).map((fl) => {
        const m = /^(.*?):(\d+)$/.exec(fl);
        const path = m ? m[1] : fl;
        const ln = m ? m[2] : '';
        return `<span class="detail-chip" style="cursor:pointer" data-fpath="${escAttr(path)}" data-line="${escAttr(ln)}">${escHtml(fl)}</span>`;
      }).join('');
  } else if (files.length) {
    html += '<strong style="font-weight:600">Related files:</strong><br>' +
      files.map((f) =>
        `<span class="detail-chip" style="cursor:pointer" data-fpath="${escAttr(f)}">${escHtml(f)}</span>`
      ).join('');
  }
  filesEl.innerHTML = html;
  filesEl.querySelectorAll('.detail-chip[data-fpath]').forEach((el) => {
    el.addEventListener('click', () => postMsg({
      type: 'openFile',
      payload: { path: el.dataset.fpath, line: el.dataset.line ? parseInt(el.dataset.line, 10) : undefined },
    }));
  });
}

function renderCustomFlow(diagram) {
  if (!diagram || !diagram.mermaidCode) return;
  const wrap = document.getElementById('flow-custom-wrap');
  if (wrap) wrap.style.display = 'block';
  const title = document.getElementById('flow-custom-title');
  if (title) title.textContent = diagram.title || 'Custom flow';
  const desc = document.getElementById('flow-custom-desc');
  if (desc) desc.textContent = diagram.description || '';
  const mermaidEl = document.getElementById('flow-custom-mermaid');
  if (mermaidEl) {
    mermaidEl.innerHTML = '';
    mermaidEl.removeAttribute('data-processed');
    renderMermaid(diagram.mermaidCode || '', mermaidEl);
  }
  renderFileChips('flow-custom-files', diagram);
  _customDiagram = diagram;
  if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ block: 'nearest' });
}

// ── Open detail panel ─────────────────────────────────────────────────────

function openFlowDetail(diagram) {
  // Detail overlay removed (single-diagram view). Keep as compat: render custom.
  if (diagram && diagram.id !== 'complete_data_flow') renderCustomFlow(diagram);
}

function askFunctionFlow() {
  const fileEl = document.getElementById('flow-fn-file');
  const fnEl = document.getElementById('flow-fn-name');
  const file = fileEl ? fileEl.value.trim() : '';
  const fn = fnEl ? fnEl.value.trim() : '';
  if (!file || !fn) {
    const st = document.getElementById('flow-status');
    if (st) st.textContent = 'Enter file + function, e.g. src/auth/service.ts + login';
    return;
  }
  postMsg({ type: 'getFunctionFlow', payload: { file, function: fn } });
}

function renderGuidedTour(steps) {
  void steps;
  const wrap = document.getElementById('flow-tour');
  if (wrap) wrap.innerHTML = '';
}

function closeFlowDetail() {
  // Detail overlay removed; nothing to close.
}

function copyFlowDiagram() {
  copyMermaidSource(_currentDiagram?.mermaidCode, 'flow-copy-btn');
}

function copyCustomFlowDiagram() {
  copyMermaidSource(_customDiagram?.mermaidCode, 'flow-custom-copy-btn');
}

function copyMermaidSource(code, btnId) {
  if (!code) return;
  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById(btnId);
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      }).catch(() => {});
    }
  } catch { /* ignore */ }
}

// ── Ask custom diagram ────────────────────────────────────────────────────

function askFlowDiagram() {
  const input = document.getElementById('flow-ask-input');
  if (!input) return;
  const q = input.value.trim();
  if (!q) {
    const st = document.getElementById('flow-status');
    if (st) st.textContent = 'Type a question first, e.g. "how does auth work?"';
    return;
  }
  input.value = '';
  const st = document.getElementById('flow-status');
  if (st) st.textContent = `Generating "${q}"...`;
  postMsg({ type: 'generateCustomFlow', payload: { question: q } });
}

let _customDiagram = null;

function addCustomFlowTile(diagram) {
  renderCustomFlow(diagram);
}

// ── Diagram viewport: zoom / pan / fit / fullscreen ───────────────────────

const flowView = { scale: 1, tx: 0, ty: 0 };

function applyFlowTransform() {
  const z = document.getElementById('flow-main-zoom');
  if (z) z.style.transform = `translate(${flowView.tx}px, ${flowView.ty}px) scale(${flowView.scale})`;
  const lvl = document.getElementById('flow-zoom-level');
  if (lvl) lvl.textContent = Math.round(flowView.scale * 100) + '%';
}

function flowZoomBy(f) {
  flowView.scale = Math.max(0.2, Math.min(4, flowView.scale * f));
  applyFlowTransform();
}

function flowFit() {
  flowView.scale = 1; flowView.tx = 0; flowView.ty = 0;
  applyFlowTransform();
}

function flowToggleFs() {
  const wrap = document.getElementById('flow-main-wrap');
  if (!wrap) return;
  const on = wrap.classList.toggle('flow-fs');
  const btn = document.getElementById('flow-fs-btn');
  if (btn) btn.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
}

function wireFlowViewport() {
  const vp = document.getElementById('flow-main-viewport');
  if (!vp || vp.dataset.wired) return;
  vp.dataset.wired = '1';
  let dragging = false, lx = 0, ly = 0;
  vp.addEventListener('mousedown', (e) => {
    dragging = true; lx = e.clientX; ly = e.clientY;
    vp.classList.add('grabbing');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    flowView.tx += e.clientX - lx;
    flowView.ty += e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    applyFlowTransform();
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    vp.classList.remove('grabbing');
  });
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    flowZoomBy(e.deltaY < 0 ? 1.12 : 0.89);
  }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const wrap = document.getElementById('flow-main-wrap');
      if (wrap && wrap.classList.contains('flow-fs')) flowToggleFs();
    }
  });
  const zi = document.getElementById('flow-zoom-in');
  if (zi) zi.onclick = () => flowZoomBy(1.25);
  const zo = document.getElementById('flow-zoom-out');
  if (zo) zo.onclick = () => flowZoomBy(0.8);
  const fit = document.getElementById('flow-fit-btn');
  if (fit) fit.onclick = () => flowFit();
  const fs = document.getElementById('flow-fs-btn');
  if (fs) fs.onclick = () => flowToggleFs();
}

// ── Hybrid Mermaid rendering ──────────────────────────────────────────────

async function renderMermaid(code, container) {
  const clean = sanitizeMermaid(code);
  // Try CDN mermaid first (rich visuals when online)
  if (window.mermaid) {
    try {
      const id = 'mermaid-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      const dark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'default',
        themeVariables: {
          fontSize: '12px',
          fontFamily: 'var(--vscode-font-family, "Segoe UI", sans-serif)',
        },
        flowchart: { curve: 'basis', htmlLabels: true },
        maxTextSize: 100000,
      });
      const { svg } = await mermaid.render(id, clean);
      container.innerHTML = svg;
      // Gentle draw-in animation for edges
      try {
        const paths = container.querySelectorAll('path.flowchart-link, .edgePath path');
        paths.forEach((path, i) => {
          const len = path.getTotalLength ? path.getTotalLength() : 200;
          path.style.strokeDasharray = String(len);
          path.style.strokeDashoffset = String(len);
          path.style.transition = `stroke-dashoffset 0.5s ease ${i * 0.04}s`;
          requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
        });
      } catch { /* animation is cosmetic */ }
      return;
    } catch (err) {
      // fall through to local renderer
    }
  }
  // Offline or render failed → built-in SVG (always works)
  renderLocalSvg(clean, container);
}

function sanitizeMermaid(code) {
  if (!code || typeof code !== 'string') return 'flowchart TD\n  A[No data] --> B[Run analysis first]';
  let out = code.replace(/\\n/g, '\n').trim();
  // strip init directives (we theme from JS)
  out = out.replace(/^%%\{[\s\S]*?\}%%\s*/m, '').trim();
  // Sequence/class/state/ER diagrams pass through untouched (mermaid.js renders them).
  if (/^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|mindmap)/im.test(out)) {
    return out;
  }
  if (!/^flowchart\s+(TD|LR|BT|RL)/i.test(out) && !/^graph\s+(TD|LR|BT|RL)/i.test(out)) {
    out = 'flowchart TD\n' + out;
  }
  // keep only lines that look like mermaid (drop prose the AI sometimes adds)
  const kept = [];
  for (const line of out.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^(flowchart|graph)\s+(TD|LR|BT|RL)/i.test(t)) { kept.push(line); continue; }
    if (t.startsWith('%%')) continue;
    if (t.includes('-->') || t.includes('---') || /^\w+\s*[\[\({]/.test(t) || /^\w+\s*-->/.test(t)) { kept.push(line); continue; }
    // drop stray prose lines
  }
  if (kept.filter((l) => l.includes('-->')).length === 0) {
    return 'flowchart TD\n  A[No edges detected] --> B[Try a different question]';
  }
  return kept.join('\n');
}

// ── Local SVG renderer (no dependencies, offline-safe) ────────────────────
// Parses a subset of Mermaid flowchart: edges A --> B, A --|label|--> B,
// node defs A["label"], A{"label"}, A("label"), A[plain].

function renderLocalSvg(code, container) {
  try {
    const { nodeMap, edges } = parseMermaid(code);
    const ids = Object.keys(nodeMap);
    if (!ids.length) throw new Error('no nodes');
    const layers = computeLayers(ids, edges);
    container.innerHTML = buildSvg(nodeMap, edges, layers);
  } catch {
    container.innerHTML =
      '<div style="color:#f48771;font-size:11px;margin-bottom:6px">Could not render diagram, showing source</div>' +
      `<pre style="font-size:10px;white-space:pre-wrap;word-break:break-all;padding:8px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-radius:4px">${escHtml(code)}</pre>`;
  }
}

function parseMermaid(code) {
  const nodeMap = {}; // id -> label
  const edges = [];   // {from,to,label}

  const ensureNode = (id, label) => {
    if (!id || !/^\w+$/.test(id)) return;
    if (!nodeMap[id]) nodeMap[id] = label || id;
    else if (label && nodeMap[id] === id) nodeMap[id] = label;
  };

  // Matches ID["label"], ID("label"), ID{"label"}, ID[label] anywhere in a line
  const nodeDefGlobal = /(\w+)\s*([\[\({])\s*"?([^"'@\]\}\)]*)"?\s*[\]\)\}]/g;

  for (const rawLine of code.split('\n')) {
    const line = (rawLine || '').trim();
    if (!line) continue;
    if (/^(flowchart|graph)\s+/i.test(line) || line.startsWith('%%')) continue;

    // 1. Register every node definition on this line (both ends of an edge
    //    may carry labels, e.g. A["Login"] --> B["Validate"])
    nodeDefGlobal.lastIndex = 0;
    let dm;
    while ((dm = nodeDefGlobal.exec(line)) !== null) {
      let label = (dm[3] || '').trim() || dm[1];
      if (dm[2] === '{' && !label.startsWith('◆')) label = '◆ ' + label;
      ensureNode(dm[1], label);
    }

    // 2. Strip bracketed labels so edge detection sees clean ids
    const stripped = line.replace(/[\[\({]\s*"?[^"'@\]\}\)]*"?\s*[\]\)\}]/g, '').trim();

    // 3a. Labeled edges: A -->|text| B  |  A --|text|--> B  |  A -- text --> B
    let m = /(\w+)\s*--+>\s*\|\s*([^|]+?)\s*\|\s*(\w+)/.exec(stripped) ||
            /(\w+)\s*--\|\s*([^|]+?)\s*\|\s*-->\s*(\w+)/.exec(stripped);
    if (m) {
      ensureNode(m[1]); ensureNode(m[3]);
      edges.push({ from: m[1], to: m[3], label: (m[2] || '').trim() });
      continue;
    }
    m = /(\w+)\s*--\s*([A-Za-z0-9_][^-|][^>]*?)\s*-->\s*(\w+)/.exec(stripped);
    if (m && m[2].trim() && !/^-+$/.test(m[2].trim())) {
      ensureNode(m[1]); ensureNode(m[3]);
      edges.push({ from: m[1], to: m[3], label: m[2].trim() });
      continue;
    }

    // 3b. Plain edges: A --> B (may appear multiple times per line)
    const plainRe = /(\w+)\s*-->\s*(\w+)/g;
    let pm, found = false;
    plainRe.lastIndex = 0;
    while ((pm = plainRe.exec(stripped)) !== null) {
      ensureNode(pm[1]); ensureNode(pm[2]);
      edges.push({ from: pm[1], to: pm[2], label: '' });
      found = true;
    }
    if (found) continue;
  }
  return { nodeMap, edges };
}

function computeLayers(ids, edges) {
  const indeg = {}; const adj = {};
  ids.forEach((id) => { indeg[id] = 0; adj[id] = []; });
  edges.forEach((e) => {
    if (indeg[e.to] === undefined) { indeg[e.to] = 0; adj[e.to] = []; }
    if (indeg[e.from] === undefined) { indeg[e.from] = 0; adj[e.from] = []; }
    adj[e.from].push(e.to); indeg[e.to]++;
  });
  const layers = [];
  let current = ids.filter((id) => indeg[id] === 0);
  if (!current.length) current = ids.slice(0, 6); // cycle fallback
  const seen = new Set();
  while (current.length && layers.length < 12) {
    layers.push(current);
    current.forEach((id) => seen.add(id));
    const next = [];
    current.forEach((id) => (adj[id] || []).forEach((to) => {
      indeg[to]--;
      if (indeg[to] === 0 && !seen.has(to)) next.push(to);
    }));
    current = [...new Set(next)];
  }
  const leftover = ids.filter((id) => !seen.has(id));
  if (leftover.length) layers.push(leftover.slice(0, 12));
  return layers.filter((l) => l.length);
}

function buildSvg(nodeMap, edges, layers) {
  const nodeW = 150, nodeH = 44, hGap = 26, vGap = 54;
  const maxPerRow = Math.max(...layers.map((l) => l.length));
  const svgW = Math.max(260, maxPerRow * (nodeW + hGap) + hGap);
  const svgH = layers.length * (nodeH + vGap) + vGap;

  const pos = {};
  layers.forEach((layer, li) => {
    const rowW = layer.length * (nodeW + hGap) - hGap;
    const startX = (svgW - rowW) / 2;
    layer.forEach((id, i) => {
      pos[id] = { x: startX + i * (nodeW + hGap), y: vGap / 2 + li * (nodeH + vGap) };
    });
  });

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const short = (s) => { s = String(s); return s.length > 26 ? s.slice(0, 24) + '…' : s; };

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="max-width:100%;height:auto;background:var(--vscode-editor-background);border-radius:4px">`;
  s += `<style>@keyframes flowDash{to{stroke-dashoffset:0}}</style>`;

  // edges (behind nodes)
  edges.forEach((e) => {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) return;
    const x1 = a.x + nodeW / 2, y1 = a.y + nodeH;
    const x2 = b.x + nodeW / 2, y2 = b.y;
    const my = (y1 + y2) / 2;
    const d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    s += `<path d="${d}" fill="none" stroke="rgba(120,120,120,0.45)" stroke-width="1.5"/>`;
    s += `<path d="${d}" fill="none" stroke="#569cd6" stroke-width="1.5" stroke-dasharray="6 4" style="animation:flowDash 1.2s linear infinite"/>`;
    if (e.label) {
      const lx = (x1 + x2) / 2, ly = (my - 4);
      s += `<text x="${lx}" y="${ly}" font-size="9" text-anchor="middle" fill="#9cdcfe">${esc(short(e.label))}</text>`;
    }
  });

  // nodes
  Object.entries(pos).forEach(([id, p]) => {
    const label = nodeMap[id] || id;
    const isDecision = String(label).startsWith('◆');
    const text = short(String(label).replace(/^◆\s*/, ''));
    if (isDecision) {
      const cx = p.x + nodeW / 2, cy = p.y + nodeH / 2;
      s += `<polygon points="${cx},${p.y} ${p.x + nodeW},${cy} ${cx},${p.y + nodeH} ${p.x},${cy}" fill="rgba(86,156,214,0.12)" stroke="#569cd6" stroke-width="1.5"/>`;
      s += `<text x="${cx}" y="${cy + 3}" font-size="10" text-anchor="middle" fill="var(--vscode-editor-foreground,#ccc)">${esc(text)}</text>`;
    } else {
      s += `<rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="6" fill="var(--vscode-sideBar-background,#252526)" stroke="#569cd6" stroke-width="1.2"/>`;
      // wrap label into 1-2 lines
      const words = text.split(/\s+/);
      if (text.length <= 18) {
        s += `<text x="${p.x + nodeW / 2}" y="${p.y + nodeH / 2 + 4}" font-size="10.5" text-anchor="middle" fill="var(--vscode-editor-foreground,#ddd)">${esc(text)}</text>`;
      } else {
        const mid = Math.ceil(words.length / 2);
        const l1 = words.slice(0, mid).join(' '), l2 = words.slice(mid).join(' ');
        s += `<text x="${p.x + nodeW / 2}" y="${p.y + nodeH / 2 - 3}" font-size="10" text-anchor="middle" fill="var(--vscode-editor-foreground,#ddd)">${esc(l1)}</text>`;
        s += `<text x="${p.x + nodeW / 2}" y="${p.y + nodeH / 2 + 10}" font-size="10" text-anchor="middle" fill="var(--vscode-editor-foreground,#ddd)">${esc(l2)}</text>`;
      }
    }
  });

  s += '</svg>';
  return s;
}
