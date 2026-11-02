#property strict
#property version "1.00"
#property description "Read-only closed-position exporter for FX JOURNAL. Never places orders."
input string ServerURL = "https://YOUR-WORKER.workers.dev";
input string WriteToken = "";
input string AccountAlias = "mt5-main"; // Unique per broker/account; do not reuse for another account.
input int SyncSeconds = 60;
input int HistoryDays = 90;
bool busy=false;
long initial_login=0;
string initial_server="";
string JsonEscape(string s) {
  StringReplace(s,"\\","\\\\"); StringReplace(s,"\"","\\\"");
  StringReplace(s,"\r","\\r");StringReplace(s,"\n","\\n");StringReplace(s,"\t","\\t");
  return s;
}
bool IsOpen(ulong identifier) {
  for(int i=0;i<PositionsTotal();i++) {
    if(PositionGetTicket(i)>0 && (ulong)PositionGetInteger(POSITION_IDENTIFIER)==identifier) return true;
  }
  return false;
}
bool Send(string payload) {
  char data[],result[];string headers;
  int count=StringToCharArray(payload,data,0,WHOLE_ARRAY,CP_UTF8);
  if(count<1)return false;ArrayResize(data,count-1);
  ResetLastError();
  int status=WebRequest("POST",ServerURL+"/trades","Content-Type: application/json\r\nAuthorization: Bearer "+WriteToken+"\r\n",10000,data,result,headers);
  if(status!=200){Print("FX JOURNAL: sync failed. HTTP=",status," terminal error=",GetLastError(),". Check URL, token and WebRequest allowlist; retry next timer.");return false;}
  return true;
}
void SyncHistory() {
  if(busy||!TerminalInfoInteger(TERMINAL_CONNECTED))return;
  if(AccountInfoInteger(ACCOUNT_LOGIN)!=initial_login||AccountInfoString(ACCOUNT_SERVER)!=initial_server){Print("FX JOURNAL: account changed. Remove and reattach EA with a unique AccountAlias.");EventKillTimer();return;}
  busy=true;
  // Rescan the configured lookback every time so missed requests are retried.
  datetime end=TimeCurrent();
  if(!HistorySelect(end-(datetime)((long)HistoryDays*86400),end)){busy=false;return;}
  ulong ids[];int total=HistoryDealsTotal();
  for(int i=0;i<total;i++){
    ulong deal=HistoryDealGetTicket(i);if(deal==0)continue;
    long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
    if(entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_OUT_BY && entry!=DEAL_ENTRY_INOUT)continue;
    long type=HistoryDealGetInteger(deal,DEAL_TYPE);if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL)continue;
    ulong id=(ulong)HistoryDealGetInteger(deal,DEAL_POSITION_ID);if(id==0)continue;
    bool found=false;for(int j=0;j<ArraySize(ids);j++)if(ids[j]==id){found=true;break;}
    if(!found){int n=ArraySize(ids);ArrayResize(ids,n+1);ids[n]=id;}
  }
  int sent=0,skipped=0;
  for(int i=0;i<ArraySize(ids);i++){
    ulong id=ids[i];if(IsOpen(id))continue;
    if(!HistorySelectByPosition(id)) {Print("FX JOURNAL: position history unavailable; retry next timer.");break;}
    double pnl=0,volume_in=0,volume_out=0;string symbol="",side="";datetime closed=0;long first_msc=LONG_MAX;bool reversal=false;
    for(int j=0;j<HistoryDealsTotal();j++){
      ulong deal=HistoryDealGetTicket(j);if(deal==0)continue;
      pnl+=HistoryDealGetDouble(deal,DEAL_PROFIT)+HistoryDealGetDouble(deal,DEAL_COMMISSION)+HistoryDealGetDouble(deal,DEAL_SWAP)+HistoryDealGetDouble(deal,DEAL_FEE);
      long type=HistoryDealGetInteger(deal,DEAL_TYPE);if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL)continue;
      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry==DEAL_ENTRY_INOUT){reversal=true;continue;}
      if(entry==DEAL_ENTRY_IN){
        volume_in+=HistoryDealGetDouble(deal,DEAL_VOLUME);
        long msc=HistoryDealGetInteger(deal,DEAL_TIME_MSC);
        if(msc<first_msc){first_msc=msc;symbol=HistoryDealGetString(deal,DEAL_SYMBOL);side=type==DEAL_TYPE_BUY?"buy":"sell";}
      }
      if(entry==DEAL_ENTRY_OUT||entry==DEAL_ENTRY_OUT_BY){volume_out+=HistoryDealGetDouble(deal,DEAL_VOLUME);datetime when=(datetime)HistoryDealGetInteger(deal,DEAL_TIME);if(when>closed)closed=when;}
    }
    // Reversals need separate attribution and are deliberately not guessed.
    if(reversal){skipped++;continue;}
    if(side==""||closed==0||volume_in<=0||MathAbs(volume_in-volume_out)>0.0000001||IsOpen(id))continue;
    string date=TimeToString(closed,TIME_DATE);StringReplace(date,".","-");
    string payload="{\"trades\":[{\"id\":\"mt5:"+AccountAlias+":"+(string)id+"\",\"date\":\""+date+"\",\"pair\":\""+JsonEscape(symbol)+"\",\"side\":\""+side+"\",\"pnl\":"+DoubleToString(pnl,2)+",\"currency\":\""+AccountInfoString(ACCOUNT_CURRENCY)+"\",\"note\":\"MT5自動連携・決済済みポジション\"}]}";
    if(!Send(payload))break;sent++;
  }
  Print("FX JOURNAL: sent ",sent," closed positions. Unsupported reversal positions skipped: ",skipped);
  busy=false;
}
int OnInit(){
  if(StringLen(AccountInfoString(ACCOUNT_CURRENCY))!=3)return INIT_PARAMETERS_INCORRECT;
  if(StringFind(ServerURL,"https://")!=0||StringLen(WriteToken)<32||HistoryDays<1||HistoryDays>3650||SyncSeconds<30)return INIT_PARAMETERS_INCORRECT;
  if(StringLen(AccountAlias)<1||StringLen(AccountAlias)>40)return INIT_PARAMETERS_INCORRECT;
  for(int i=0;i<StringLen(AccountAlias);i++){ushort c=StringGetCharacter(AccountAlias,i);if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'||c=='-'))return INIT_PARAMETERS_INCORRECT;}
  initial_login=AccountInfoInteger(ACCOUNT_LOGIN);initial_server=AccountInfoString(ACCOUNT_SERVER);
  EventSetTimer(SyncSeconds);Print("FX JOURNAL: read-only sync started. First sync after timer interval.");return INIT_SUCCEEDED;
}
void OnTimer(){SyncHistory();}
void OnDeinit(const int reason){EventKillTimer();}
