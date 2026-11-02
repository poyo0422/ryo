'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const STORAGE_KEY = 'fx-journal.trades.v1';
  const modules = [
    {id:'home',name:'ホーム',code:'COMMAND CENTER',icon:'⌘'},
    {id:'market',name:'気配値',code:'MARKET WATCH',icon:'⌁'},
    {id:'chart',name:'チャート',code:'CHART ANALYSIS',icon:'▥'},
    {id:'trade',name:'トレード',code:'TRADE MONITOR',icon:'⇄'},
    {id:'history',name:'取引履歴',code:'TRADE HISTORY',icon:'◷'},
    {id:'ai',name:'AI分析',code:'AI INTELLIGENCE',icon:'✧'},
    {id:'settings',name:'設定',code:'SYSTEM SETTINGS',icon:'⚙'}
  ];
  let selected=0, trades=[], currency='JPY', loadFailed=false;
  const dialog=$('#module-dialog');
  function loadHistory(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      if(!Array.isArray(saved)||!saved.every(t=>t&&typeof t.id==='string'&&typeof t.date==='string'&&Number.isFinite(t.pnl)&&(!t.currency||/^[A-Z]{3}$/.test(t.currency))))throw new Error();
      trades=saved;loadFailed=false;
      const currencies=[...new Set(trades.map(t=>t.currency||'JPY'))];
      if(currencies.length&&!currencies.includes(currency))currency=currencies[0];
    }catch{loadFailed=true;trades=[];}
    renderSummary();
  }
  const money=(value,code=currency)=>`${value<0?'−':value>0?'+':''}${code==='JPY'?'¥':code+' '}${Math.abs(value).toLocaleString('ja-JP',{maximumFractionDigits:2})}`;
  function summary(monthOnly=false){
    const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
    const list=trades.filter(t=>(t.currency||'JPY')===currency&&(!monthOnly||t.date.startsWith(month)));
    return {count:list.length,pnl:list.reduce((n,t)=>n+t.pnl,0),wins:list.filter(t=>t.pnl>0).length};
  }
  function renderSummary(){
    const s=summary();
    $('#summary-currency').textContent=currency;
    $('#summary-pnl').textContent=loadFailed?'読み込み不可':money(s.pnl);
    $('#summary-pnl').classList.toggle('negative',s.pnl<0);$('#summary-pnl').classList.toggle('positive',s.pnl>0);
    $('#summary-count').textContent=loadFailed?'—':`${s.count} 回`;
    $('#summary-rate').textContent=loadFailed||!s.count?'—':`${(s.wins/s.count*100).toFixed(1)}%`;
    const synced=trades.filter(t=>t.source==='mt5').length;
    $('#header-sync').textContent=loadFailed?'保存読込エラー':synced?`${synced}件保存 / 接続未確認`:'接続未確認';
  }
  function clock(){
    $('#clock').textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())+' JST';
    $('#clock').dateTime=new Date().toISOString();
  }
  clock();setInterval(clock,1000);$('#year').textContent=new Date().getFullYear();loadHistory();
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null)loadHistory();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadHistory();});
  const wheel=$('#wheel'),pagination=$('#wheel-pagination');
  modules.forEach((module,index)=>{
    const button=document.createElement('button');button.className='module';button.type='button';button.dataset.module=module.id;
    const icon=document.createElement('span');icon.className='module-icon';icon.textContent=module.icon;
    const text=document.createElement('div'),name=document.createElement('strong'),code=document.createElement('small');name.textContent=module.name;code.textContent=module.code;text.append(name,code);button.append(icon,text);
    button.addEventListener('click',()=>{if(suppressClick)return;if(index===selected)openModule(module.id);else select(index);});
    wheel.append(button);
    const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label',module.name+'を選択');dot.addEventListener('click',()=>select(index));pagination.append(dot);
  });
  function select(index){selected=(index+modules.length)%modules.length;renderWheel();}
  function renderWheel(){
    const compact=window.innerWidth<=760,step=compact?126:174;
    [...wheel.children].forEach((button,index)=>{
      let distance=(index-selected+modules.length)%modules.length;if(distance>3)distance-=modules.length;
      const abs=Math.abs(distance);
      button.style.transform=`translateX(${distance*step}px) translateZ(${-abs*(compact?75:95)}px) rotateY(${-distance*18}deg) scale(${1-abs*.055})`;
      button.style.opacity=abs>2?'0':String(1-abs*.23);button.style.zIndex=String(10-abs);
      button.style.pointerEvents=abs>2?'none':'auto';button.classList.toggle('active',index===selected);
      button.setAttribute('aria-current',index===selected?'true':'false');button.setAttribute('aria-label',modules[index].name+(index===selected?'を開く':'を選択'));
      button.tabIndex=abs>2?-1:0;
    });
    [...pagination.children].forEach((dot,i)=>{dot.classList.toggle('active',i===selected);dot.setAttribute('aria-pressed',String(i===selected));});
  }
  $('#previous').addEventListener('click',()=>select(selected-1));$('#next').addEventListener('click',()=>select(selected+1));
  window.addEventListener('resize',renderWheel);
  wheel.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();select(selected+(event.key==='ArrowRight'?1:-1));wheel.children[selected].focus();}});
  let startX=null,startY=0,startTime=0,suppressClick=false;
  $('#wheel-window').addEventListener('pointerdown',event=>{if(event.button!==0)return;startX=event.clientX;startY=event.clientY;startTime=performance.now();suppressClick=false;});
  window.addEventListener('pointerup',event=>{
    if(startX===null)return;const dx=event.clientX-startX,dy=event.clientY-startY,elapsed=performance.now()-startTime;startX=null;
    if(Math.abs(dx)>35&&Math.abs(dx)>Math.abs(dy)){
      suppressClick=true;const steps=Math.abs(dx)>190&&elapsed<350?2:1;select(selected+(dx<0?steps:-steps));setTimeout(()=>{suppressClick=false;},0);
    }
  });
  window.addEventListener('pointercancel',()=>{startX=null;});renderWheel();
  function paragraph(text){const p=document.createElement('p');p.textContent=text;return p;}
  function externalJournal(label,hash='') {const link=document.createElement('a');link.href='index.html'+hash;link.textContent=label+' ↗';return link;}
  function openModule(id){
    const module=modules.find(m=>m.id===id);$('#dialog-code').textContent=module?.code||'SYSTEM INFORMATION';$('#dialog-title').textContent=module?.name||({account:'MT5口座モニター',risk:'リスク監視',notifications:'通知・システムログ'}[id]||'システム');
    const content=$('#dialog-content');content.replaceChildren();
    if(id==='home'){
      content.append(paragraph('リテイナー司令室へようこそ。Phase 1のビジュアルプレビューです。3Dロールはドラッグ・スワイプ・矢印キーでも操作できます。中央のメニューをもう一度押すと詳細を開きます。'),paragraph('キャラクターは仮ホログラムです。正式な参考画像を受領した後に差し替えます。相場・口座情報・AIエンジンは未接続です。'));
    }else if(id==='market'){
      content.append(paragraph('LIVE QUOTES / 未接続。現在のEAは決済履歴のみ送信しており、Bid・Ask・スプレッドは取得していません。'));
      for(const symbol of ['XAUUSD','EURUSD','USDJPY','GBPUSD','AUDUSD','USDCAD']){const row=document.createElement('div');row.className='data-row';const name=document.createElement('span');name.textContent=symbol;const value=document.createElement('small');value.textContent='BID — / ASK — / 未取得';row.append(name,value);content.append(row);}
    }else if(id==='chart'){
      content.append(paragraph('CHART ENGINE / 準備中。ローソク足・時間足切り替え・テクニカル指標はPhase 2以降に追加します。メイン画面のライン装飾は価格チャートではありません。'));
    }else if(id==='trade'||id==='account'){
      content.append(paragraph('決済済みの取引履歴は、既存の認証付きMT5連携から取得できます。口座残高・有効証拠金・含み損益・保有ポジション・EAの現在の稼働状態は、今の送信データには含まれていません。'),externalJournal('取引管理・同期画面を開く'));
    }else if(id==='history'){
      loadHistory();const s=summary();
      content.append(paragraph(loadFailed?'保存データを読み込めませんでした。取引画面で確認してください。':`このブラウザーの保存済み履歴：${currency} / ${s.count}件 / 損益 ${money(s.pnl)}。ライブ接続やMT5の現在の状態を示すものではありません。`),externalJournal('取引履歴を開く','#trades'));
    }else if(id==='ai'){
      content.append(paragraph('AI ENGINE / 未接続。現在のパイロットは、保存済み履歴の集計と操作案内を返すローカルガイドです。生成AI・ライブ市場分析は実行していません。'),paragraph('今後：市場環境、上昇・下落シナリオ、重要価格帯、経済イベント、リスク評価を、取得時刻とデータ源付きで表示します。AIサービスのキーはサーバー側に保管します。'));
    }else if(id==='settings'){
      const label=document.createElement('label');label.textContent='履歴サマリーの集計通貨';const select=document.createElement('select');select.setAttribute('aria-label','サマリーの集計通貨');
      const options=[...new Set(['JPY','USD',...trades.map(t=>t.currency||'JPY')])];for(const code of options){const option=document.createElement('option');option.textContent=code;option.selected=code===currency;select.append(option);}
      select.addEventListener('change',()=>{currency=select.value;renderSummary();});label.append(select);
      content.append(label,paragraph('通貨は換算・合算しません。この選択は司令室の表示だけに適用されます。秘密キーの入力・MT5履歴の同期は、既存の取引画面で行います。'),externalJournal('MT5接続設定を開く','#sync-title'),paragraph('音声会話・LINE通知・ニュース・生成AI接続・リスク設定は将来の機能です。'));
    }else if(id==='risk'){
      content.append(paragraph('RISK SENTINEL / 未評価。口座残高・保有ポジションが未取得のため、日次損失上限や許容ロットの監視は実行していません。'),paragraph('構想上の初期設定：資金50,000円、1回の許容損失1%、日次上限3%、同時保有1件。現在の口座へ適用された設定ではありません。'));
    }else if(id==='notifications'){
      for(const [code,text] of [['INTERFACE','司令室のプレビューを起動しました。'],['MT5 HISTORY','履歴はこのブラウザーのローカル保存を参照。ライブ接続は取引画面で確認できます。'],['EXTERNAL SERVICES','市場・口座残高・生成AI・ニュース・LINEは未接続です。']]){const line=document.createElement('div');line.className='notification-entry';const name=document.createElement('small');name.textContent=code;line.append(name,document.createTextNode(text));content.append(line);}
    }
    if(!dialog.open)dialog.showModal();
  }
  document.querySelectorAll('[data-detail]').forEach(button=>button.addEventListener('click',()=>openModule(button.dataset.detail)));
  $('#notifications').addEventListener('click',()=>openModule('notifications'));$('#dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{const rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();});
  const chat=$('#chat-history');let replying=false;
  function addLine(text,role){const line=document.createElement('div');line.className='chat-line '+role;const name=document.createElement('small');name.textContent=role==='user'?'YOU':'RETAINER / LOCAL GUIDE';line.append(name,document.createTextNode(text));chat.append(line);while(chat.children.length>40)chat.firstChild.remove();chat.scrollTop=chat.scrollHeight;return line;}
  function showChat(){chat.hidden=false;$('#chat-toggle').setAttribute('aria-expanded','true');}
  function reply(text){
    loadHistory();
    if(/損益|成績|勝率|今月|取引回数/.test(text)){
      if(loadFailed)return '保存データの読み込みに失敗しました。取引画面で確認しましょう。';
      const month=/今月|月/.test(text),s=summary(month);
      return `${month?'今月（日本時間の月）':'保存済み'}の${currency}建て記録は${s.count}件、実現損益は${money(s.pnl)}、勝率は${s.count?(s.wins/s.count*100).toFixed(1)+'%':'集計対象なし'}です。決済日はブローカー日付を使用しています。記録全体の完全性や最新状態はMT5履歴と照合してください。他通貨は合算していません。`;
    }
    if(/接続|MT5|EA|稼働/.test(text))return 'MT5の決済履歴を表示する仕組みはありますが、この司令室では接続の生存確認を行っていません。取引画面で「接続して同期」を押し、MT5のエキスパートログと合わせて確認してください。EAの現在の稼働状態は未取得です。';
    if(/GOLD|ゴールド|価格|相場|買い|売り|指標|ニュース|SMC/i.test(text))return '現在、ライブ相場・経済指標・ニュースと生成AIは未接続です。GOLDの方向や重要価格帯を分析したとはお伝えできません。今は取引記録の振り返りと操作のご案内をお手伝いできます。';
    if(/予定|目標|LINE|音声/.test(text))return '予定・目標管理、LINE通知、音声会話は今後接続する機能です。現在はテキストによるローカルガイドモードです。';
    return '承知しました、マスター。現在はローカルガイドとして、保存済みの「今月の損益」や「MT5の接続状況」のご案内ができます。本物の生成AIによる自由会話はまだ接続していません。';
  }
  async function send(text){
    if(replying||!text.trim())return;replying=true;showChat();addLine(text,'user');$('#chat-input').value='';$('#chat-form button').disabled=true;
    const typing=addLine('応答を準備しています…','assistant');typing.classList.add('typing');
    await new Promise(resolve=>setTimeout(resolve,550));typing.remove();const answer=reply(text);addLine(answer,'assistant');$('#pilot-speech').textContent=answer;
    replying=false;$('#chat-form button').disabled=false;
  }
  $('#chat-form').addEventListener('submit',event=>{event.preventDefault();send($('#chat-input').value);});
  document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.prompt)));
  $('#chat-toggle').addEventListener('click',()=>{chat.hidden=!chat.hidden;$('#chat-toggle').setAttribute('aria-expanded',String(!chat.hidden));});
})();
