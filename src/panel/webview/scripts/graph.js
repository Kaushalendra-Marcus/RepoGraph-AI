/* graph.js — canvas dependency graph renderer */

let canvas, ctx, canvasWrap;
let nodes = [], edges = [];
let cam = { x: 0, y: 0, scale: 1 };
let dragging = false, dragNode = null, lastMouse = { x: 0, y: 0 };
let selectedNode = null;
let graphBuilt = false;
let searchTerm = '';
let pointerState = { down: false, moved: false, startX: 0, startY: 0, node: null };
let _layoutTimer = null;
let _needsFit = false;

// ── 2D/3D view state ──────────────────────────────────────────────────────
// Same nodes, same edges, same sizes in both modes — 3D only adds depth (z)
// and a rotation camera on top of the exact same layout.
let splitGroups = true; // false when groups connect: one shared pool, full springs
let graphMode = '2d'; // '2d' | '3d'
let rot = { x: 0.5, y: -0.65 };
let centroid = { x: 0, y: 0, z: 0 };
const FOCAL = 900;

const GROUP_COLORS = [
  '#569cd6','#4ec9b0','#c586c0','#dcdcaa','#d7ba7d',
  '#ce9178','#9cdcfe','#4fc1ff','#f48771','#b5cea8','#646695'
];
const groupColorMap = {};

// ── Init ──────────────────────────────────────────────────────────────────

function initGraph(data) {
  graphBuilt = true;
  document.getElementById('graph-empty').style.display = 'none';
  document.getElementById('graph-wrap').style.display  = 'flex';

  canvas     = document.getElementById('graph-canvas');
  ctx        = canvas.getContext('2d');
  canvasWrap = document.getElementById('graph-canvas-wrap');

  const groups = [...new Set(data.nodes.map(n => n.group))];
  groups.forEach((g, i) => { groupColorMap[g] = GROUP_COLORS[i % GROUP_COLORS.length]; });

  const legEl = document.getElementById('graph-legend');
  legEl.innerHTML = groups.slice(0, 6).map(g =>
    `<div class="legend-item"><div class="legend-dot" style="background:${groupColorMap[g]}"></div>${escHtml(g)}</div>`
  ).join('');

  // Pick top 120 most-connected nodes for display
  const ranked = [...data.nodes].sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree));
  const seed   = ranked.slice(0, 60);
  const ids    = new Set(seed.map(n => n.id));

  let expanded = true;
  while (expanded && ids.size < 120) {
    expanded = false;
    for (const e of data.edges) {
      if (ids.size >= 120) break;
      if (ids.has(e.source) && !ids.has(e.target)) { ids.add(e.target); expanded = true; }
      else if (ids.has(e.target) && !ids.has(e.source)) { ids.add(e.source); expanded = true; }
    }
  }

  const topNodes = ranked.filter(n => ids.has(n.id)).slice(0, 120);
  nodes = topNodes.map((n) => ({
    ...n,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0,
    // Same size logic as before: hub files render bigger (14–28px).
    r: Math.max(14, Math.min(28, 14 + n.inDegree * 2.5)),
    color: groupColorMap[n.group] || GROUP_COLORS[0],
  }));

  edges = data.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  document.getElementById('graph-stats').textContent =
    topNodes.length + ' files · ' + edges.length + ' imports';

  // Components get their own cells so disconnected groups never pile up.
  layoutByComponents();
  for (let i = 0; i < 260; i++) tickForce();
  separateComponents();
  assignDepth();
  updateCentroid();

  setupCanvasEvents();
  // The Graph tab is often hidden when analysis finishes → wrap has 0 size.
  // If resize fails now, refreshGraphView() (called on tab switch) fixes it.
  _needsFit = !resizeCanvas();
  fitView();
  render();
}

// Called whenever the Graph tab becomes visible. Fixes the classic
// "tiny graph in a corner" bug caused by measuring a hidden canvas.
function refreshGraphView() {
  if (!graphBuilt || !canvas || !canvasWrap) return;
  if (!resizeCanvas()) {
    // Still hidden — retry shortly (tab transition / layout race)
    clearTimeout(refreshGraphView._t);
    refreshGraphView._t = setTimeout(refreshGraphView, 120);
    return;
  }
  fitView();
  render();
}

// ── Component-separated layout ────────────────────────────────────────────
// Every connected component gets its own grid cell, so disconnected groups
// never pile on top of each other. Isolated files share one tidy grid block.

function hashStr(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function computeComponents() {
  const parent = new Map(nodes.map(n => [n.id, n.id]));
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    let c = x;
    while (parent.get(c) !== r) { const nxt = parent.get(c); parent.set(c, r); c = nxt; }
    return r;
  };
  const ids = new Set(nodes.map(n => n.id));
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const ra = find(e.source), rb = find(e.target);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const n of nodes) {
    const r = find(n.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(n);
  }
  return [...groups.values()];
}

function layoutByComponents() {
  // Groups (Backend / Frontend / ...) get separate cells ONLY when nothing
  // connects them. Connected groups share one pool so real links stay short.
  const inGroup = new Map(nodes.map(n => [n.id, n.group || "root"]));
  const ids0 = new Set(nodes.map(n => n.id));
  const hasCross = edges.some(e =>
    ids0.has(e.source) && ids0.has(e.target) &&
    inGroup.get(e.source) !== inGroup.get(e.target));
  const gkey = (n) => (hasCross ? "all" : (n.group || "root"));
  splitGroups = !hasCross;

  const byGroup = new Map();
  for (const n of nodes) {
    const g = gkey(n);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(n);
  }
  const groupOrder = [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length);

  const parent = new Map(nodes.map(n => [n.id, n.id]));
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    let c = x;
    while (parent.get(c) !== r) { const nxt = parent.get(c); parent.set(c, r); c = nxt; }
    return r;
  };
  const idsSet = new Set(nodes.map(n => n.id));
  const grpOf = (id) => gkey({ id, group: inGroup.get(id) });
  for (const e of edges) {
    if (!idsSet.has(e.source) || !idsSet.has(e.target)) continue;
    if (grpOf(e.source) !== grpOf(e.target)) continue; // cross-group: drawn, not grouped
    const ra = find(e.source), rb = find(e.target);
    if (ra !== rb) parent.set(ra, rb);
  }

  // Cells: one per (group, component); isolates share a grid cell per group.
  const cells = []; // { nodes: [], iso: bool }
  groupOrder.forEach(([g, list]) => {
    const buckets = new Map();
    for (const n of list) {
      const r = find(n.id);
      if (!buckets.has(r)) buckets.set(r, []);
      buckets.get(r).push(n);
    }
    const hasEdge = (n) => edges.some(e => e.source === n.id || e.target === n.id);
    const solo = [];
    for (const b of buckets.values()) {
      if (b.length > 1 || hasEdge(b[0])) cells.push({ nodes: b, iso: false, group: g });
      else solo.push(...b);
    }
    if (solo.length) cells.push({ nodes: solo, iso: true, group: g });
  });

  const MARGIN = 170;
  const cellFor = (cell) => {
    if (cell.iso) {
      const perRow = Math.ceil(Math.sqrt(cell.nodes.length));
      return Math.max(280, perRow * 82 + MARGIN);
    }
    return Math.max(300, Math.sqrt(cell.nodes.length) * 100 + MARGIN);
  };
  const cols = Math.max(1, Math.ceil(Math.sqrt(cells.length)));
  const cell = Math.max(...cells.map(cellFor));

  cells.forEach((c, idx) => {
    const row = Math.floor(idx / cols), col = idx % cols;
    const cx = col * cell, cy = row * cell;
    if (c.iso) {
      const perRow = Math.ceil(Math.sqrt(c.nodes.length));
      const rows = Math.ceil(c.nodes.length / perRow);
      c.nodes.forEach((n, i) => {
        n._comp = idx;
        n.x = cx + (i % perRow) * 82 - ((perRow - 1) * 82) / 2;
        n.y = cy + Math.floor(i / perRow) * 82 - ((rows - 1) * 82) / 2;
        n.vx = 0; n.vy = 0;
      });
    } else {
      c.nodes.forEach((n, i) => {
        n._comp = idx;
        const angle = (i / c.nodes.length) * Math.PI * 2 + (hashStr(n.id) % 10) / 10;
        const rad = Math.min(cell / 2 - 60, 55 + Math.sqrt(c.nodes.length) * 26);
        n.x = cx + Math.cos(angle) * rad + ((hashStr(n.id) % 44) - 22);
        n.y = cy + Math.sin(angle) * rad + ((hashStr('y' + n.id) % 44) - 22);
        n.vx = 0; n.vy = 0;
      });
    }
  });

  // Recenter the whole grid on the origin so orbit/fit math stays centered.
  let sx = 0, sy = 0;
  nodes.forEach(n => { sx += n.x; sy += n.y; });
  const ox = nodes.length ? sx / nodes.length : 0, oy = nodes.length ? sy / nodes.length : 0;
  nodes.forEach(n => { n.x -= ox; n.y -= oy; });
}

// Push overlapping component bounding boxes apart (guaranteed separation).
function separateComponents() {
  const boxes = new Map(); // comp -> {minX..}
  const padFor = (n) => n.r + 26; // node radius + label room
  for (const n of nodes) {
    const c = n._comp ?? 0, p = padFor(n);
    if (!boxes.has(c)) boxes.set(c, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, members: [] });
    const b = boxes.get(c);
    b.minX = Math.min(b.minX, n.x - p); b.maxX = Math.max(b.maxX, n.x + p);
    b.minY = Math.min(b.minY, n.y - p); b.maxY = Math.max(b.maxY, n.y + p);
    b.members.push(n);
  }
  const list = [...boxes.values()];
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const dir = ((a.minX + a.maxX) / 2 <= (b.minX + b.maxX) / 2) ? -1 : 1;
          const sh = ox / 2 + 4;
          a.members.forEach(n => { n.x += dir * sh; });
          b.members.forEach(n => { n.x -= dir * sh; });
          a.minX += dir * sh; a.maxX += dir * sh;
          b.minX -= dir * sh; b.maxX -= dir * sh;
        } else {
          const dir = ((a.minY + a.maxY) / 2 <= (b.minY + b.maxY) / 2) ? -1 : 1;
          const sh = oy / 2 + 4;
          a.members.forEach(n => { n.y += dir * sh; });
          b.members.forEach(n => { n.y -= dir * sh; });
          a.minY += dir * sh; a.maxY += dir * sh;
          b.minY -= dir * sh; b.maxY -= dir * sh;
        }
      }
    }
    if (!moved) break;
  }
}

// Depth per node: component layer + deterministic jitter (stable across renders).
// Used only before the first 3D entry; sphere mode overwrites x/y/z.
function assignDepth() {
  for (const n of nodes) {
    const layer = (((n._comp ?? 0) % 5) - 2) * 48;
    const jit = (hashStr('z' + n.id) % 56) - 28;
    n.z = layer + jit;
  }
}

// ── Sphere layout (3D mode) ───────────────────────────────────────────────
// Every node sits ON a sphere surface (Fibonacci lattice — even spread, no
// pole clumping). Edges are straight chords, like 2D. Same nodes, same
// edges, same sizes — only positions change, and 2D coords are stashed so
// toggling back restores the exact flat layout.
let sphereR = 300;

function layoutSphere() {
  for (const n of nodes) {
    if (n._x2d === undefined) { n._x2d = n.x; n._y2d = n.y; }
  }
  sphereR = Math.max(300, Math.sqrt(nodes.length) * 46);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const ordered = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  ordered.forEach((n, i) => {
    const y = ordered.length > 1 ? 1 - (i / (ordered.length - 1)) * 2 : 0;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    n.x = Math.cos(th) * rad * sphereR;
    n.y = y * sphereR;
    n.z = Math.sin(th) * rad * sphereR;
    n.vx = 0; n.vy = 0;
  });
  updateCentroid();
}

function restore2D() {
  for (const n of nodes) {
    if (n._x2d !== undefined) { n.x = n._x2d; n.y = n._y2d; }
  }
  updateCentroid();
}

// Keep a dragged node glued to the sphere surface.
function glueToSphere(n) {
  const dx = n.x - centroid.x, dy = n.y - centroid.y, dz = (n.z || 0) - centroid.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 1) return;
  const k = sphereR / d;
  n.x = centroid.x + dx * k;
  n.y = centroid.y + dy * k;
  n.z = centroid.z + dz * k;
}

function updateCentroid() {
  if (!nodes.length) { centroid = { x: 0, y: 0, z: 0 }; return; }
  let sx = 0, sy = 0, sz = 0;
  for (const n of nodes) { sx += n.x; sy += n.y; sz += (n.z || 0); }
  centroid = { x: sx / nodes.length, y: sy / nodes.length, z: sz / nodes.length };
}

// ── Force layout ──────────────────────────────────────────────────────────

function tickForce() {
  const repK = 1800, attrK = 0.06, idealLen = 120;
  // NOTE: no center gravity — components are pre-placed in grid cells and
  // must stay separated. fitView() recenters the camera instead.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = Math.max(dx * dx + dy * dy, 1);
      const dist = Math.sqrt(distSq);
      const f = repK / distSq;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
  }
  const nm = new Map(nodes.map(n => [n.id, n]));
  for (const e of edges) {
    const a = nm.get(e.source), b = nm.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    let f = (dist - idealLen) / dist * attrK;
    // Split groups: cross links pull weakly so Backend/Frontend stay apart.
    // Connected groups: full strength, no artificial separation.
    if (splitGroups && (a.group || "root") !== (b.group || "root")) f *= 0.22;
    a.vx += dx * f; a.vy += dy * f;
    b.vx -= dx * f; b.vy -= dy * f;
  }
  for (const n of nodes) {
    n.x += n.vx * 0.5;    n.y += n.vy * 0.5;
    n.vx *= 0.72;          n.vy *= 0.72;
  }
}

// ── Canvas events ─────────────────────────────────────────────────────────

function setupCanvasEvents() {
  canvas.onwheel = e => {
    e.preventDefault();
    const f    = e.deltaY < 0 ? 1.12 : 0.89;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    cam.x = mx - (mx - cam.x) * f;
    cam.y = my - (my - cam.y) * f;
    cam.scale = Math.max(0.15, Math.min(5, cam.scale * f));
    render();
  };

  canvas.onmousedown = e => {
    const hit = hitNodeAt(e.offsetX, e.offsetY);
    pointerState = { down: true, moved: false, startX: e.clientX, startY: e.clientY, node: hit, button: e.button, shift: e.shiftKey };
    dragNode = hit;
    // 3D: background drag rotates; shift/middle-drag pans. 2D: drag pans.
    dragging = !hit;
    lastMouse = { x: e.clientX, y: e.clientY };
    canvas.classList.toggle('grabbing', dragging);
  };

  canvas.onmouseup = e => {
    const dist = Math.hypot(e.clientX - pointerState.startX, e.clientY - pointerState.startY);
    if (pointerState.down && !pointerState.moved && pointerState.node && dist < 5)
      selectNode(pointerState.node);
    else if (pointerState.down && !pointerState.moved && !pointerState.node && dist < 5)
      { selectedNode = null; closeNodeDetail(); }
    dragging = false; dragNode = null; pointerState.down = false;
    canvas.classList.remove('grabbing');
    render();
  };

  canvas.onmousemove = e => {
    if (pointerState.down && Math.hypot(e.clientX - pointerState.startX, e.clientY - pointerState.startY) > 4)
      pointerState.moved = true;
    if (dragging) {
      const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y;
      if (graphMode === '3d' && !(pointerState.shift || pointerState.button === 1)) {
        // Rotate the camera around the graph centroid.
        rot.y += dx * 0.006;
        rot.x = Math.max(-1.45, Math.min(1.45, rot.x + dy * 0.006));
      } else {
        cam.x += dx;
        cam.y += dy;
      }
      lastMouse = { x: e.clientX, y: e.clientY };
      render();
    } else if (dragNode) {
      if (graphMode === '3d') {
        // Move in the screen plane at the node's own depth, then glue back
        // onto the sphere so the globe never dents.
        const p = project3(dragNode);
        const k = 1 / Math.max(0.15, cam.scale * p.s);
        dragNode.x += (e.clientX - lastMouse.x) * k;
        dragNode.y += (e.clientY - lastMouse.y) * k;
        glueToSphere(dragNode);
      } else {
        const dx = (e.clientX - lastMouse.x) / cam.scale;
        const dy = (e.clientY - lastMouse.y) / cam.scale;
        dragNode.x += dx; dragNode.y += dy;
      }
      dragNode.vx = 0;  dragNode.vy = 0;
      lastMouse = { x: e.clientX, y: e.clientY };
      render(); scheduleSaveLayout();
    } else {
      canvas.style.cursor = hitNodeAt(e.offsetX, e.offsetY) ? 'pointer' : 'grab';
    }
  };

  canvas.ondblclick = e => {
    const hit = hitNodeAt(e.offsetX, e.offsetY);
    if (hit) postMsg({ type: 'openFile', payload: { path: hit.path } });
  };

  window.addEventListener('resize', () => { resizeCanvas(); render(); });
}

function s2g(sx, sy) {
  return { gx: (sx - cam.x) / cam.scale, gy: (sy - cam.y) / cam.scale };
}

// ── 3D projection ─────────────────────────────────────────────────────────
// Rotates layout coords around the centroid (Y then X), then applies a
// perspective divide. Same x/y/z data as 2D — only the camera differs.

function project3(n) {
  const dx = n.x - centroid.x, dy = n.y - centroid.y, dz = (n.z || 0) - centroid.z;
  const cy = Math.cos(rot.y), sy = Math.sin(rot.y);
  const x1 = dx * cy + dz * sy, z1 = -dx * sy + dz * cy;
  const cx = Math.cos(rot.x), sx = Math.sin(rot.x);
  const y1 = dy * cx - z1 * sx, z2 = dy * sx + z1 * cx;
  const s = FOCAL / Math.max(120, FOCAL + z2);
  return { x: cam.x + x1 * cam.scale * s, y: cam.y + y1 * cam.scale * s, s, z: z2 };
}

// Nearest projected node under the cursor (nearest depth wins ties).
function hitNodeAt(sx, sy) {
  if (graphMode === '3d') {
    let best = null, bestZ = Infinity;
    for (const n of nodes) {
      const p = project3(n);
      n._p = p;
      if (Math.hypot(p.x - sx, p.y - sy) < Math.max(6, n.r * p.s + 3)) {
        if (p.z < bestZ) { bestZ = p.z; best = n; }
      }
    }
    return best;
  }
  const { gx, gy } = s2g(sx, sy);
  return nodes.find(n => Math.hypot(n.x - gx, n.y - gy) < n.r + 2) || null;
}

function toggleGraphMode() {
  if (!graphBuilt) return;
  graphMode = graphMode === '2d' ? '3d' : '2d';
  const btn = document.getElementById('mode-toggle-btn');
  if (btn) {
    btn.textContent = graphMode === '2d' ? '3D' : '2D';
    btn.title = graphMode === '2d' ? 'Switch to 3D sphere view' : 'Switch to 2D view';
    btn.classList.toggle('active', graphMode === '3d');
  }
  if (graphMode === '3d') layoutSphere();
  else restore2D();
  fitView();
  render();
}

function resizeCanvas() {
  if (!canvas || !canvasWrap) return false;
  const rect = canvasWrap.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  canvas.width = rect.width; canvas.height = rect.height;
  canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
  return true;
}

function fitView() {
  if (!nodes.length || !canvas) return;
  if (graphMode === '3d') {
    for (const n of nodes) n._p = project3(n);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const pr = Math.max(2.5, n.r * n._p.s) + 22;
      minX = Math.min(minX, n._p.x - pr); maxX = Math.max(maxX, n._p.x + pr);
      minY = Math.min(minY, n._p.y - pr); maxY = Math.max(maxY, n._p.y + pr);
    }
    const pad = 40, W = canvas.width - pad * 2, H = canvas.height - pad * 2;
    // Projected coords already include cam — fit by adjusting scale only,
    // then recenter the centroid on screen.
    const gW = maxX - minX || 1, gH = maxY - minY || 1;
    const f = Math.max(0.15, Math.min(2.5, Math.min(W / gW, H / gH)));
    cam.scale = Math.max(0.15, Math.min(5, cam.scale * f));
    for (const n of nodes) n._p = project3(n);
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    for (const n of nodes) {
      const pr = Math.max(2.5, n.r * n._p.s) + 22;
      minX = Math.min(minX, n._p.x - pr); maxX = Math.max(maxX, n._p.x + pr);
      minY = Math.min(minY, n._p.y - pr); maxY = Math.max(maxY, n._p.y + pr);
    }
    cam.x += (canvas.width / 2 - (minX + maxX) / 2);
    cam.y += (canvas.height / 2 - (minY + maxY) / 2);
    render();
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r); maxX = Math.max(maxX, n.x + n.r);
    minY = Math.min(minY, n.y - n.r); maxY = Math.max(maxY, n.y + n.r);
  }
  const pad = 40, W = canvas.width - pad * 2, H = canvas.height - pad * 2;
  const gW = maxX - minX || 1, gH = maxY - minY || 1;
  cam.scale = Math.max(0.15, Math.min(2.5, Math.min(W / gW, H / gH)));
  cam.x = pad - minX * cam.scale;
  cam.y = pad - minY * cam.scale;
  render();
}

function zoom(f) { cam.scale = Math.max(0.15, Math.min(5, cam.scale * f)); render(); }
function resetView() { fitView(); }

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  if (graphMode === '3d') { render3D(); return; }
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.scale, cam.scale);

  const nm = new Map(nodes.map(n => [n.id, n]));
  const sid = selectedNode?.id;
  const connIds = new Set();
  if (sid) edges.forEach(e => {
    if (e.source === sid) connIds.add(e.target);
    if (e.target === sid) connIds.add(e.source);
  });

  // Draw edges
  for (const e of edges) {
    const a = nm.get(e.source), b = nm.get(e.target);
    if (!a || !b) continue;
    if (searchTerm && !a.label.toLowerCase().includes(searchTerm) &&
        !b.label.toLowerCase().includes(searchTerm)) continue;
    const isRelated = sid && (e.source === sid || e.target === sid);
    const dimmed    = sid && !isRelated;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;
    const sx = a.x + (dx / dist) * a.r, sy = a.y + (dy / dist) * a.r;
    const ex = b.x - (dx / dist) * (b.r + 7), ey = b.y - (dy / dist) * (b.r + 7);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
    ctx.strokeStyle = isRelated && e.source === sid ? 'rgba(86,156,214,0.85)'
      : isRelated ? 'rgba(78,201,214,0.7)'
      : dimmed    ? 'rgba(255,255,255,0.04)'
      :               'rgba(255,255,255,0.12)';
    ctx.lineWidth = isRelated ? 1.8 : dimmed ? 0.5 : 0.8;
    ctx.stroke();
    if (!dimmed) drawArrowHead(ex, ey, sx, sy, isRelated);
  }

  // Draw nodes
  for (const n of nodes) {
    const isSel = n.id === sid, isConn = connIds.has(n.id);
    const dimmed = sid && !isSel && !isConn;
    ctx.globalAlpha = searchTerm && !n.label.toLowerCase().includes(searchTerm) ? 0.15 : dimmed ? 0.25 : 1;
    ctx.shadowColor = isSel ? n.color : isConn ? n.color : '';
    ctx.shadowBlur  = isSel ? 16 : isConn ? 6 : 0;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? n.color : n.color + '55'; ctx.fill();
    ctx.strokeStyle = n.color; ctx.lineWidth = isSel ? 2 : isConn ? 1.5 : 0.8; ctx.stroke();
    ctx.shadowBlur = 0;
    if (cam.scale > 0.45 || isSel || isConn) {
      const fs = Math.max(8, Math.min(11, 9 / cam.scale));
      ctx.font = `${isSel || isConn ? 600 : 400} ${fs}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isSel ? '#fff' : isConn ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)';
      let lbl = n.label; if (lbl.length > 16) lbl = lbl.slice(0, 14) + '…';
      ctx.fillText(lbl, n.x, n.y + n.r + fs + 2);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// 3D: same nodes, same edges, same base sizes — projected with perspective.
// Far nodes render first (painter's algorithm), shrink and fade with depth.
function render3D() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const nm = new Map(nodes.map(n => [n.id, n]));
  const sid = selectedNode?.id;
  const connIds = new Set();
  if (sid) edges.forEach(e => {
    if (e.source === sid) connIds.add(e.target);
    if (e.target === sid) connIds.add(e.source);
  });

  for (const n of nodes) n._p = project3(n);

  // Draw edges (far first for correct overlap)
  const sortedEdges = [...edges].sort((a, b) => {
    const pa = nm.get(a.source)?._p, pb = nm.get(a.target)?._p;
    const pc = nm.get(b.source)?._p, pd = nm.get(b.target)?._p;
    if (!pa || !pb || !pc || !pd) return 0;
    return ((pc.z + pd.z) / 2) - ((pa.z + pb.z) / 2);
  });
  for (const e of sortedEdges) {
    const a = nm.get(e.source), b = nm.get(e.target);
    if (!a || !b || !a._p || !b._p) continue;
    if (searchTerm && !a.label.toLowerCase().includes(searchTerm) &&
        !b.label.toLowerCase().includes(searchTerm)) continue;
    const isRelated = sid && (e.source === sid || e.target === sid);
    const dimmed    = sid && !isRelated;
    const depthS = (a._p.s + b._p.s) / 2;
    const dx = b._p.x - a._p.x, dy = b._p.y - a._p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;
    const ra = Math.max(2, a.r * a._p.s), rb = Math.max(2, b.r * b._p.s);
    const sx = a._p.x + (dx / dist) * ra, sy = a._p.y + (dy / dist) * ra;
    const ex = b._p.x - (dx / dist) * (rb + 6), ey = b._p.y - (dy / dist) * (rb + 6);
    const alpha = dimmed ? 0.04 : (0.06 + 0.10 * Math.min(1.2, depthS));
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
    ctx.strokeStyle = isRelated && e.source === sid ? 'rgba(86,156,214,0.9)'
      : isRelated ? 'rgba(78,201,214,0.75)'
      : `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.lineWidth = isRelated ? 1.8 : 0.8;
    ctx.stroke();
    if (!dimmed) drawArrowHead(ex, ey, sx, sy, isRelated);
  }

  // Draw nodes far → near
  const sorted = [...nodes].sort((a, b) => (b._p?.z ?? 0) - (a._p?.z ?? 0));
  for (const n of sorted) {
    const p = n._p;
    const pr = Math.max(2.5, n.r * p.s);
    const depthFade = 0.35 + 0.65 * Math.min(1.2, p.s) / 1.2;
    const isSel = n.id === sid, isConn = connIds.has(n.id);
    const dimmed = sid && !isSel && !isConn;
    ctx.globalAlpha = (searchTerm && !n.label.toLowerCase().includes(searchTerm) ? 0.15 : dimmed ? 0.25 : 1) * (isSel || isConn ? 1 : depthFade);
    ctx.shadowColor = isSel ? n.color : isConn ? n.color : '';
    ctx.shadowBlur  = isSel ? 16 : isConn ? 6 : 0;
    ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? n.color : n.color + '55'; ctx.fill();
    ctx.strokeStyle = n.color; ctx.lineWidth = isSel ? 2 : isConn ? 1.5 : 0.8; ctx.stroke();
    ctx.shadowBlur = 0;
    if ((cam.scale * p.s > 0.45 || isSel || isConn) && pr > 4) {
      const fs = Math.max(8, Math.min(11, 9 / (cam.scale * p.s)));
      ctx.font = `${isSel || isConn ? 600 : 400} ${fs}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isSel ? '#fff' : isConn ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)';
      let lbl = n.label; if (lbl.length > 16) lbl = lbl.slice(0, 14) + '…';
      ctx.fillText(lbl, p.x, p.y + pr + fs + 2);
    }
    ctx.globalAlpha = 1;
  }

  // Hint (first visit only)
  if (!render3D._hintShown) {
    render3D._hintShown = true;
    ctx.font = `400 11px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('Sphere view: drag to rotate · shift-drag to pan · scroll to zoom · click node for details', 12, 18);
  }
}

function drawArrowHead(ex, ey, fromX, fromY, highlighted) {
  const len = 8, angle = 0.45;
  const ang = Math.atan2(ey - fromY, ex - fromX);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - len * Math.cos(ang - angle), ey - len * Math.sin(ang - angle));
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - len * Math.cos(ang + angle), ey - len * Math.sin(ang + angle));
  ctx.strokeStyle = highlighted ? 'rgba(86,156,214,0.85)' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = highlighted ? 1.8 : 0.8;
  ctx.stroke();
}

// ── Node selection ────────────────────────────────────────────────────────

function selectNode(node) {
  selectedNode = node;
  const detail = document.getElementById('node-detail');
  detail.classList.add('open');
  document.getElementById('node-detail-filename').textContent = node.label;

  const nm = new Map(nodes.map(n => [n.id, n]));
  const importing  = edges.filter(e => e.source === node.id).map(e => nm.get(e.target)).filter(Boolean);
  const importedBy = edges.filter(e => e.target === node.id).map(e => nm.get(e.source)).filter(Boolean);

  let html = `<div style="font-family:monospace;font-size:10px;color:var(--vscode-descriptionForeground);word-break:break-all;margin-bottom:6px">${escHtml(node.path)}</div>`;
  html += `<div style="display:flex;gap:10px;margin-bottom:8px;font-size:11px;color:var(--vscode-descriptionForeground)">
    <span>imports <b>${importing.length}</b></span>
    <span>used by <b>${importedBy.length}</b></span>
    <span>${escHtml(node.language)}</span>
  </div>`;

  if (window.fileSummaryMap && fileSummaryMap[node.path]) {
    const s = fileSummaryMap[node.path];
    html += `<div class="detail-label">Purpose</div><div style="font-size:11px;line-height:1.6">${escHtml(s.purpose)}</div>`;
  }
  if (importing.length) {
    html += `<div class="detail-label">Imports (${importing.length})</div>`;
    html += importing.slice(0, 12).map(n =>
      `<span class="detail-chip" data-nid="${escAttr(n.id)}">${escHtml(n.label)}</span>`
    ).join('');
  }
  if (importedBy.length) {
    html += `<div class="detail-label">Used By (${importedBy.length})</div>`;
    html += importedBy.slice(0, 12).map(n =>
      `<span class="detail-chip" data-nid="${escAttr(n.id)}">${escHtml(n.label)}</span>`
    ).join('');
  }
  if (node.exports?.length) {
    html += `<div class="detail-label">Exports</div>`;
    html += node.exports.map(e => `<span class="detail-chip" style="cursor:default">${escHtml(e)}</span>`).join('');
  }
  html += `<button class="btn btn-secondary open-file-btn" style="margin-top:10px;width:100%;justify-content:center" data-fpath="${escAttr(node.path)}">Open File</button>`;

  const body = document.getElementById('node-detail-body');
  body.innerHTML = html;
  body.querySelectorAll('.detail-chip[data-nid]').forEach(el => {
    el.addEventListener('click', () => {
      const t = nodes.find(x => x.id === el.dataset.nid);
      if (t) { selectNode(t); render(); }
    });
  });
  body.querySelector('.open-file-btn')?.addEventListener('click', function() {
    postMsg({ type: 'openFile', payload: { path: this.dataset.fpath } });
  });
  render();
}

function closeNodeDetail() {
  document.getElementById('node-detail').classList.remove('open');
  selectedNode = null; render();
}

function graphSearch(val) { searchTerm = val.toLowerCase().trim(); render(); }

// ── Layout persistence ────────────────────────────────────────────────────

function scheduleSaveLayout() {
  clearTimeout(_layoutTimer);
  _layoutTimer = setTimeout(() => {
    // Always persist FLAT coords — sphere positions are derived, and saving
    // them would restore a globe-shaped mess in 2D on next load.
    const pos = nodes.map(n => ({
      id: n.id,
      x: Math.round(graphMode === '3d' && n._x2d !== undefined ? n._x2d : n.x),
      y: Math.round(graphMode === '3d' && n._y2d !== undefined ? n._y2d : n.y),
      z: Math.round(n.z || 0),
    }));
    postMsg({ type: 'saveLayout', payload: { positions: pos } });
  }, 800);
}

function applyLayout(positions) {
  if (!positions?.length || !nodes.length) return;
  const pm = new Map(positions.map(p => [p.id, p]));
  nodes.forEach(n => { const s = pm.get(n.id); if (s) { n.x = s.x; n.y = s.y; if (typeof s.z === 'number') n.z = s.z; n.vx = 0; n.vy = 0; } });
  // Old saves (pre-separation blob) must not re-clutter the fresh layout.
  separateComponents();
  updateCentroid();
  render();
}

// ── Filter panel ──────────────────────────────────────────────────────────

function toggleFilterPanel() {
  const p = document.getElementById('filter-panel');
  p.style.display = p.style.display === 'none' || !p.style.display ? 'block' : 'none';
}

function applyFilters() {
  const de = document.getElementById('depth-filter');
  if (de) {
    const v = parseInt(de.value);
    const dv = document.getElementById('depth-val');
    if (dv) dv.textContent = v >= 6 ? 'All' : String(v);
  }
  render();
}

function clearFilters() {
  const de = document.getElementById('depth-filter');
  if (de) de.value = '6';
  const dv = document.getElementById('depth-val');
  if (dv) dv.textContent = 'All';
  render();
}

// ── Export ────────────────────────────────────────────────────────────────

function toggleExportMenu() {
  const menu = document.getElementById('export-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
}

function closeExportMenu() {
  const menu = document.getElementById('export-menu');
  if (menu) menu.style.display = 'none';
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('export-wrap');
  if (wrap && !wrap.contains(e.target)) closeExportMenu();
});

function exportGraph(format) {
  closeExportMenu();
  if (!graphBuilt || !nodes.length) return;

  if (format === 'png') {
    exportGraphAsPng();
  } else if (format === 'svg') {
    exportGraphAsSvg();
  }
}

function exportGraphAsPng() {
  // Render at fit-all view onto an offscreen canvas so the export
  // always captures the whole graph, regardless of current pan/zoom.
  const bounds = computeGraphBounds();
  if (!bounds) return;

  const pad = 40;
  const width  = Math.max(200, Math.round(bounds.width + pad * 2));
  const height = Math.max(200, Math.round(bounds.height + pad * 2));

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const offCtx = off.getContext('2d');

  // Background matches the editor theme so labels stay legible.
  const bg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background') || '#1e1e1e';
  offCtx.fillStyle = bg.trim() || '#1e1e1e';
  offCtx.fillRect(0, 0, width, height);

  renderGraphToContext(offCtx, {
    offsetX: pad - bounds.minX,
    offsetY: pad - bounds.minY,
    scale: 1,
  });

  const dataUrl = off.toDataURL('image/png');
  postMsg({
    type: 'exportGraph',
    payload: { format: 'png', dataUrl, suggestedName: currentRepoNameForExport() },
  });
}

function exportGraphAsSvg() {
  const bounds = computeGraphBounds();
  if (!bounds) return;

  const pad = 40;
  const width  = Math.max(200, Math.round(bounds.width + pad * 2));
  const height = Math.max(200, Math.round(bounds.height + pad * 2));
  const ox = pad - bounds.minX;
  const oy = pad - bounds.minY;

  const bg = (getComputedStyle(document.body).getPropertyValue('--vscode-editor-background') || '#1e1e1e').trim() || '#1e1e1e';
  const nm = new Map(nodes.map(n => [n.id, n]));

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${svgEsc(bg)}"/>`);

  // Edges (with simple arrowhead lines, mirrors drawArrowHead())
  for (const e of edges) {
    const a = nm.get(e.source), b = nm.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;
    const sx = a.x + (dx / dist) * a.r + ox, sy = a.y + (dy / dist) * a.r + oy;
    const ex = b.x - (dx / dist) * (b.r + 7) + ox, ey = b.y - (dy / dist) * (b.r + 7) + oy;
    parts.push(`<line x1="${fix(sx)}" y1="${fix(sy)}" x2="${fix(ex)}" y2="${fix(ey)}" stroke="rgba(255,255,255,0.18)" stroke-width="0.8"/>`);

    const ang = Math.atan2(ey - sy, ex - sx);
    const len = 8, angle = 0.45;
    const ax1 = ex - len * Math.cos(ang - angle), ay1 = ey - len * Math.sin(ang - angle);
    const ax2 = ex - len * Math.cos(ang + angle), ay2 = ey - len * Math.sin(ang + angle);
    parts.push(`<path d="M${fix(ex)},${fix(ey)} L${fix(ax1)},${fix(ay1)} M${fix(ex)},${fix(ey)} L${fix(ax2)},${fix(ay2)}" stroke="rgba(255,255,255,0.18)" stroke-width="0.8" fill="none"/>`);
  }

  // Nodes
  for (const n of nodes) {
    const cx = n.x + ox, cy = n.y + oy;
    parts.push(`<circle cx="${fix(cx)}" cy="${fix(cy)}" r="${fix(n.r)}" fill="${svgEsc(n.color)}55" stroke="${svgEsc(n.color)}" stroke-width="0.8"/>`);
    let lbl = n.label || '';
    if (lbl.length > 16) lbl = lbl.slice(0, 14) + '…';
    parts.push(`<text x="${fix(cx)}" y="${fix(cy + n.r + 11)}" font-size="9" font-family="sans-serif" fill="rgba(255,255,255,0.65)" text-anchor="middle">${svgEsc(lbl)}</text>`);
  }

  parts.push('</svg>');
  const svgText = parts.join('\n');

  postMsg({
    type: 'exportGraph',
    payload: { format: 'svg', svgText, suggestedName: currentRepoNameForExport() },
  });
}

/** Draws all current nodes/edges into an arbitrary 2D context at a given offset/scale.
 *  Used for PNG export so we don't depend on the live, possibly-panned main canvas. */
function renderGraphToContext(targetCtx, { offsetX, offsetY, scale }) {
  const nm = new Map(nodes.map(n => [n.id, n]));
  targetCtx.save();
  targetCtx.translate(offsetX, offsetY);
  targetCtx.scale(scale, scale);

  for (const e of edges) {
    const a = nm.get(e.source), b = nm.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;
    const sx = a.x + (dx / dist) * a.r, sy = a.y + (dy / dist) * a.r;
    const ex = b.x - (dx / dist) * (b.r + 7), ey = b.y - (dy / dist) * (b.r + 7);
    targetCtx.beginPath(); targetCtx.moveTo(sx, sy); targetCtx.lineTo(ex, ey);
    targetCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    targetCtx.lineWidth = 0.8;
    targetCtx.stroke();
    drawArrowHeadTo(targetCtx, ex, ey, sx, sy);
  }

  for (const n of nodes) {
    targetCtx.beginPath(); targetCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    targetCtx.fillStyle = n.color + '55'; targetCtx.fill();
    targetCtx.strokeStyle = n.color; targetCtx.lineWidth = 0.8; targetCtx.stroke();

    const fs = 9;
    targetCtx.font = `400 ${fs}px sans-serif`;
    targetCtx.textAlign = 'center';
    targetCtx.fillStyle = 'rgba(255,255,255,0.65)';
    let lbl = n.label; if (lbl.length > 16) lbl = lbl.slice(0, 14) + '…';
    targetCtx.fillText(lbl, n.x, n.y + n.r + fs + 2);
  }
  targetCtx.restore();
}

function drawArrowHeadTo(targetCtx, ex, ey, fromX, fromY) {
  const len = 8, angle = 0.45;
  const ang = Math.atan2(ey - fromY, ex - fromX);
  targetCtx.beginPath();
  targetCtx.moveTo(ex, ey);
  targetCtx.lineTo(ex - len * Math.cos(ang - angle), ey - len * Math.sin(ang - angle));
  targetCtx.moveTo(ex, ey);
  targetCtx.lineTo(ex - len * Math.cos(ang + angle), ey - len * Math.sin(ang + angle));
  targetCtx.strokeStyle = 'rgba(255,255,255,0.18)';
  targetCtx.lineWidth = 0.8;
  targetCtx.stroke();
}

function computeGraphBounds() {
  if (!nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r); maxX = Math.max(maxX, n.x + n.r);
    minY = Math.min(minY, n.y - n.r - 14); maxY = Math.max(maxY, n.y + n.r + 14); // leave room for labels
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function fix(v) { return Math.round(v * 100) / 100; }

function svgEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function currentRepoNameForExport() {
  // _repoName is defined in messaging.js and populated after analysis.
  return (typeof _repoName !== 'undefined' && _repoName) ? _repoName : 'repograph';
}
