// 3D In-Store Navigation — script.js
// Grid-based multi-floor demo with BFS shortest path and animated avatar

const COLS = 12, ROWS = 8;
const floors = ['G','1','2'];
let currentFloor = 0;
let mode = 'customer';
const mapEl = document.getElementById('map');
const floorBtnsEl = document.getElementById('floorBtns');
const floorLabelEl = document.getElementById('floorLabel');
const userLocationLabel = document.getElementById('userLocationLabel');
const itemsListEl = document.getElementById('itemsList');
const detailsEl = document.getElementById('details');
const avatarEl = document.getElementById('avatar');

let layout = JSON.parse(localStorage.getItem('mallLayout') || 'null');
if(!layout){
  // initialize empty floors
  layout = Array.from({length:floors.length}, ()=>Array.from({length:ROWS*COLS}, ()=>({type:'empty'})));
  // seed some special tiles and shops
  setSpecial(0, idx(1,1), 'office');
  setSpecial(0, idx(10,1), 'washroom');
  setSpecial(0, idx(6,6), 'escalator');
  setShop(0, idx(2,2), {name:'Fruits', items:{apple:30, banana:10}, color:'#f97316'});
  setShop(0, idx(3,2), {name:'Clothing', items:{shirt:499, dress:899}, color:'#60a5fa'});
  setShop(1, idx(4,3), {name:'Electronics', items:{headphones:799, charger:199}, color:'#7c3aed'});
  setShop(2, idx(9,2), {name:'Home', items:{mop:199, soap:49}, color:'#34d399'});
}

function idx(x,y){ return (y-1)*COLS + (x-1) }
function xy(i){ return {x:(i%COLS)+1, y: Math.floor(i/COLS)+1} }

function setSpecial(floor,i,type){ layout[floor][i] = {type} }
function setShop(floor,i,data){ layout[floor][i] = {type:'shop', meta:Object.assign({name:'Shop', items:{}, color:'#94a3b8'}, data)} }

let avatarPos = null; // {floor, idx}
let selectedTargets = []; // {floor, idx, key}
let currentPath = [];

function init(){
  // floor buttons
  floors.forEach((f,i)=>{
    const b = document.createElement('button'); b.textContent = f;
    b.addEventListener('click',()=>switchFloor(i));
    if(i===0) b.classList.add('active');
    floorBtnsEl.appendChild(b);
  });

  document.getElementById('modeSelect').addEventListener('change', e=>{
    mode = e.target.value;
  });

  document.getElementById('addShop').addEventListener('click', e=>{
    const empty = layout[currentFloor].findIndex(c=>c.type==='empty');
    if(empty === -1) return alert('No empty cell');
    setShop(currentFloor, empty, {name:'New Shop', items:{item:100}, color:randomColor()});
    saveLayout(); render();
  });

  document.getElementById('saveLayout').addEventListener('click', ()=>{ saveLayout(); alert('Saved to localStorage') });
  document.getElementById('exportJSON').addEventListener('click', ()=>{ downloadJSON(); });

  document.getElementById('buildRoute').addEventListener('click', ()=> buildAndAnimateRoute());
  document.getElementById('clearSelection').addEventListener('click', ()=>{ selectedTargets=[]; renderItems(); renderDetails(); });
  document.getElementById('demoRoute').addEventListener('click', demoRoute);
  document.getElementById('clearPath').addEventListener('click', ()=>{ clearPath(); });

  // modal handlers
  document.getElementById('saveShop').addEventListener('click', saveShopFromModal);
  document.getElementById('deleteShop').addEventListener('click', deleteShopFromModal);
  document.getElementById('modal').addEventListener('click', (ev)=>{ if(ev.target.id==='modal') closeModal(); });

  render();
}

function render(){
  floorLabelEl.textContent = `Floor: ${floors[currentFloor]}`;
  // build grid DOM
  mapEl.innerHTML = '';
  mapEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  mapEl.style.gridAutoRows = `48px`;
  layout[currentFloor].forEach((cell,i)=>{
    const el = document.createElement('div'); el.className = 'tile';
    el.dataset.idx = i;
    if(cell.type==='shop'){ el.classList.add('shop'); el.innerHTML = `<div class="top"></div><div class="side"></div><div class="label"><strong>${cell.meta.name}</strong><div class="small">${Object.keys(cell.meta.items||{}).length} items</div></div>`; el.style.backgroundImage = `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02)), linear-gradient(180deg, ${hexToRgba(cell.meta.color||'#94a3b8',0.12)}, rgba(0,0,0,0.00))`; }
    else if(cell.type==='office'){ el.classList.add('office'); el.innerHTML = '<div class="top"></div><div class="side"></div><div>🏢 Mall Office</div>'; }
    else if(cell.type==='washroom'){ el.classList.add('washroom'); el.innerHTML = '<div class="top"></div><div class="side"></div><div>🚻 Washroom</div>'; }
    else if(cell.type==='escalator'){ el.classList.add('escalator'); el.innerHTML = '<div class="top"></div><div class="side"></div><div>⬆️ Escalator</div>'; }
    else { el.innerHTML = '<div class="top"></div><div class="side"></div>'; }

    el.addEventListener('click', ()=> tileClicked(i));
    mapEl.appendChild(el);
  });

  renderItems();
  renderDetails();
  placeAvatar();
  renderPathDots(currentPath);
}

function switchFloor(i){
  currentFloor = i;
  Array.from(floorBtnsEl.children).forEach((b, idx)=> b.classList.toggle('active', idx===i));
  render();
}

function tileClicked(i){
  const cell = layout[currentFloor][i];
  if(mode === 'shopkeeper'){
    openModal(i);
    return;
  }
  // customer mode
  if(!avatarPos){
    avatarPos = {floor: currentFloor, idx: i};
    userLocationLabel.textContent = `Floor ${floors[currentFloor]} (${xy(i).x},${xy(i).y})`;
    placeAvatar();
    return;
  }
  // clicking a shop toggles selection
  if(cell.type==='shop'){
    toggleSelect(currentFloor, i);
    return;
  }
  // otherwise move avatar to clicked tile on same floor
  if(avatarPos.floor === currentFloor){
    const p = findShortestPath(avatarPos.idx, i, currentFloor);
    if(p) animatePath(p);
    else alert('No path available');
  } else {
    // switch floor and set avatar there
    avatarPos = {floor: currentFloor, idx: i};
    placeAvatar();
  }
}

function toggleSelect(floor,i){
  const key = `${floor}_${i}`;
  const pos = selectedTargets.findIndex(t=>t.key===key);
  if(pos>=0) selectedTargets.splice(pos,1);
  else selectedTargets.push({key, floor, idx:i});
  renderItems();
  renderDetails();
}

function renderItems(){
  itemsListEl.innerHTML = '';
  layout.forEach((floorArr, floorIdx)=>{
    floorArr.forEach((cell, i)=>{
      if(cell.type==='shop'){
        const row = document.createElement('div'); row.className = 'shop-row';
        const meta = document.createElement('div'); meta.className = 'meta';
        meta.innerHTML = `<strong>${cell.meta.name}</strong><div class="small">Floor ${floors[floorIdx]} — ${xy(i).x},${xy(i).y}</div>`;
        const actions = document.createElement('div');
        const btn = document.createElement('button'); btn.className='btn'; btn.textContent = isSelected(floorIdx,i)?'Selected':'Select';
        btn.addEventListener('click', ()=> toggleSelect(floorIdx,i));
        actions.appendChild(btn);
        row.appendChild(meta); row.appendChild(actions);
        itemsListEl.appendChild(row);
      }
    });
  });
}

function isSelected(f,i){ return selectedTargets.some(t=>t.floor===f && t.idx===i) }
function renderDetails(){
  if(selectedTargets.length===0){
    detailsEl.innerHTML = '<div class="small">No selection</div>'; return;
  }
  const html = selectedTargets.map(t=>{
    const meta = layout[t.floor][t.idx].meta;
    return `<div><strong>${meta.name}</strong> — Floor ${floors[t.floor]} (${xy(t.idx).x},${xy(t.idx).y})</div>`;
  }).join('');
  detailsEl.innerHTML = `<div class="small">Selected ${selectedTargets.length}</div>${html}`;
}

// ---------------- Avatar & path rendering ----------------
function placeAvatar(){
  if(!avatarPos){ avatarEl.style.display='none'; return; }
  avatarEl.style.display = avatarPos.floor === currentFloor ? 'block' : 'none';
  if(avatarPos.floor !== currentFloor) return;
  // find the tile element and position avatar to its center
  const tile = mapEl.querySelector(`.tile[data-idx='${avatarPos.idx}']`);
  if(!tile) return;
  const rect = tile.getBoundingClientRect();
  avatarEl.style.left = (rect.left + rect.width/2) + 'px';
  avatarEl.style.top = (rect.top + rect.height/2) + 'px';
}

function renderPathDots(nodes){
  // remove existing
  document.querySelectorAll('.path-dot').forEach(d=>d.remove());
  nodes.forEach(n=>{
    if(n.floor !== currentFloor) return;
    const tile = mapEl.querySelector(`.tile[data-idx='${n.idx}']`);
    if(!tile) return;
    const r = tile.getBoundingClientRect();
    const dot = document.createElement('div'); dot.className = 'path-dot';
    dot.style.left = (r.left + r.width/2) + 'px';
    dot.style.top = (r.top + r.height/2) + 'px';
    dot.style.background = 'rgba(99,102,241,0.9)';
    document.body.appendChild(dot);
  });
}

async function animatePath(route){
  if(!route || route.length===0) return;
  currentPath = route.slice();
  for(let i=0;i<route.length;i++){
    const node = route[i];
    // set avatar position & switch floor if needed
    avatarPos = {floor: node.floor, idx: node.idx};
    switchFloor(node.floor);
    placeAvatar();
    renderPathDots(route.slice(i+1));
    const speed = 700 - (document.getElementById('speed').value * 100);
    await sleep(Math.max(120, speed));
  }
  currentPath = [];
  renderPathDots([]);
}

function clearPath(){ currentPath = []; document.querySelectorAll('.path-dot').forEach(d=>d.remove()); }

// ---------------- Pathfinding: BFS ----------------
function neighbors(i){
  const p = xy(i);
  const deltas = [[1,0],[-1,0],[0,1],[0,-1]];
  const n = [];
  deltas.forEach(([dx,dy])=>{
    const nx = p.x + dx, ny = p.y + dy;
    if(nx>=1 && nx<=COLS && ny>=1 && ny<=ROWS) n.push(idx(nx,ny));
  });
  return n;
}

function findShortestPath(start, goal, floor){
  if(start === goal) return [{floor, idx: start}];
  const queue = [start];
  const prev = Array(ROWS*COLS).fill(-1);
  prev[start] = start;
  while(queue.length){
    const u = queue.shift();
    if(u === goal) break;
    for(const v of neighbors(u)){
      if(prev[v] === -1 && layout[floor][v].type !== 'blocked'){
        prev[v] = u;
        queue.push(v);
      }
    }
  }
  if(prev[goal] === -1) return null;
  const path = [];
  let cur = goal;
  while(true){
    path.push({floor, idx: cur});
    if(cur === start) break;
    cur = prev[cur];
  }
  return path.reverse();
}

// Multi-target route builder (greedy nearest neighbor on same-floor)
function buildMultiRoute(startNode, targets){
  let route = [];
  let cur = startNode;
  const remaining = targets.slice();
  while(remaining.length){
    let bestIdx = -1, bestPath = null;
    for(let i=0;i<remaining.length;i++){
      const t = remaining[i];
      if(t.floor !== cur.floor) continue;
      const p = findShortestPath(cur.idx, t.idx, cur.floor);
      if(!p) continue;
      if(!bestPath || p.length < bestPath.length){ bestPath = p; bestIdx = i; }
    }
    if(bestIdx === -1) break;
    if(route.length === 0) route = bestPath.slice();
    else route = route.concat(bestPath.slice(1));
    cur = remaining.splice(bestIdx,1)[0];
  }
  return route;
}

function buildAndAnimateRoute(){
  if(!avatarPos) return alert('Set your current location: click a tile to set user location');
  if(selectedTargets.length === 0) return alert('Select one or more shops');
  const targets = selectedTargets.map(t=>({floor:t.floor, idx:t.idx}));
  // we currently build same-floor route; if targets on other floors exist, route for those requires elevator/escalator logic
  const sameFloorTargets = targets.filter(t => t.floor === avatarPos.floor);
  if(sameFloorTargets.length === 0) return alert('Selected targets are on different floors. Set avatar on their floor or select same-floor shops.');
  const route = buildMultiRoute(avatarPos, sameFloorTargets);
  if(route && route.length) animatePath(route);
  else alert('Unable to build route');
}

// ---------------- Modal (shopkeeper) ----------------
let editingIdx = null;
function openModal(i){
  editingIdx = i;
  const cell = layout[currentFloor][i];
  document.getElementById('modalTitle').textContent = cell.type === 'shop' ? 'Edit Shop' : 'Add Shop';
  document.getElementById('shopName').value = cell.meta ? cell.meta.name : '';
  document.getElementById('shopItems').value = cell.meta ? Object.entries(cell.meta.items || {}).map(([k,v])=>`${k}:${v}`).join(', ') : '';
  document.getElementById('modal').style.display = 'flex';
}

function closeModal(){ document.getElementById('modal').style.display = 'none'; editingIdx = null; }

function saveShopFromModal(){
  const name = document.getElementById('shopName').value.trim() || 'Shop';
  const itemsRaw = document.getElementById('shopItems').value.trim();
  const items = {};
  if(itemsRaw) itemsRaw.split(',').forEach(p=>{ const [k,v] = p.split(':').map(s=>s.trim()); if(k) items[k] = Number(v) || v; });
  setShop(currentFloor, editingIdx, {name, items, color: randomColor()});
  saveLayout(); closeModal(); render();
}

function deleteShopFromModal(){
  layout[currentFloor][editingIdx] = {type:'empty'}; saveLayout(); closeModal(); render();
}

// ---------------- Utilities ----------------
function saveLayout(){ localStorage.setItem('mallLayout', JSON.stringify(layout)); }
function downloadJSON(){
  const blob = new Blob([JSON.stringify(layout,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mall-layout.json'; a.click(); URL.revokeObjectURL(url);
}
function randomColor(){ return ['#f97316','#60a5fa','#7c3aed','#34d399','#f43f5e'][Math.floor(Math.random()*5)]; }
function hexToRgba(hex,a=1){ const c = hex.replace('#',''); const r=parseInt(c.substring(0,2),16), g=parseInt(c.substring(2,4),16), b=parseInt(c.substring(4,6),16); return `rgba(${r},${g},${b},${a})`; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// demo route
function demoRoute(){
  if(!avatarPos) avatarPos = {floor:0, idx: idx(1,1)};
  const t1 = {floor:0, idx: idx(2,2)};
  const t2 = {floor:0, idx: idx(3,2)};
  const p1 = findShortestPath(avatarPos.idx, t1.idx, avatarPos.floor) || [];
  const p2 = findShortestPath(t1.idx, t2.idx, t1.floor) || [];
  const route = p1.concat(p2.slice(1));
  animatePath(route);
}

function clearPath(){ currentPath = []; document.querySelectorAll('.path-dot').forEach(d=>d.remove()); }

// small UX — keep avatar in place on resize
window.addEventListener('resize', ()=>{ placeAvatar(); renderPathDots(currentPath); });

// initial
init();
