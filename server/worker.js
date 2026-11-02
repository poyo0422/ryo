// Single-owner service. Tokens are Worker secrets, never committed to Git.
const encoder = new TextEncoder();
async function matches(actual, expected) {
  if (!expected || expected.length < 32) return false;
  const hash = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const [a,b] = await Promise.all([hash(actual),hash(expected)]);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
function valid(t) {
  if(!t || typeof t.id!=='string'||!/^mt5:[A-Za-z0-9_-]{1,40}:\d{1,20}$/.test(t.id))return false;
  if(typeof t.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.date))return false;
  const date=new Date(t.date+'T00:00:00Z');
  return !isNaN(date)&&date.toISOString().slice(0,10)===t.date&&typeof t.pair==='string'&&t.pair.length>0&&t.pair.length<=64&&['buy','sell'].includes(t.side)&&Number.isFinite(t.pnl)&&Math.abs(t.pnl)<=1e12&&typeof t.currency==='string'&&/^[A-Z]{3}$/.test(t.currency)&&typeof t.note==='string'&&t.note.length<=2000;
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
    if(origin===env.ALLOWED_ORIGIN)headers['Access-Control-Allow-Origin']=origin;
    const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(origin&&origin!==env.ALLOWED_ORIGIN)return respond({error:'Origin not allowed'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
    const url=new URL(request.url);
    if(url.pathname!=='/trades')return respond({error:'Not found'},404);
    if(!['GET','POST'].includes(request.method))return respond({error:'Method not allowed'},405);
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
    const secret=request.method==='GET'?env.READ_TOKEN:env.WRITE_TOKEN;
    if(!env.READ_TOKEN||!env.WRITE_TOKEN||env.READ_TOKEN===env.WRITE_TOKEN||env.READ_TOKEN.length<32||env.WRITE_TOKEN.length<32)return respond({error:'Server tokens are not configured'},503);
    if(!await matches(token,secret))return respond({error:'Unauthorized'},401);
    try {
      if(request.method==='GET'){
        const after=url.searchParams.get('after')||'';
        if(after.length>100)return respond({error:'Invalid cursor'},400);
        const {results}=await env.DB.prepare('SELECT id, payload FROM trades WHERE id > ? ORDER BY id LIMIT 201').bind(after).all();
        const page=results.slice(0,200);
        return respond({trades:page.map(row=>JSON.parse(row.payload)),next:results.length>200?page.at(-1).id:null});
      }
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return respond({error:'JSON required'},415);
      if(Number(request.headers.get('Content-Length'))>65536)return respond({error:'Body too large'},413);
      // Bound streamed input too; Content-Length may be absent or forged.
      if(!request.body)return respond({error:'Missing body'},400);
      const reader=request.body.getReader();const chunks=[];let size=0;
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return respond({error:'Body too large'},413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return respond({error:'Invalid JSON'},400);}
      if(!Array.isArray(body.trades)||body.trades.length<1||body.trades.length>50||!body.trades.every(valid))return respond({error:'Invalid trades (fully closed positions only)'},400);
      const now=new Date().toISOString();
      // Allowlisted fields only. The stable account alias + position ID makes retries idempotent.
      const statements=body.trades.map(t=>{
        const clean={id:t.id,date:t.date,pair:t.pair,side:t.side,pnl:t.pnl,note:t.note,currency:t.currency,source:'mt5'};
        return env.DB.prepare('INSERT INTO trades (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(t.id,JSON.stringify(clean),now);
      });
      await env.DB.batch(statements);return respond({saved:statements.length});
    }catch{return respond({error:'Storage unavailable; retry later'},503);}
  }
};
