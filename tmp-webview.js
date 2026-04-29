
/* ══════════════════════════════════════════════════════════
   VSCODE API
══════════════════════════════════════════════════════════ */
console.log('[REPOGRAPH] Script initializing...');
let vscode;
try {
  vscode = acquireVsCodeApi();
  console.log('[REPOGRAPH] VS Code API acquired successfully');
} catch (e) {
  console.error('[REPOGRAPH] Failed to acquire VS Code API:', e);
}

// Helper to safely encode path for onclick handlers
function openFileHandler(path) {
  console.log('[REPOGRAPH] openFileHandler called with path:', path);
  if (!vscode) { console.error('[REPOGRAPH] vscode not available'); return; }
  vscode.postMessage({type:'openFile',payload:{path}});
}

/* ══════════════════════════════════════════════════════════
   TABS
══════════════════════════════════════════════════════════ */
const TAB_NAMES = ['analyze','graph','summary','qa','settings'];
function showTab(name) {
  console.log('[REPOGRAPH] showTab called:', name);
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', TAB_NAMES[i]===name));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if (name==='graph' && graphBuilt) {
    // Graph can be initialized while hidden; force canvas resize after tab becomes visible.
    setTimeout(() => {
      if (resizeCanvas()) {
        fitView();
      }
      render();
    }, 60);
  }
}

/* ══════════════════════════════════════════════════════════
   SOURCE SWITCHING
══════════════════════════════════════════════════════════ */
function switchSource(src) {
  console.log('[REPOGRAPH] switchSource called:', src);
  ['local','github'].forEach(s => {
    document.getElementById('src-'+s+'-btn').classList.toggle('active', s===src);
    document.getElementById('pane-'+s).classList.toggle('active', s===src);
  });
}
function setRepo(url) { 
  console.log('[REPOGRAPH] setRepo called:', url);
  document.getElementById('repo-url').value = url; 
}

/* ══════════════════════════════════════════════════════════
   ANALYZE
══════════════════════════════════════════════════════════ */
function analyzeLocal() {
  console.log('[REPOGRAPH] analyzeLocal button clicked');
  clearAlert('analyze');
  setAnalyzing(true);
  if (!vscode) { console.error('[REPOGRAPH] vscode not available'); return; }
  console.log('[REPOGRAPH] Sending analyzeLocal message to extension');
  vscode.postMessage({ type:'analyzeLocal' });
}
function analyzeGithub() {
  console.log('[REPOGRAPH] analyzeGithub button clicked');
  const url = document.getElementById('repo-url').value.trim();
  if (!url) { 
    console.warn('[REPOGRAPH] No GitHub URL provided');
    showAlert('analyze','Please enter a GitHub URL','error'); 
    return; 
  }
  clearAlert('analyze');
  setAnalyzing(true);
  if (!vscode) { console.error('[REPOGRAPH] vscode not available'); return; }
  const tok = document.getElementById('github-token').value.trim();
  console.log('[REPOGRAPH] Sending analyzeGithub message with URL:', url);
  vscode.postMessage({ type:'analyzeGithub', payload:{ url, githubToken: tok||undefined }});
}

function setAnalyzing(on) {
  document.getElementById('local-analyze-btn').disabled = on;
  document.getElementById('github-analyze-btn').disabled = on;
  document.getElementById('progress-wrap').style.display = on ? 'block' : 'none';
  if (on) setProgress(1, 8, 'Starting...');
}

function setProgress(step, pct, msg) {
  document.getElementById('pbar').style.width = pct+'%';
  document.getElementById('progress-msg').textContent = msg;
  ['ps1','ps2','ps3','ps4'].forEach((id,i) => {
    const el = document.getElementById(id);
    el.className = (i+1 < step) ? 'done' : (i+1===step) ? 'active' : '';
  });
}

/* ══════════════════════════════════════════════════════════
   GRAPH ENGINE
══════════════════════════════════════════════════════════ */
let canvas, ctx, canvasWrap;
let nodes = [], edges = [];
let cam = { x:0, y:0, scale:1 };
let dragging = false, dragNode = null, lastMouse = {x:0,y:0};
let selectedNode = null;
let graphBuilt = false;
let animFrame = null;
let searchTerm = '';
const fileSummaryMap = {};
let pointerState = { down: false, moved: false, startX: 0, startY: 0, node: null };

// Group → color mapping
const GROUP_COLORS = [
  '#569cd6','#4ec9b0','#c586c0','#dcdcaa',
  '#d7ba7d','#ce9178','#9cdcfe','#4fc1ff',
  '#f48771','#b5cea8','#646695'
];
const groupColorMap = {};

function initGraph(data) {
  graphBuilt = true;
  document.getElementById('graph-empty').style.display='none';
  document.getElementById('graph-wrap').style.display='flex';

  canvas = document.getElementById('graph-canvas');
  ctx = canvas.getContext('2d');
  canvasWrap = document.getElementById('graph-canvas-wrap');

  // Build group→color
  const groups = [...new Set(data.nodes.map(n=>n.group))];
  groups.forEach((g,i)=>{ groupColorMap[g] = GROUP_COLORS[i % GROUP_COLORS.length]; });

  // Build legend (top 5 groups)
  const legEl = document.getElementById('graph-legend');
  legEl.innerHTML = groups.slice(0,6).map(g=>
    `<div class="legend-item"><div class="legend-dot" style="background:${groupColorMap[g]}"></div>${g}</div>`
  ).join('');

  // Cap at 120 nodes for performance
  const rankedNodes = [...data.nodes]
    .sort((a,b)=>(b.inDegree+b.outDegree)-(a.inDegree+a.outDegree))
  const seedNodes = rankedNodes.slice(0,60);
  const nodeIds = new Set(seedNodes.map(n=>n.id));

  // Expand from the most important nodes so the visible subgraph stays connected.
  let expanded = true;
  while (expanded && nodeIds.size < 120) {
    expanded = false;
    for (const edge of data.edges) {
      if (nodeIds.size >= 120) break;
      if (nodeIds.has(edge.source) && !nodeIds.has(edge.target)) {
        nodeIds.add(edge.target);
        expanded = true;
      } else if (nodeIds.has(edge.target) && !nodeIds.has(edge.source)) {
        nodeIds.add(edge.source);
        expanded = true;
      }
    }
  }

  const topNodes = rankedNodes.filter(n => nodeIds.has(n.id)).slice(0,120);

  // Initialize positions (random, will be force-settled)
  nodes = topNodes.map((n,i)=>{
    const angle = (i / topNodes.length) * Math.PI * 2;
    const r = 80 + Math.sqrt(topNodes.length) * 18;
    return {
      ...n,
      x: Math.cos(angle)*r + (Math.random()-0.5)*60,
      y: Math.sin(angle)*r + (Math.random()-0.5)*60,
      vx:0, vy:0,
      r: Math.max(14, Math.min(28, 14 + n.inDegree*2.5)),
      color: groupColorMap[n.group] || GROUP_COLORS[0],
    };
  });

  edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  document.getElementById('graph-stats').textContent =
    topNodes.length + ' files · ' + edges.length + ' imports';

  // Run force layout simulation
  for (let i=0;i<200;i++) tickForce();

  setupCanvasEvents();
  resizeCanvas();
  fitView();
  startRender();
}

/* ── Force-directed layout ─────────────────────────────────────────── */
function tickForce() {
  const repK = 1800;
  const attrK = 0.06;
  const idealLen = 120;
  const centerK = 0.003;

  // Repulsion between all pairs
  for (let i=0;i<nodes.length;i++) {
    for (let j=i+1;j<nodes.length;j++) {
      const a=nodes[i], b=nodes[j];
      const dx=b.x-a.x, dy=b.y-a.y;
      const distSq = Math.max(dx*dx+dy*dy, 1);
      const dist = Math.sqrt(distSq);
      const f = repK / distSq;
      const fx=(dx/dist)*f, fy=(dy/dist)*f;
      a.vx-=fx; a.vy-=fy;
      b.vx+=fx; b.vy+=fy;
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map(n=>[n.id,n]));
  for (const e of edges) {
    const a=nodeMap.get(e.source), b=nodeMap.get(e.target);
    if (!a||!b) continue;
    const dx=b.x-a.x, dy=b.y-a.y;
    const dist=Math.max(Math.sqrt(dx*dx+dy*dy),1);
    const f = (dist-idealLen)/dist * attrK;
    a.vx+=dx*f; a.vy+=dy*f;
    b.vx-=dx*f; b.vy-=dy*f;
  }

  // Center gravity
  for (const n of nodes) {
    n.vx -= n.x * centerK;
    n.vy -= n.y * centerK;
    n.x += n.vx*0.5; n.y += n.vy*0.5;
    n.vx *= 0.72; n.vy *= 0.72;
  }
}

/* ── Canvas events ─────────────────────────────────────────────────── */
function setupCanvasEvents() {
  canvas.onwheel = e => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    cam.x = mx - (mx - cam.x)*f;
    cam.y = my - (my - cam.y)*f;
    cam.scale = Math.max(0.15, Math.min(5, cam.scale*f));
    render();
  };

  canvas.onmousedown = e => {
    const {gx,gy} = screenToGraph(e.offsetX, e.offsetY);
    const hit = nodes.find(n => Math.hypot(n.x-gx, n.y-gy) < n.r+2);
    pointerState = { down: true, moved: false, startX: e.clientX, startY: e.clientY, node: hit };
    dragNode = hit;
    dragging = !hit;
    lastMouse = {x:e.clientX, y:e.clientY};
    canvas.classList.toggle('grabbing', dragging);
  };

  canvas.onmouseup = e => {
    const {gx,gy} = screenToGraph(e.offsetX, e.offsetY);
    const hit = nodes.find(n => Math.hypot(n.x-gx, n.y-gy) < n.r+3);
    const clickDistance = Math.hypot(e.clientX - pointerState.startX, e.clientY - pointerState.startY);

    if (pointerState.down && !pointerState.moved && pointerState.node && clickDistance < 5) {
      // Node click — show details and keep graph selection visible.
      selectNode(pointerState.node);
    } else if (pointerState.down && !pointerState.moved && !pointerState.node && !hit) {
      selectedNode = null;
      closeNodeDetail();
    }

    dragging=false; dragNode=null;
    pointerState.down = false;
    canvas.classList.remove('grabbing');
    render();
  };

  canvas.onmousemove = e => {
    if (pointerState.down) {
      const moved = Math.hypot(e.clientX - pointerState.startX, e.clientY - pointerState.startY);
      if (moved > 4) pointerState.moved = true;
    }

    if (dragging) {
      cam.x += e.clientX-lastMouse.x;
      cam.y += e.clientY-lastMouse.y;
      lastMouse = {x:e.clientX,y:e.clientY};
      render();
    } else if (dragNode) {
      const dx=(e.clientX-lastMouse.x)/cam.scale;
      const dy=(e.clientY-lastMouse.y)/cam.scale;
      dragNode.x+=dx; dragNode.y+=dy;
      dragNode.vx=0; dragNode.vy=0;
      lastMouse={x:e.clientX,y:e.clientY};
      render();
    } else {
      const {gx,gy}=screenToGraph(e.offsetX,e.offsetY);
      const hit=nodes.find(n=>Math.hypot(n.x-gx,n.y-gy)<n.r+3);
      canvas.title = hit ? hit.path : '';
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    }
  };

  canvas.ondblclick = e => {
    const {gx,gy}=screenToGraph(e.offsetX,e.offsetY);
    const hit=nodes.find(n=>Math.hypot(n.x-gx,n.y-gy)<n.r+3);
    if (hit) vscode.postMessage({type:'openFile',payload:{path:hit.path}});
  };

  window.addEventListener('resize', ()=>{ resizeCanvas(); render(); });
}

function screenToGraph(sx,sy){ return {gx:(sx-cam.x)/cam.scale, gy:(sy-cam.y)/cam.scale}; }
function graphToScreen(gx,gy){ return {sx:gx*cam.scale+cam.x, sy:gy*cam.scale+cam.y}; }

function resizeCanvas() {
  if (!canvas||!canvasWrap) return;
  const rect = canvasWrap.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return false;
  }
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.style.width = rect.width+'px';
  canvas.style.height = rect.height+'px';
  return true;
}

function fitView() {
  if (!nodes.length||!canvas) return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const n of nodes) {
    minX=Math.min(minX,n.x-n.r); maxX=Math.max(maxX,n.x+n.r);
    minY=Math.min(minY,n.y-n.r); maxY=Math.max(maxY,n.y+n.r);
  }
  const pad=40;
  const W=canvas.width-pad*2, H=canvas.height-pad*2;
  const gW=maxX-minX||1, gH=maxY-minY||1;
  cam.scale=Math.max(0.15,Math.min(2.5,Math.min(W/gW,H/gH)));
  cam.x=pad-(minX*cam.scale);
  cam.y=pad-(minY*cam.scale);
  render();
}

function zoom(f) { cam.scale=Math.max(0.15,Math.min(5,cam.scale*f)); render(); }
function resetView() { fitView(); }

/* ── Main render ───────────────────────────────────────────────────── */
function startRender() { render(); }

function render() {
  if (!canvas||!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(cam.x,cam.y);
  ctx.scale(cam.scale,cam.scale);

  const nodeMap = new Map(nodes.map(n=>[n.id,n]));
  const selectedId = selectedNode?.id;

  // Determine highlighted connections
  const connectedIds = new Set();
  if (selectedId) {
    edges.forEach(e=>{
      if(e.source===selectedId) connectedIds.add(e.target);
      if(e.target===selectedId) connectedIds.add(e.source);
    });
  }

  // ── Draw edges with arrows ──────────────────────────────────────────
  for (const e of edges) {
    const a=nodeMap.get(e.source), b=nodeMap.get(e.target);
    if(!a||!b) continue;

    const isRelated = selectedId && (e.source===selectedId || e.target===selectedId);
    const dimmed = selectedId && !isRelated;

    if (searchTerm) {
      const matchA = a.label.toLowerCase().includes(searchTerm);
      const matchB = b.label.toLowerCase().includes(searchTerm);
      if (!matchA && !matchB) continue;
    }

    // Direction: source imports target → arrow points TO target
    const dx=b.x-a.x, dy=b.y-a.y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<1) continue;

    // Start/end on node circumference
    const startX=a.x+(dx/dist)*a.r;
    const startY=a.y+(dy/dist)*a.r;
    const endX=b.x-(dx/dist)*(b.r+7);
    const endY=b.y-(dy/dist)*(b.r+7);

    ctx.beginPath();
    ctx.moveTo(startX,startY);
    ctx.lineTo(endX,endY);

    if (isRelated && e.source===selectedId) {
      ctx.strokeStyle='rgba(86,156,214,0.85)';
      ctx.lineWidth=1.8;
    } else if (isRelated && e.target===selectedId) {
      ctx.strokeStyle='rgba(78,201,214,0.7)';
      ctx.lineWidth=1.4;
    } else if (dimmed) {
      ctx.strokeStyle='rgba(255,255,255,0.04)';
      ctx.lineWidth=0.5;
    } else {
      ctx.strokeStyle='rgba(255,255,255,0.12)';
      ctx.lineWidth=0.8;
    }
    ctx.stroke();

    // Arrowhead
    if (!dimmed) {
      const arrowLen=8, arrowAngle=0.45;
      const ang=Math.atan2(endY-startY,endX-startX);
      ctx.beginPath();
      ctx.moveTo(endX,endY);
      ctx.lineTo(endX-arrowLen*Math.cos(ang-arrowAngle), endY-arrowLen*Math.sin(ang-arrowAngle));
      ctx.moveTo(endX,endY);
      ctx.lineTo(endX-arrowLen*Math.cos(ang+arrowAngle), endY-arrowLen*Math.sin(ang+arrowAngle));
      ctx.strokeStyle = isRelated ? 'rgba(86,156,214,0.85)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = isRelated ? 1.8 : 0.8;
      ctx.stroke();
    }

    // Edge label (import name) — only when zoomed in and selected
    if (isRelated && e.label && cam.scale > 0.9) {
      const midX=(startX+endX)/2, midY=(startY+endY)/2;
      ctx.font='400 9px monospace';
      ctx.fillStyle='rgba(150,180,220,0.7)';
      ctx.textAlign='center';
      ctx.fillText(e.label.slice(0,20), midX, midY-4);
    }
  }

  // ── Draw nodes ──────────────────────────────────────────────────────
  for (const n of nodes) {
    const isSelected = n.id===selectedId;
    const isConn = connectedIds.has(n.id);
    const dimmed = selectedId && !isSelected && !isConn;

    if (searchTerm && !n.label.toLowerCase().includes(searchTerm)) {
      // Draw faded
      ctx.globalAlpha=0.15;
    } else if (dimmed) {
      ctx.globalAlpha=0.25;
    } else {
      ctx.globalAlpha=1;
    }

    // Shadow/glow for selected
    if (isSelected) {
      ctx.shadowColor=n.color; ctx.shadowBlur=16;
    } else if (isConn) {
      ctx.shadowColor=n.color; ctx.shadowBlur=6;
    } else {
      ctx.shadowBlur=0;
    }

    // Circle body
    ctx.beginPath();
    ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
    ctx.fillStyle= isSelected ? n.color : n.color+'55';
    ctx.fill();
    ctx.strokeStyle= n.color;
    ctx.lineWidth= isSelected ? 2 : (isConn ? 1.5 : 0.8);
    ctx.stroke();
    ctx.shadowBlur=0;

    // File name label
    const showLabel = cam.scale > 0.45 || isSelected || isConn;
    if (showLabel) {
      const fontSize = Math.max(8, Math.min(11, 9/cam.scale));
      ctx.font = `${isSelected||isConn?600:400} ${fontSize}px var(--vscode-font-family,'Segoe UI',sans-serif)`;
      ctx.textAlign='center';
      ctx.fillStyle = isSelected ? '#fff' : isConn ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)';

      // Truncate long names
      let label=n.label;
      if (label.length>16) label=label.slice(0,14)+'…';
      ctx.fillText(label, n.x, n.y + n.r + fontSize + 2);
    }

    // In/Out degree badge on selected
    if (isSelected) {
      ctx.font='bold 9px monospace';
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(n.inDegree+'↙', n.x, n.y);
      ctx.textBaseline='alphabetic';
    }

    ctx.globalAlpha=1;
  }

  ctx.restore();
}

/* ── Node detail panel ─────────────────────────────────────────────── */
function selectNode(node) {
  selectedNode=node;
  const panel = document.getElementById('node-detail');
  panel.classList.add('open');

  document.getElementById('node-detail-filename').textContent=node.label;

  const nodeMap = new Map(nodes.map(n=>[n.id,n]));
  const importing = edges.filter(e=>e.source===node.id).map(e=>nodeMap.get(e.target)).filter(Boolean);
  const importedBy = edges.filter(e=>e.target===node.id).map(e=>nodeMap.get(e.source)).filter(Boolean);

  let html=`<div class="detail-file-path">${node.path}</div>`;
  html+=`<div style="display:flex;gap:10px;margin-bottom:8px;font-size:11px;color:var(--vscode-descriptionForeground)">
    <span>📤 imports <b>${importing.length}</b></span>
    <span>📥 used by <b>${importedBy.length}</b></span>
    <span>🏷️ ${node.language}</span>
  </div>`;

  // Summary if available
  if (fileSummaryMap[node.path]) {
    const s=fileSummaryMap[node.path];
    html+=`<div class="detail-label">Purpose</div><div style="font-size:11px;line-height:1.6;color:var(--vscode-editor-foreground)">${s.purpose}</div>`;
    if(s.exports) html+=`<div class="detail-label">Exports</div><div style="font-size:10.5px;color:var(--vscode-descriptionForeground)">${s.exports}</div>`;
  }

  if (importing.length) {
    html+=`<div class="detail-label">Imports (${importing.length})</div>`;
    html+=importing.slice(0,12).map(n=>
      `<span class="detail-chip" onclick="selectNode(nodes.find(x=>x.id==='${n.id}'));render()" title="${n.path}">${n.label}</span>`
    ).join('');
    if(importing.length>12) html+=`<span style="font-size:10px;color:var(--vscode-descriptionForeground)"> +${importing.length-12} more</span>`;
  }

  if (importedBy.length) {
    html+=`<div class="detail-label">Used By (${importedBy.length})</div>`;
    html+=importedBy.slice(0,12).map(n=>
      `<span class="detail-chip" onclick="selectNode(nodes.find(x=>x.id==='${n.id}'));render()" title="${n.path}">${n.label}</span>`
    ).join('');
    if(importedBy.length>12) html+=`<span style="font-size:10px;color:var(--vscode-descriptionForeground)"> +${importedBy.length-12} more</span>`;
  }

  if (node.exports?.length) {
    html+=`<div class="detail-label">Exports</div>`;
    html+=node.exports.map(e=>`<span class="detail-chip" style="cursor:default">${e}</span>`).join('');
  }

  html+=`<button class="btn btn-secondary open-file-btn" onclick="openFileHandler('${JSON.stringify(node.path).slice(1,-1)}')">📂 Open File</button>`;

  document.getElementById('node-detail-body').innerHTML=html;
  render();
}

function closeNodeDetail() {
  document.getElementById('node-detail').classList.remove('open');
  selectedNode=null;
  render();
}

/* ── Graph search ──────────────────────────────────────────────────── */
function graphSearch(val) {
  searchTerm=val.toLowerCase().trim();
  render();
}

/* ══════════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════════ */
function showSummary(s, name) {
  document.getElementById('summary-empty').style.display='none';
  document.getElementById('summary-ready').style.display='block';
  document.getElementById('s-name').textContent=name;
  document.getElementById('s-overview').textContent=s.overview||'';
  document.getElementById('s-arch').textContent=s.architecture||'';
  document.getElementById('s-tech').innerHTML=(s.techStack||[]).map(t=>`<span class="chip">${t}</span>`).join('');
  document.getElementById('s-modules').innerHTML=(s.keyModules||[]).map(m=>
    `<div class="card"><div class="card-title">${m.name}</div><div class="card-body">${m.description}</div></div>`
  ).join('');
  document.getElementById('s-entries').innerHTML=(s.entryPoints||[]).map(p=>
    `<div style="padding:2px 0;cursor:pointer;color:#569cd6" onclick="openFileHandler('${JSON.stringify(p).slice(1,-1)}')">${p}</div>`
  ).join('')||'<span style="color:var(--vscode-descriptionForeground)">None detected</span>';
}

function showFileSummaries(files) {
  document.getElementById('s-file-count').textContent='('+files.length+')';
  // Store for node detail panel
  files.forEach(f=>{ fileSummaryMap[f.path]=f; });
  document.getElementById('s-files').innerHTML=files.map(f=>`
    <div class="file-card" onclick="openFileHandler('${JSON.stringify(f.path).slice(1,-1)}')">
      <div class="file-card-path">${f.path}</div>
      <div class="file-card-desc">${f.purpose}</div>
      ${f.exports?'<div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px">Exports: '+f.exports+'</div>':''}
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════════════════
   Q&A
══════════════════════════════════════════════════════════ */
function enableQA() {
  document.getElementById('qa-empty').style.display='none';
  document.getElementById('qa-ready').style.display='flex';
}
function askQuick(q){ document.getElementById('chat-input').value=q; sendQ(); }
function chatKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendQ();} }
function sendQ(){
  const inp=document.getElementById('chat-input');
  const q=inp.value.trim(); if(!q) return;
  inp.value='';
  addMsg('user',q);
  addThinking();
  vscode.postMessage({type:'askQuestion',payload:{question:q}});
}
function addMsg(role,txt){
  const h=document.getElementById('chat-history');
  const d=document.createElement('div');
  d.className='chat-msg';
  d.innerHTML=`<div class="av av-${role}">${role==='user'?'U':'AI'}</div>
    <div class="bubble ${role==='user'?'user':''}">${esc(txt)}</div>`;
  h.appendChild(d); h.scrollTop=h.scrollHeight;
}
function addThinking(){
  const h=document.getElementById('chat-history');
  const d=document.createElement('div');
  d.id='thinking-msg'; d.className='chat-msg';
  d.innerHTML='<div class="av av-ai">AI</div><div class="bubble"><div class="thinking-dots"><span></span><span></span><span></span></div></div>';
  h.appendChild(d); h.scrollTop=h.scrollHeight;
}
function removeThinking(){ document.getElementById('thinking-msg')?.remove(); }
function esc(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

/* ══════════════════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════════════════ */
function selProv(name){
  document.querySelectorAll('.provider-card').forEach(c=>c.classList.remove('selected'));
  document.querySelectorAll('.provider-fields').forEach(f=>f.classList.remove('open'));
  document.getElementById('pc-'+name).classList.add('selected');
  document.getElementById('pf-'+name).classList.add('open');
  console.log('[REPOGRAPH] Provider selected:', name);
}
function saveProv(name){
  console.log('[REPOGRAPH] saveProv clicked for provider:', name);
  const p={name};
  const k=document.getElementById('key-'+name); 
  if(k) { p.apiKey=k.value.trim(); console.log('[REPOGRAPH] API key collected'); }
  const m=document.getElementById('model-'+name); 
  if(m) { p.model=m.value; console.log('[REPOGRAPH] Model:', p.model); }
  const b=document.getElementById('baseurl-'+name); 
  if(b) { p.baseUrl=b.value.trim(); console.log('[REPOGRAPH] Base URL:', p.baseUrl); }
  if (!vscode) { console.error('[REPOGRAPH] vscode not available'); return; }
  console.log('[REPOGRAPH] Sending saveProvider message:', p);
  vscode.postMessage({type:'saveProvider',payload:p});
}

/* ══════════════════════════════════════════════════════════
   ALERTS
══════════════════════════════════════════════════════════ */
function showAlert(scr,msg,type){ const el=document.getElementById(scr+'-alert'); if(el) el.innerHTML=`<div class="alert alert-${type}">${msg}</div>`; }
function clearAlert(scr){ const el=document.getElementById(scr+'-alert'); if(el) el.innerHTML=''; }

/* ══════════════════════════════════════════════════════════
   MESSAGE HANDLER
══════════════════════════════════════════════════════════ */
let _summary=null, _repoName='';

window.addEventListener('message',e=>{
  const {type,payload}=e.data;
  console.log('[REPOGRAPH] Message received from extension:', type, payload);
  const stepPct={1:15,2:40,3:65,4:85};

  switch(type){
    case 'workspaceStatus':
      console.log('[REPOGRAPH] Workspace status:', payload);
      if(payload.hasWorkspace){
        document.getElementById('ws-name').textContent='📁 '+payload.name;
        document.getElementById('ws-sub').textContent='Ready to analyze. Click the button below.';
      }
      break;

    case 'progress':
      console.log('[REPOGRAPH] Progress update:', payload);
      setProgress(payload.step, stepPct[payload.step]||10, payload.message);
      break;

    case 'graphReady':
      console.log('[REPOGRAPH] Graph ready');
      setProgress(2,40,'Graph built!');
      initGraph(payload);
      break;

    case 'summaryReady':
      console.log('[REPOGRAPH] Summary ready');
      _summary=payload;
      setProgress(3,65,'Summary generated!');
      break;

    case 'fileSummariesReady':
      console.log('[REPOGRAPH] File summaries ready');
      setProgress(4,88,'File summaries done!');
      showFileSummaries(payload);
      break;

    case 'analysisComplete':
      console.log('[REPOGRAPH] Analysis complete');
      _repoName=payload.repoName;
      setProgress(4,100,'Analysis complete!');
      setAnalyzing(false);
      if(_summary) showSummary(_summary,_repoName);
      enableQA();
      showAlert('analyze','✓ Done! Open Graph, Summary and Q&A tabs.','success');
      break;

    case 'answer':
      console.log('[REPOGRAPH] Answer received');
      removeThinking();
      addMsg('ai',payload.answer);
      break;

    case 'providerSaved':
      showAlert('settings','✓ Provider saved: '+payload.name,'success');
      break;

    case 'settingsLoaded':
      if(payload.providerName){
        selProv(payload.providerName);
        if(payload.hasKey){
          const k=document.getElementById('key-'+payload.providerName);
          if(k) k.placeholder='(saved) — paste to update';
        }
        if(payload.model){
          const m=document.getElementById('model-'+payload.providerName);
          if(m) m.value=payload.model;
        }
      }
      break;

    case 'error':
      setAnalyzing(false);
      showAlert('analyze','✗ '+payload.message,'error');
      showAlert('settings','✗ '+payload.message,'error');
      break;
  }
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
window.addEventListener('load', () => {
  console.log('[REPOGRAPH] Page loaded, vscode available:', !!vscode);
  if (!vscode) { console.error('[REPOGRAPH] vscode not available at page load'); return; }
  console.log('[REPOGRAPH] Requesting settings from extension');
  vscode.postMessage({type:'getSettings'});
});
