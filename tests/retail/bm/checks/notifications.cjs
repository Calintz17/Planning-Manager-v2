// Notifications (Roman 19-10): a red cross reads one without opening; a notification goes once its planning is shown
// (not on the click, not only on a decision); no red count at zero; read for this account only, the sending does not
// change. Synthetic data, no network. Usage: node notifications.cjs [build]
const vm = require('vm'), {context} = require('./runner.cjs');
const file = process.argv[2] || 'CAST_RETAIL_TEST.html', out = [];
function fresh(role) {
  const c = context(file);
  vm.runInContext(`Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-19T12:00:00']));}static now(){return new Date().getTime();}};
  monthlyRef=new Date(2026,10,1);me={id:'u1',role:'${role}'};var writes=[],seenDb=[];
  var rows=[{id:'n1',store_id:currentStoreId,month:'2026-11',revision:1,status:'returned',submitted_by:'u1',decided_by_name:'D',decided_at:'2026-10-18T10:00:00Z'},
            {id:'n2',store_id:currentStoreId,month:'2026-12',revision:1,status:'validated',submitted_by:'u1',decided_by_name:'D',decided_at:'2026-10-18T11:00:00Z'}];
  var pend=[{id:'p1',store_id:currentStoreId,month:'2026-11',revision:2,status:'pending',submitted_by:'u2',submitted_by_name:'M',submitted_at:'2026-10-18T12:00:00Z'}];
  sb.from=function(table){var q={},head=false,lo=0,hi=1e9,st=null;q.select=(c,o)=>{head=!!(o&&o.head);return q;};
    q.eq=(k,v)=>{if(k==='status')st=v;return q;};for(const k of ['order','in','gte','lt','limit','maybeSingle'])q[k]=()=>q;
    q.range=(a,b)=>{lo=a;hi=b+1;return q;};
    q.insert=r=>{writes.push([table,'insert',r]);if(table==='retail_review_seen')seenDb.push(r.review_id);return q;};
    for(const k of ['update','upsert','delete'])q[k]=r=>{writes.push([table,k,r]);return q;};
    q.then=ok=>{var res;if(table==='retail_plan_reviews'){var src=st==='pending'?pend:rows;res=head?{count:src.length,data:null,error:null}:{data:src.slice(lo,hi),error:null};}
      else if(table==='retail_review_seen')res={data:seenDb.map(id=>({review_id:id})),error:null};else res={data:[],error:null};return Promise.resolve(res).then(ok);};
    return q;};
  rows=window.__rows=rows;`, c);
  return c;
}
const run = (c, s) => vm.runInContext(s, c, {timeout: 300000});
const state = c => JSON.parse(run(c, `JSON.stringify({items:bellItems.map(x=>x.r.id),count:document.getElementById('bell-count').textContent,hidden:document.getElementById('bell-count').hidden,
  seen:writes.filter(w=>w[0]==='retail_review_seen').map(w=>w[2].review_id),other:writes.filter(w=>w[0]!=='retail_review_seen').length})`));
(async () => {
  let c = fresh('manager'); await run(c, 'refreshReviewCounts()'); let s = state(c);
  out.push(['two new decisions: the red count shows 2', s.items.length === 2 && String(s.count) === '2' && !s.hidden]);
  run(c, `renderBell()`); const html = run(c, `document.getElementById('bell-menu').innerHTML`);
  out.push(['each notification has its red cross (44 px button, named)', (html.match(/class="bell-x"/g) || []).length === 2 && /aria-label="Dismiss: /.test(html)]);
  run(c, `dismissBellItem({stopPropagation(){}}, 0)`); await run(c, 'Promise.resolve()'); s = state(c);
  out.push(['the cross reads one: count 1, read for this account, nothing else written', s.items.length === 1 && String(s.count) === '1' && s.seen.join() === 'n1' && s.other === 0]);
  run(c, `dismissBellItem({stopPropagation(){}}, 0)`); await run(c, 'Promise.resolve()'); s = state(c);
  out.push(['no notification left: no red count', s.items.length === 0 && s.hidden]);
  await run(c, 'refreshReviewCounts()'); s = state(c);
  out.push(['refreshed: read ones stay read', s.items.length === 0 && s.hidden]);
  c = fresh('manager'); await run(c, 'refreshReviewCounts()');
  out.push(['clicking does not read: only the planning shown does', run(c, `(()=>{var o=openStoreMonth;openStoreMonth=async()=>{};openBellItem(0);openStoreMonth=o;return bellItems.length===2&&!writes.length})()`)]);
  run(c, 'renderMonthlyPlanning()'); await run(c, 'Promise.resolve()'); s = state(c);
  out.push(['November shown: its notification goes, December stays', s.items.join() === 'n2' && s.seen.join() === 'n1' && String(s.count) === '1' && s.other === 0]);
  c = fresh('manager'); await run(c, 'refreshReviewCounts()');
  run(c, `var keep=agents;agents=[];renderMonthlyPlanning();agents=keep;`); s = state(c);
  out.push(['nothing shown (no planning drawn): nothing read', s.items.length === 2 && !s.seen.length]);
  run(c, `var r=pickMonthlyPlan();currentStoreId='other';r.paint();currentStoreId=rows[0].store_id;`); s = state(c);
  out.push(['a planning refused by the screen (another store): nothing read', s.items.length === 2 && !s.seen.length]);
  c = fresh('manager'); run(c, 'renderMonthlyPlanning()'); await run(c, 'refreshReviewCounts()'); await run(c, 'Promise.resolve()'); s = state(c);
  out.push(['November already shown when the notifications arrive: its one is read at once', s.items.join() === 'n2' && s.seen.join() === 'n1']);
  c = fresh('director'); await run(c, 'refreshReviewCounts()');
  run(c, `monthReview=Object.assign({},pend[0]);renderMonthlyPlanning();`); await run(c, 'Promise.resolve()'); s = state(c);
  out.push(['director: the planning to review shown, its notification goes, it stays to review', s.seen.join() === 'p1' && s.hidden && s.other === 0 &&
    run(c, `monthReview.status==='pending'&&document.getElementById('nav-review-count').textContent==1`)]);
  c = fresh('director'); run(c, `pend=[];rows=[];`); await run(c, 'refreshReviewCounts()'); s = state(c);
  out.push(['nothing new: no red count', s.items.length === 0 && s.hidden]);
  console.log(out.map(x => (x[1] ? 'OK   ' : 'FAIL ') + x[0]).join('\n'));
  process.exitCode = out.every(x => x[1]) ? 0 : 1;
})();
