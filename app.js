'use strict';
const KEY = 'fx-journal.trades.v1';
const form = document.querySelector('#trade-form');
const $ = selector => document.querySelector(selector);
let trades = [];
let editing = null;
let storageBlocked = false;
let messageTimer;
let currency = 'JPY';
const yen = value => `${value < 0 ? '−' : value > 0 ? '+' : ''}${currency==='JPY'?'¥':currency+' '}${Math.abs(value).toLocaleString('ja-JP', {maximumFractionDigits: 2})}`;
function message(text) {
  $('#message').textContent = text;
  $('#message').classList.add('visible');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => $('#message').classList.remove('visible'), 6000);
}
function validTrade(t) {
  return t && typeof t.id === 'string' && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && typeof t.pair === 'string' && ['buy','sell'].includes(t.side) && Number.isFinite(t.pnl) && typeof t.note === 'string';
}
try {
  const raw = localStorage.getItem(KEY);
  if (raw !== null) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(validTrade)) throw new Error('Invalid stored data');
    trades = parsed;
  }
} catch {
  storageBlocked = true;
  message('保存データを読み込めませんでした。既存データを保護するため、新しい保存を停止しています。');
}
function persist(next) {
  if (storageBlocked) { message('保存データを読み込めないため変更できません。ブラウザーの保存設定を確認してください。'); return false; }
  try { localStorage.setItem(KEY, JSON.stringify(next)); trades = next; return true; }
  catch { message('保存できませんでした。ブラウザーの保存容量・設定を確認してください。入力内容は保持しています。'); return false; }
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function resetForm() {
  editing = null; form.reset(); form.elements.date.value = today();
  $('#form-title').textContent = '取引を記録'; $('#save').textContent = '＋ 取引を保存'; $('#cancel').hidden = true;
}
function moneyStyle(el, value) { el.textContent = yen(value); el.classList.toggle('positive', value > 0); el.classList.toggle('negative', value < 0); }
function render() {
  const currencyTrades = trades.filter(t => (t.currency || 'JPY') === currency);
  const total = currencyTrades.reduce((sum,t) => sum+t.pnl,0);
  const wins = currencyTrades.filter(t=>t.pnl>0).length;
  moneyStyle($('#total'),total); moneyStyle($('#average'),currencyTrades.length ? total/currencyTrades.length : 0);
  $('#rate').textContent = currencyTrades.length ? `${(wins/currencyTrades.length*100).toFixed(1)}%` : '—';
  $('#wins').textContent = `${wins}勝 / ${currencyTrades.length}取引（損益ゼロも含む）`;
  $('#count').textContent = `${currencyTrades.length} 回`;
  const query = $('#search').value.trim().toLowerCase();
  const filter = $('#filter').value;
  const visible = currencyTrades.filter(t=>(`${t.pair} ${t.note}`.toLowerCase().includes(query)) && (filter==='all'||filter==='win'&&t.pnl>0||filter==='loss'&&t.pnl<0||filter==='even'&&t.pnl===0)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  $('#shown').textContent = `${visible.length} TRADES`;
  $('#export').disabled = trades.length===0;
  $('#empty').hidden = visible.length>0;
  $('#empty h3').textContent = trades.length ? '条件に一致する取引はありません' : '最初のトレードを記録しましょう';
  $('#empty p').textContent = trades.length ? '検索条件や絞り込みを変更してください。' : '小さな振り返りが、次のトレードのヒントに。';
  $('#trades').replaceChildren();
  for (const t of visible) {
    const row = document.createElement('tr');
    const detail = document.createElement('td');
    const date = document.createElement('small'); date.textContent = t.date.replaceAll('-','.');
    const pair = document.createElement('strong'); pair.textContent = t.pair;
    detail.append(date,pair);
    if(t.note){const note=document.createElement('div');note.className='note';note.textContent=t.note;detail.append(note);}
    const side=document.createElement('td');const badge=document.createElement('span');badge.className=`badge ${t.side}`;badge.textContent=t.side==='buy'?'BUY':'SELL';side.append(badge);
    const pnl=document.createElement('td');pnl.className='right money';moneyStyle(pnl,t.pnl);
    const actions=document.createElement('td');actions.className='right row-actions';
    if(t.source==='mt5'){const source=document.createElement('span');source.className='mt5-source';source.textContent='MT5・閲覧専用';detail.append(source);}
    for(const [label,action] of [['編集','edit'],['削除','delete']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.id=t.id;button.dataset.action=action;button.setAttribute('aria-label',`${t.date} ${t.pair}を${label}`);if(t.source!=='mt5')actions.append(button);}
    row.append(detail,side,pnl,actions);$('#trades').append(row);
  }
}
form.addEventListener('submit',event=>{
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data=new FormData(form); const pnl=Number(data.get('pnl'));
  if(!Number.isFinite(pnl)) return;
  const t={id:editing || crypto.randomUUID(),date:data.get('date'),pair:data.get('pair'),side:data.get('side'),pnl,currency,note:data.get('note').trim()};
  const wasEditing=Boolean(editing);
  const next=editing ? trades.map(old=>old.id===editing?t:old) : [...trades,t];
  if(persist(next)){resetForm();render();message(wasEditing?'取引を更新しました':'取引を保存しました');}
});
$('#cancel').addEventListener('click',resetForm);
$('#search').addEventListener('input',render);$('#filter').addEventListener('change',render);
$('#trades').addEventListener('click',event=>{
  const button=event.target.closest('button[data-id]');if(!button)return;
  const t=trades.find(t=>t.id===button.dataset.id);if(!t||t.source==='mt5')return;
  if(button.dataset.action==='delete'){
    if(!confirm(`${t.date} ${t.pair} の取引を削除しますか？`))return;
    if(persist(trades.filter(old=>old.id!==t.id))){if(editing===t.id)resetForm();render();message('取引を削除しました');}
  }else{
    editing=t.id;for(const key of ['date','pair','side','pnl','note'])form.elements[key].value=t[key];
    $('#form-title').textContent='取引を編集';$('#save').textContent='変更を保存';$('#cancel').hidden=false;
    form.scrollIntoView({behavior:'smooth',block:'center'});form.elements.date.focus({preventScroll:true});
  }
});
$('#export').addEventListener('click',()=>{
  // Prefix text that spreadsheet applications could interpret as formulas.
  const cell=value=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['取引日','通貨ペア','売買方向','確定損益','通貨','メモ'],...trades.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,t.pair,t.side==='buy'?'買い':'売り',t.pnl,t.currency||'JPY',t.note])];
  const csv='\uFEFF'+rows.map(row=>row.map((v,i)=>typeof v==='number'?String(v):cell(v)).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`fx-journal-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('CSVを出力しました');
});
window.addEventListener('storage',event=>{
  if(event.key===KEY){storageBlocked=true;$('#save').disabled=true;message('別のタブで記録が変更されました。このページを再読み込みしてください。');}
});
resetForm();render();

$('#currency').addEventListener('change',()=>{
  currency=$('#currency').value;
  document.querySelectorAll('.currency-label').forEach(el=>el.textContent=currency);
  resetForm();render();
});
let syncSession=null, syncBusy=false, syncInterval=null;
function disconnect(){
  syncSession=null;clearInterval(syncInterval);syncInterval=null;
  $('#sync-token').value='';$('#sync-status').textContent='未接続';
}
$('#disconnect').addEventListener('click',disconnect);
async function syncMT5(){
  if(!syncSession||syncBusy||document.hidden)return;
  const session=syncSession;syncBusy=true;$('#sync-status').textContent='同期中…';
  try{
    let after='',incoming=[],pages=0;
    do{
      const url=new URL('/trades',session.url);if(after)url.searchParams.set('after',after);
      const response=await fetch(url,{headers:{Authorization:'Bearer '+session.token},cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!response.ok)throw new Error(response.status===401?'閲覧用キーを確認してください':'接続先・サーバー設定を確認してください');
      const data=await response.json();
      if(!Array.isArray(data.trades)||!data.trades.every(t=>validTrade(t)&&t.source==='mt5'&&/^mt5:[A-Za-z0-9_-]{1,40}:\d{1,20}$/.test(t.id)&&/^[A-Z]{3}$/.test(t.currency))||!(data.next===null||typeof data.next==='string'))throw new Error('サーバーからのデータ形式が不正です');
      incoming.push(...data.trades);
      if(data.next===after||++pages>1000)throw new Error('同期データが大きすぎるかページ情報が不正です');
      after=data.next;
    }while(after);
    if(syncSession!==session)return;
    const map=new Map(trades.map(t=>[t.id,t]));
    for(const t of incoming)map.set(t.id,{id:t.id,date:t.date,pair:t.pair,side:t.side,pnl:t.pnl,note:t.note,currency:t.currency,source:'mt5'});
    if(!persist([...map.values()]))throw new Error('ブラウザーへの保存に失敗しました');
    for(const t of incoming){if(![...$('#currency').options].some(o=>o.value===t.currency)){const option=document.createElement('option');option.textContent=t.currency;$('#currency').append(option);}}
    render();$('#sync-status').textContent=`${new Date().toLocaleTimeString('ja-JP')} 同期済み・${incoming.length}件`;
  }catch(error){if(syncSession===session)$('#sync-status').textContent='同期失敗：'+(error instanceof TypeError?'接続先・通信許可を確認してください':error.message);}
  finally{syncBusy=false;}
}
$('#sync-form').addEventListener('submit',event=>{
  event.preventDefault();let url;
  try{url=new URL($('#sync-url').value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error();}
  catch{message('接続先には https:// から始まるサーバーのルートURLを入力してください');return;}
  const token=$('#sync-token').value.trim();if(token.length<32)return;
  disconnect();syncSession={url:url.origin,token};
  syncMT5();syncInterval=setInterval(syncMT5,60000);
});

for(const t of trades){if(t.currency&&!Array.from($('#currency').options).some(o=>o.value===t.currency)){const o=document.createElement('option');o.textContent=t.currency;$('#currency').append(o);}}
