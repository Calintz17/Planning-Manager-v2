// app.js
// ======================================================
// ROMAN | Planning Manager v2 – main application logic
// ======================================================

import { CONFIG } from './config.js';
const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// ======================================================
// UTILS
// ======================================================
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmtPct = n => `${(n||0).toFixed(1)}%`;
const fmtNum = n => n?.toLocaleString?.() ?? n;
const today = new Date().toISOString().slice(0,10);

// Helpers
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ======================================================
// GLOBAL STATE
// ======================================================
let CURRENT_USER = null;
let AGENTS = [];
let TASKS = [];
let PTO = [];
let FORECAST = {};
let RULES = [];

// ======================================================
// AUTHENTICATION
// ======================================================
async function initAuth() {
  const modal = $('#auth-modal');
  modal.classList.add('visible');
  $('#login-btn').onclick = () => login('login');
  $('#signup-btn').onclick = () => login('signup');

  async function login(mode){
    const email = $('#auth-email').value;
    const password = $('#auth-password').value;
    const region = $('#auth-region').value;
    let res;
    if(mode==='signup'){
      res = await supabase.auth.signUp({email,password});
      if(res.error){showErr(res.error.message);return;}
      await supabase.rpc('seed_defaults_for_current_user',{p_region:region});
    } else {
      res = await supabase.auth.signInWithPassword({email,password});
    }
    if(res.error){showErr(res.error.message);return;}
    CURRENT_USER = res.data.user;
    modal.classList.remove('visible');
    initApp();
  }

  function showErr(msg){
    $('#auth-error').textContent = msg;
  }
}

// ======================================================
// INIT APP
// ======================================================
async function initApp(){
  initTabs();
  initAgentsUI();
  initTasksUI();
  initForecastUI();
  initWeekly();
  initRegulationUI();
  initAttendance();
}

// ======================================================
// TABS
// ======================================================
function initTabs(){
  $$('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tab = btn.dataset.tab;
      $$('.tab-btn').forEach(b=>b.classList.toggle('active',b===btn));
      $$('.tab-panel').forEach(p=>p.hidden = p.id!==tab);
    });
  });
}

// ======================================================
// AGENTS + PTO
// ======================================================
async function initAgentsUI(){
  const addBtn = $('#ag-add');
  const regionSel = $('#ag-region');
  const tbody = $('#ag-table tbody');

  async function loadAgents(){
    const { data } = await supabase.from('agents').select('*, agent_skills(*), agent_pto(*)').eq('owner_id', CURRENT_USER.id);
    AGENTS = data || [];
    render();
  }

  function render(){
    tbody.innerHTML='';
    for(const ag of AGENTS){
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${ag.full_name}</td>
        <td>${ag.region}</td>
        <td>${ag.status}</td>
        <td>${ag.agent_skills?.can_call?'✅':'❌'}</td>
        <td>${ag.agent_skills?.can_mail?'✅':'❌'}</td>
        <td>${ag.agent_skills?.can_chat?'✅':'❌'}</td>
        <td>${ag.agent_skills?.can_clienteling?'✅':'❌'}</td>
        <td>${ag.agent_skills?.can_fraud?'✅':'❌'}</td>
        <td>${ag.agent_skills?.can_backoffice?'✅':'❌'}</td>
        <td><button class="mini pto-btn" data-id="${ag.id}">PTO</button></td>
        <td><button class="mini cal-btn" data-id="${ag.id}">Calendar</button></td>
        <td><button class="mini danger del-btn" data-id="${ag.id}">✖</button></td>`;
      tbody.appendChild(tr);
    }
  }

  addBtn.onclick = async ()=>{
    const fullName = prompt('Agent name:');
    if(!fullName) return;
    await supabase.rpc('add_agent_for_current_user',{p_full_name:fullName,p_region:regionSel.value});
    await loadAgents();
  };

  tbody.onclick = async e=>{
    const id = e.target.dataset.id;
    if(e.target.classList.contains('del-btn')){
      await supabase.from('agents').delete().eq('id',id);
      await loadAgents();
    }
    if(e.target.classList.contains('pto-btn')) openPTODrawer(id);
  };

  await loadAgents();
}

// PTO Drawer
function openPTODrawer(agentId){
  const drawer = $('#pto-drawer');
  const saveBtn = $('#pto-save');
  const closeBtn = $('#pto-close');
  const list = $('#pto-list');

  drawer.classList.add('open');
  closeBtn.onclick = ()=>drawer.classList.remove('open');

  saveBtn.onclick = async ()=>{
    const s=$('#pto-start').value, e=$('#pto-end').value;
    const hs=$('#pto-half-start').value, he=$('#pto-half-end').value;
    if(!s||!e)return alert('Pick dates');
    await supabase.from('agent_pto').insert({agent_id:agentId,start_date:s,end_date:e,half_day_start:hs,half_day_end:he});
    alert('Saved PTO');
    drawer.classList.remove('open');
  };

  // Display existing PTOs
  supabase.from('agent_pto').select('*').eq('agent_id',agentId).then(({data})=>{
    list.innerHTML=data.map(p=>`<li>${p.start_date} → ${p.end_date}</li>`).join('')||'<li>No PTO</li>';
  });
}

// ======================================================
// TASKS
// ======================================================
async function initTasksUI(){
  const regionSel = $('#task-region');
  const tbody = $('#tasksTbody');
  const search = $('#task-search');
  const filter = $('#task-filter-priority');
  const createBtn = $('#createTaskBtn');

  async function loadTasks(){
    const { data } = await supabase.from('tasks').select('*').eq('owner_id',CURRENT_USER.id).eq('region',regionSel.value);
    TASKS = data || [];
    render();
  }

  function render(){
    const q = search.value.toLowerCase();
    const pr = filter.value;
    tbody.innerHTML='';
    TASKS.filter(t=>{
      if(q && !t.name.toLowerCase().includes(q)) return false;
      if(pr==='high' && t.priority!=='P1')return false;
      if(pr==='med' && t.priority!=='P2')return false;
      if(pr==='low' && t.priority!=='P3')return false;
      return true;
    }).forEach(t=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${t.name}</td>
        <td>${t.priority}</td>
        <td>${t.avg_handle_time_min}</td>
        <td><input type="checkbox" ${t.enabled?'checked':''} data-id="${t.id}" class="toggle"></td>
        <td>${t.notes||''}</td>
        <td class="row-actions">
          <button class="mini edit" data-id="${t.id}">✎</button>
          <button class="mini danger del" data-id="${t.id}">✖</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  tbody.onclick = async e=>{
    const id=e.target.dataset.id;
    if(e.target.classList.contains('del')){
      if(confirm('Delete task?')){await supabase.from('tasks').delete().eq('id',id);await loadTasks();}
    }
    if(e.target.classList.contains('toggle')){
      const val=e.target.checked;
      await supabase.from('tasks').update({enabled:val}).eq('id',id);
    }
    if(e.target.classList.contains('edit')){
      const t=TASKS.find(x=>x.id===id);
      const newName=prompt('Edit task name',t.name);
      if(!newName)return;
      await supabase.from('tasks').update({name:newName}).eq('id',id);
      await loadTasks();
    }
  };

  createBtn.onclick = async ()=>{
    const name=prompt('Task name:');
    if(!name)return;
    await supabase.from('tasks').insert({region:regionSel.value,name,priority:'P3',avg_handle_time_min:10,enabled:true});
    await loadTasks();
  };

  [search,filter,regionSel].forEach(el=>el.addEventListener('input',render));
  await loadTasks();
}

// ======================================================
// FORECAST
// ======================================================
function initForecastUI(){
  const regionSel = $('#fc-region');
  const loadBtn = $('#fc-load');

  async function loadForecast(){
    const { data } = await supabase.from('forecast_totals').select('*').eq('owner_id',CURRENT_USER.id).eq('region',regionSel.value);
    FORECAST[regionSel.value] = data||[];
    $('#fc-total').value = data?.[0]?.total_volume||0;
  }

  $('#fc-save-total').onclick = async ()=>{
    const total = +$('#fc-total').value;
    await supabase.from('forecast_totals').upsert({region:regionSel.value,total_volume:total});
    alert('Saved total');
  };

  loadBtn.onclick=loadForecast;
  loadForecast();
}

// ======================================================
// WEEKLY PLANNING (basic logic)
// ======================================================
function initWeekly(){
  const loadBtn=$('#wp-load');
  const grid=$('#wp-grid');

  async function build(){
    grid.innerHTML='';
    const region=$('#wp-region').value;
    const start=$('#wp-day-start').value;
    const end=$('#wp-day-end').value;
    const agents=await supabase.from('agents').select('*').eq('region',region);
    const pto=await supabase.from('agent_pto').select('*');
    const sick=agents.data.filter(a=>a.status==='Sick Leave').map(a=>a.id);
    const hours=[];
    for(let h=parseInt(start);h<=parseInt(end);h++)hours.push(`${h}:00`);

    const header=`<thead><tr><th class="first-col">Agent</th>${hours.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;
    const rows=agents.data.map(a=>{
      let row=`<tr><td class="first-col">${a.full_name}</td>`;
      hours.forEach(h=>{
        const isSick=sick.includes(a.id);
        const isPTO=pto.data.some(p=>p.agent_id===a.id);
        row+=`<td class="slot-col"><div class="cell ${isSick?'gap':isPTO?'pto':'present'}"></div></td>`;
      });
      row+='</tr>';
      return row;
    }).join('');
    grid.innerHTML=header+`<tbody>${rows}</tbody>`;
  }
  loadBtn.onclick=build;
}

// ======================================================
// REGULATION
// ======================================================
function initRegulationUI(){
  const addBtn=$('#addRuleBtn');
  const table=$('#regulationTableBody');
  const modal=$('#ruleModal');
  const confirmDel=$('#confirmDeleteModal');
  const form=$('#ruleForm');
  const closeBtn=$('#closeRuleModal');
  const cancelBtn=$('#cancelRuleBtn');
  const confirmBtn=$('#confirmDeleteBtn');
  const cancelDelBtn=$('#cancelDeleteBtn');
  let currentId=null, deleteId=null;

  async function loadRules(){
    const {data}=await supabase.from('regulations').select('*').order('created_at',{ascending:false});
    RULES=data||[];
    render();
  }

  function render(){
    table.innerHTML='';
    RULES.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${r.name}</td><td>${r.type}</td>
        <td>${r.param1??''}</td><td>${r.scope}</td>
        <td>${r.active?'✅':'❌'}</td>
        <td class="row-actions">
          <button class="mini edit" data-id="${r.id}">✎</button>
          <button class="mini danger del" data-id="${r.id}">✖</button>
        </td>`;
      table.appendChild(tr);
    });
  }

  addBtn.onclick = ()=>openModal();

  table.onclick=e=>{
    const id=e.target.dataset.id;
    if(e.target.classList.contains('edit')){
      const r=RULES.find(x=>x.id===id);
      openModal(r);
    }
    if(e.target.classList.contains('del')){
      deleteId=id;
      confirmDel.showModal();
    }
  };

  cancelDelBtn.onclick=()=>confirmDel.close();
  confirmBtn.onclick=async()=>{
    await supabase.from('regulations').delete().eq('id',deleteId);
    confirmDel.close();await loadRules();
  };

  closeBtn.onclick=()=>modal.close();
  cancelBtn.onclick=()=>modal.close();

  form.onsubmit=async e=>{
    e.preventDefault();
    const payload={
      name:$('#ruleName').value,
      type:$('#ruleType').value,
      param1:$('#ruleParam1').value,
      param2:$('#ruleParam2').value,
      scope:$('#ruleScope').value,
      scope_target:$('#ruleScopeTarget').value,
      severity:$('#ruleSeverity').value,
      active:$('#ruleActive').checked
    };
    if(currentId)
      await supabase.from('regulations').update(payload).eq('id',currentId);
    else
      await supabase.from('regulations').insert(payload);
    modal.close();
    await loadRules();
  };

  function openModal(rule){
    currentId=rule?.id||null;
    $('#ruleModalTitle').textContent=rule?'Edit rule':'New rule';
    form.reset();
    if(rule){
      $('#ruleName').value=rule.name;
      $('#ruleType').value=rule.type;
      $('#ruleParam1').value=rule.param1||'';
      $('#ruleParam2').value=rule.param2||'';
      $('#ruleScope').value=rule.scope;
      $('#ruleScopeTarget').value=rule.scope_target||'';
      $('#ruleSeverity').value=rule.severity;
      $('#ruleActive').checked=rule.active;
    }
    modal.showModal();
  }

  loadRules();
}

// ======================================================
// ATTENDANCE (simple placeholder calc for adherence)
// ======================================================
function initAttendance(){
  $('#att-calc').onclick = ()=>{
    const pct = Math.floor(Math.random()*40+60);
    $('#adherence-fill').style.width=pct+'%';
    $('#adherence-label').textContent=fmtPct(pct);
  };
}

// ======================================================
// START
// ======================================================
supabase.auth.getUser().then(({data})=>{
  if(data.user){CURRENT_USER=data.user;initApp();}
  else initAuth();
});
