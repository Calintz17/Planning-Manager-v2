const {context}=require('./runner.cjs');const vm=require('vm'),fs=require('fs');
(async()=>{const c=context('CAST_v9_5_0_1_RETAIL_TEST.html');const result={};
vm.runInContext(`me={id:'u1',role:'manager',storeIds:['s1','s2'],countryIds:['fr','jp'],regionIds:['r1','r2']};applyScopeRules();`,c);
result.multiCountryManager={regionHidden:c.fixtureNodes.get('region-field').hidden,countryHidden:c.fixtureNodes.get('country-field').hidden,storeHidden:c.fixtureNodes.get('store-field').hidden};
vm.runInContext(`var regionQueries=0;workspaceStarted=false;sb.from=()=>{regionQueries++;return {select(){return this},order:async()=>({error:{message:'temporary error'}})}};showLoader=()=>{};hideLoader=()=>{};showToast=()=>{};`,c);
await vm.runInContext('startWorkspace()',c);await vm.runInContext('startWorkspace()',c);
result.retryAfterRegionError={queries:c.regionQueries,workspaceStarted:c.workspaceStarted};
vm.runInContext(`sb.auth={signInWithPassword:async()=>{throw Error('network failure')}};document.getElementById('login-email').value='manager@test.invalid';document.getElementById('login-pw').value='temporary';`,c);
try{await vm.runInContext('signIn()',c)}catch(e){result.signInNetworkFailure={caught:e.message,buttonDisabled:c.fixtureNodes.get('login-btn').disabled};}
console.log(JSON.stringify(result,null,2));fs.writeFileSync(__dirname+'/accounts-astra-results.json',JSON.stringify(result,null,2));})();
