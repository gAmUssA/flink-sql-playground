
const base=process.argv[2], users=+process.argv[3], rounds=+(process.argv[4]||3);
const DDL="CREATE TEMPORARY TABLE o (c STRING, amount DOUBLE) WITH ('connector'='faker','number-of-rows'='200','fields.c.expression'='#{Name.fullName}','fields.amount.expression'='#{Number.randomDouble ''2'',''5'',''500''}')";
const Q="SELECT c, ROUND(SUM(amount),2) s FROM o GROUP BY c ORDER BY s DESC";
const lat={create:[],ddl:[],batch:[],stream:[]}, err={};
const bump=k=>err[k]=(err[k]||0)+1;
async function timed(kind,fn){const t=performance.now();try{const r=await fn();lat[kind].push(performance.now()-t);return r}catch(e){bump(kind+':'+e.message);return null}}
async function post(url,body){const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const tx=await r.text();if(!r.ok)throw new Error(r.status+' '+(tx.match(/"code":"(\w+)"/)||[])[1]);return tx}
// A stream answers 200 even when the query fails: the failure is an error frame, and a good run ends with an end frame.
function checkStream(tx){const f=tx.split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return {type:'garbage'}}});const e=f.find(x=>x.type==='error');if(e)throw new Error('stream error '+(e.code||'?'));if(!f.some(x=>x.type==='end'))throw new Error('stream without end frame');return tx}
async function user(){
  const s=await timed('create',async()=>JSON.parse(await post('/api/sessions')).sessionId||null);
  if(!s)return;
  for(let i=0;i<rounds;i++){
    await timed('ddl',()=>post('/api/sessions/'+s+'/execute',{sql:DDL,mode:'BATCH'}));
    await timed('batch',()=>post('/api/sessions/'+s+'/execute',{sql:Q,mode:'BATCH'}));
    await timed('stream',async()=>checkStream(await post('/api/sessions/'+s+'/execute/stream',{sql:"SELECT c, ROUND(SUM(amount),2) s FROM o GROUP BY c",mode:'STREAMING'})));
  }
  await fetch(base+'/api/sessions/'+s,{method:'DELETE'});
}
const q=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))].toFixed(0):'-';
const t0=performance.now();
await Promise.all(Array.from({length:users},user));
console.log(JSON.stringify({users,rounds,wallSec:((performance.now()-t0)/1000).toFixed(1),
 ...Object.fromEntries(Object.entries(lat).map(([k,a])=>[k,{n:a.length,p50:q(a,.5),p95:q(a,.95),max:q(a,1)}])),errors:err}));
