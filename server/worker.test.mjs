import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('./worker.js',import.meta.url))).toString('base64'))).default;
const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const env={READ_TOKEN:'r'.repeat(64),WRITE_TOKEN:'w'.repeat(64),ALLOWED_ORIGIN:'https://poyo0422.github.io',DB:{
 prepare(sql){return {bind(...args){return {async all(){return {results:db.prepare(sql).all(...args)}},async run(){return db.prepare(sql).run(...args)}}}}},
 async batch(statements){db.exec('BEGIN');try{for(const s of statements)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
}};
const trade={id:'mt5:jpy-main:123',date:'2026-11-02',pair:'USDJPY',side:'buy',pnl:1234.5,note:'closed',currency:'JPY'};
const call=(method,token,body,origin=env.ALLOWED_ORIGIN,path='/trades')=>worker.fetch(new Request('https://sync.example'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
test('private, idempotent, validated, paginated and currency-preserving ingestion',async()=>{
 assert.equal((await call('GET')).status,401);
 assert.equal((await call('POST',env.READ_TOKEN,{trades:[trade]})).status,401);
 assert.equal((await call('GET',env.WRITE_TOKEN)).status,401);
 assert.equal((await call('GET',env.READ_TOKEN,undefined,'https://evil.example')).status,403);
 assert.equal((await call('POST',env.WRITE_TOKEN,{trades:[{...trade,date:'2026-02-31'}]})).status,400);
 assert.equal((await call('POST',env.WRITE_TOKEN,{trades:[{...trade,currency:'円'}]})).status,400);
 assert.equal((await call('POST',env.WRITE_TOKEN,{trades:[trade]},null)).status,200);
 assert.equal((await call('POST',env.WRITE_TOKEN,{trades:[{...trade,pnl:2000}]},null)).status,200);
 let response=await call('GET',env.READ_TOKEN);assert.equal(response.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);
 let data=await response.json();assert.equal(data.trades.length,1);assert.equal(data.trades[0].pnl,2000);assert.equal(data.trades[0].source,'mt5');
 assert.equal((await call('POST',env.WRITE_TOKEN,{trades:[{...trade,id:'mt5:usd-main:123',currency:'USD',pnl:20}]})).status,200);
 for(let i=0;i<205;i+=50){const batch=Array.from({length:Math.min(50,205-i)},(_,j)=>({...trade,id:`mt5:archive:${i+j}`}));assert.equal((await call('POST',env.WRITE_TOKEN,{trades:batch})).status,200);}
 data=await (await call('GET',env.READ_TOKEN)).json();assert.equal(data.trades.length,200);assert(data.next);
 const rest=await (await call('GET',env.READ_TOKEN,undefined,env.ALLOWED_ORIGIN,'/trades?after='+encodeURIComponent(data.next))).json();assert.equal(rest.trades.length,7);assert.equal(rest.next,null);
 const usd=rest.trades.find(t=>t.currency==='USD');assert.equal(usd.pnl,20);
 assert.equal((await call('POST',env.WRITE_TOKEN,{trades:[{...trade,note:'x'.repeat(70000)}]})).status,413);
 const preflight=await call('OPTIONS');assert.equal(preflight.status,204);
});
