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

// ======================================================
// GLOBAL STATE
// ======================================================
let CURRENT_USER = null;

// ======================================================
// AUTHENTICATION
// ======================================================
async function initAuth() {
  const modal = $('#auth-modal');
  modal.classList.add('visible');
  $('#login-btn').onclick = () => login('login');
  $('#signup-btn').onclick = () => login('signup');
  $('#forgot-link').onclick = async (e)=>{
    e.preventDefault();
    const email = $('#auth-email').value;
    if(!email) return alert('Enter your email first');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/index.html" });
    if(error) return alert(error.message);
    alert('Password reset email sent.');
  };

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
  await initAgentsUI();
  await initTasksUI();
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
    const { data } = await supabase
      .from('agents')
      .select('id, full_name, region, status, agent_skills(*), agent_pto(*)')
      .eq('owner_id', CURRENT_USER.id)
      .order('full_name',{ascending:true});
    const rows = data || [];
    render(rows);
  }

  function render(rows){
    tbody.innerHTML='';
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="12">No agents yet.</td></tr>';
      return;
    }
    for(const ag of rows){
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td class="ag-name" contenteditable="true">${ag.full_name}</td>
        <td>${ag.region}</td>
        <td>
          <select class="ag-status" data-id="${ag.id}">
            ${['Present','PTO','Sick Leave','Unavailable'].map(s=>`<option value="${s}" ${ag.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${checkbox('can_call',ag)}</td>
        <td>${checkbox('can_mail',ag)}</td>
        <td>${checkbox('can_chat',ag)}</td>
        <td>${checkbox('can_clienteling',ag)}</td>
        <td>${checkbox('can_fraud',ag)}</td>
        <td>${checkbox('can_backoffice',ag)}</td>
        <td><button class="mini pto-btn" data-id="${ag.id}">PTO</button></td>
        <td><button class="mini secondary cal-btn" data-id="${ag.id}">📅</button></td>
        <td><button class="mini danger del-btn" data-id="${ag.id}">Delete</button></td>`;
      tbody.appendChild(tr);
    }
  }

  function checkbox(key, ag){
    const v = ag.agent_skills?.[key] ?? true;
    return `<input type="checkbox" class="ag-skill" data-key="${key}" data-id="${ag.id}" ${v?'checked':''}/>`;
  }

  addBtn.onclick = async ()=>{
    const fullName = prompt('Agent full name:');
    if(!fullName) return;
    await supabase.rpc('add_agent_for_current_user',{p_full_name:fullName,p_region:regionSel.value});
    await loadAgents();
  };

  tbody.addEventListener('change', async e=>{
    const id = e.target.dataset.id;
    if(e.target.classList.contains('ag-status')){
      await supabase.from('agents').update({status:e.target.value}).eq('id',id);
    }
    if(e.target.classList.contains('ag-skill')){
      const key = e.target.dataset.key;
      const val = e.target.checked;
      await supabase.from('agent_skills').upsert({agent_id:id, [key]:val},{onConflict:'agent_id'});
    }
  });

  tbody.addEventListener('click', async e=>{
    const id = e.target.dataset.id;
    if(e.target.classList.contains('del-btn')){
      if(!confirm('Delete this agent?')) return;
      await supabase.from('agent_skills').delete().eq('agent_id',id);
      await supabase.from('agent_pto').delete().eq('agent_id',id);
      await supabase.from('agents').delete().eq('id',id);
      await loadAgents();
    }
    if(e.target.classList.contains('pto-btn')) openPTODrawer(id);
  });

  tbody.addEventListener('blur', async e=>{
    if(e.target.classList.contains('ag-name')){
      const tr = e.target.closest('tr');
      const id = tr.querySelector('.del-btn')?.dataset?.id;
      const newName = e.target.textContent.trim();
      await supabase.from('agents').update({full_name:newName}).eq('id',id);
    }
  }, true);

  await loadAgents();
}

// PTO Drawer
function openPTODrawer(agentId){
  const drawer = $('#pto-drawer');
  const saveBtn = $('#pto-save');
  const closeBtn = $('#pto-close');
  const list = $('#pto-list');

  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden','false');

  closeBtn.onclick = ()=>{ drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true'); };

  saveBtn.onclick = async ()=>{
    const s=$('#pto-start').value, e=$('#pto-end').value || s;
    const hs=$('#pto-half-start').value || null, he=$('#pto-half-end').value || null;
    if(!s) return alert('Pick a start date');
    const { error } = await supabase.from('agent_pto').insert({agent_id:agentId,start_date:s,end_date:e,half_day_start:hs,half_day_end:he});
    if(error) return alert(error.message);
    await refreshList();
  };

  async function refreshList(){
    const { data } = await supabase.from('agent_pto').select('*').eq('agent_id',agentId).order('start_date',{ascending:true});
    list.innerHTML = (data||[]).map(p=>`<li>${p.start_date} ${p.half_day_start||'Full'} → ${p.end_date} ${p.half_day_end||'Full'} <button class="mini danger" data-del="${p.id}">Delete</button></li>`).join('') || '<li class="muted">No PTO yet.</li>';
    list.querySelectorAll('[data-del]').forEach(btn=>{
      btn.onclick = async ()=>{
        await supabase.from('agent_pto').delete().eq('id',btn.dataset.del);
        await refreshList();
      };
    });
  }

  refreshList();
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

  let TASKS = [];

  async function loadTasks(){
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('owner_id',CURRENT_USER.id)
      .eq('region',regionSel.value)
      .order('name',{ascending:true});
    TASKS = data || [];
    render();
  }

  function render(){
    const q = (search.value||'').toLowerCase();
    const pr = filter.value;
    tbody.innerHTML='';
    TASKS.filter(t=>{
      if(q && !`${t.name} ${t.notes||''}`.toLowerCase().includes(q)) return false;
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
          <button class="mini edit" data-id="${t.id}">Edit</button>
          <button class="mini danger del" data-id="${t.id}">Delete</button>
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
// FORECAST (placeholder save total)
// ======================================================
function initForecastUI(){
  const regionSel = $('#fc-region');
  const loadBtn = $('#fc-load');

  async function loadForecast(){
    const { data } = await supabase.from('forecast_totals').select('*')
      .eq('owner_id',CURRENT_USER.id).eq('region',regionSel.value);
    $('#fc-total').value = data?.[0]?.total_volume||0;
  }

  $('#fc-save-total').onclick = async ()=>{
    const total = +$('#fc-total').value;
    await supabase.from('forecast_totals').upsert({owner_id:CURRENT_USER.id,region:regionSel.value,total_volume:total},{onConflict:'owner_id,region'});
    alert('Saved total');
  };

  loadBtn.onclick=loadForecast;
  loadForecast();
}

// ======================================================
// WEEKLY PLANNING (baseline)
// ======================================================
function initWeekly(){
  const loadBtn=$('#wp-load');
  const grid=$('#wp-grid');
  const agentsCount=$('#wp-agents-count');
  const coverageAvg=$('#wp-coverage-avg');
  const understaffed=$('#wp-understaffed');

  function hoursRange(start,end){
    const res=[]; 
    let [h,m]=start.split(':').map(Number);
    let [H,M]=end.split(':').map(Number);
    for(let cur=h*60+m; cur<=(H*60+M-30); cur+=30){
      const hh=String(Math.floor(cur/60)).padStart(2,'0');
      const mm=String(cur%60).padStart(2,'0');
      res.push(`${hh}:${mm}`);
    }
    return res;
  }

  async function build(){
    grid.innerHTML='';
    const region=$('#wp-region').value;
    const start=$('#wp-day-start').value||'09:00';
    const end=$('#wp-day-end').value||'21:00';

    const { data:agents } = await supabase.from('agents').select('*').eq('region',region);
    const { data:pto } = await supabase.from('agent_pto').select('*');

    const sickIds = new Set((agents||[]).filter(a=>a.status==='Sick Leave').map(a=>a.id));
    const slots = hoursRange(start,end);

    // header
    let thead = `<thead><tr><th class="first-col">Agent</th>${slots.map(s=>`<th class="slot-col ${s.endsWith(':00')?'hour-marker':''}">${s}</th>`).join('')}</tr></thead>`;

    // rows
    const bodyRows = (agents||[]).map(a=>{
      let row = `<tr><td class="first-col">${a.full_name}</td>`;
      for(const s of slots){
        const isSick = sickIds.has(a.id);
        const hasPTO = (pto||[]).some(p=>p.agent_id===a.id); // simplifié (par jour/heure à raffiner ensuite)
        row += `<td><div class="cell ${isSick?'gap':hasPTO?'pto':'present'}"></div></td>`;
      }
      row += `</tr>`;
      return row;
    }).join('');

    grid.innerHTML = thead + `<tbody>${bodyRows}</tbody>`;
    agentsCount.textContent = String((agents||[]).filter(a=>a.status==='Present').length);
    coverageAvg.textContent = '— %';
    understaffed.textContent = '—';
  }

  $('#wp-export').onclick = ()=> alert('CSV export will include demand vs capacity in v2.');
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

  let RULES = [];
  let currentId=null, deleteId=null;

  async function loadRules(){
    const {data}=await supabase.from('regulations').select('*').order('created_at',{ascending:false});
    RULES=data||[];
    render();
  }

  function render(){
    table.innerHTML='';
    if(!RULES.length){ table.innerHTML='<tr><td colspan="6">No rules yet.</td></tr>'; return; }
    RULES.forEach(r=>{
      const tr=document.createElement('tr');
      const params = [r.param1, r.param2].filter(x=>x!==null && x!=='' && x!==undefined).join(' · ') || '—';
      tr.innerHTML=`
        <td>${r.name}</td><td>${r.type}</td>
        <td>${params}</td><td>${r.scope}${r.scope_target?` : ${r.scope_target}`:''}</td>
        <td>${r.active?'✅':'❌'}</td>
        <td class="row-actions">
          <button class="mini edit" data-id="${r.id}">Edit</button>
          <button class="mini danger del" data-id="${r.id}">Delete</button>
        </td>`;
      table.appendChild(tr);
    });
    $('#activeRulesCount').textContent = String(RULES.filter(r=>r.active).length);
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
      param1:valOrNull($('#ruleParam1').value),
      param2:valOrNull($('#ruleParam2').value),
      scope:$('#ruleScope').value,
      scope_target:valOrNull($('#ruleScopeTarget').value),
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

  function valOrNull(v){ const t=(v??'').toString().trim(); return t===''?null:t; }

  function openModal(rule){
    currentId=rule?.id||null;
    $('#ruleModalTitle').textContent=rule?'Edit rule':'New rule';
    $('#ruleForm').reset();
    if(rule){
      $('#ruleName').value=rule.name;
      $('#ruleType').value=rule.type;
      $('#ruleParam1').value=rule.param1??'';
      $('#ruleParam2').value=rule.param2??'';
      $('#ruleScope').value=rule.scope;
      $('#ruleScopeTarget').value=rule.scope_target??'';
      $('#ruleSeverity').value=rule.severity;
      $('#ruleActive').checked=!!rule.active;
    }
    modal.showModal();
  }

  loadRules();
}

// ======================================================
// ATTENDANCE (mini-demo pour l’adherence bar)
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
