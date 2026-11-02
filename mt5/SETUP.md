# Windows MT5 → FX JOURNAL 自動連携

現時点ではコードの準備段階です。受信サーバーの作成・公開と Windows の MetaEditor でのコンパイル、デモ口座による実機確認が必要です。MT5実機での動作確認はまだ行っていません。

## 仕組み

Windows PC の MT5 → Cloudflare Worker（送信用キーで認証）→ D1 データベース → FX JOURNAL（別の閲覧用キーで認証）。EAは発注関数を使用せず、決済済みポジションの履歴だけを送ります。ログインパスワードは送信しません。ポジションID・銘柄・方向・決済日・確定損益・口座通貨がクラウドに保存されます。

円口座とドル口座などを別々に接続できます。損益は口座通貨のまま保存し、画面で通貨を切り替えて集計します。為替換算は行いません。手入力取引と自動連携取引の重複は自動判定しないため、同じ取引を両方で登録しないでください。

## 1. Cloudflareのアカウント作成

1. https://dash.cloudflare.com/sign-up でアカウントを作成し、メール確認を完了します。
2. Workers & Pages を利用できる状態にします。独自ドメインは不要です。料金・無料枠は契約前にCloudflareの現在の案内を確認してください。
3. WindowsにNode.jsのLTS版とGitをインストールします。PowerShellで `node --version`、`npm --version`、`git --version` を確認します。
4. 以下を実行します（既にクローン済みならそのフォルダーを利用）。

```powershell
git clone https://github.com/poyo0422/ryo.git
cd ryo/server
npx wrangler@4 login
npx wrangler@4 d1 create fx-journal
```

最後に表示された `database_id` を `server/wrangler.jsonc` の `REPLACE_WITH_DATABASE_ID` に設定します。`ALLOWED_ORIGIN` は `https://poyo0422.github.io` のままにします（末尾の /ryo/ は含めません）。

## 2. データベースと認証キーの設定

`ryo/server` フォルダーで実行：

```powershell
npx wrangler@4 d1 execute fx-journal --remote --file=schema.sql
npx wrangler@4 secret put WRITE_TOKEN
npx wrangler@4 secret put READ_TOKEN
npx wrangler@4 deploy
```

それぞれの `secret put` の入力画面に、**異なる2つのランダムなキー**（各32文字以上、推奨64桁のランダム16進文字列）を設定します。パスワード管理ソフトの生成機能などを使用してください。キーはパスワード管理ソフトに保存し、チャット、Git、スクリーンショットに載せないでください。WRITE_TOKENはMT5専用、READ_TOKENはブラウザー専用です。どちらも取引情報へのアクセス権を持つ秘密情報です。

デプロイで表示された `https://fx-journal-sync.…workers.dev` を控えます。もし同名Workerが既にある場合はwrangler設定のnameを変更してください。この構成はあなた専用の1環境です。複数人の口座を同じサーバーへ接続しないでください。

## 3. MT5へのEA導入

1. [FXJournalSync.mq5](FXJournalSync.mq5) をダウンロードします。
2. MT5の「ファイル → データフォルダを開く」→ `MQL5/Experts` に保存します。
3. MetaEditorで開いてF7でコンパイルします。エラーがある場合はEAを動かさず、**キーを含めずエラー文だけ**を共有してください。
4. MT5の「ツール → オプション → エキスパートアドバイザ」で「WebRequestを許可するURLリスト」に、WorkerのHTTPSルートURLを追加します。
5. まずデモ口座のチャート1枚にEAを配置し、パラメーターを設定します。

| 項目 | 設定 |
| --- | --- |
| ServerURL | WorkerのルートURL。末尾のスラッシュと `/trades` は付けない |
| WriteToken | WRITE_TOKEN（READ_TOKENではありません） |
| AccountAlias | 口座ごとに異なる任意の英数字・ハイフン・アンダースコア（例 `jpy-main`、`usd-main`）。1〜40文字 |
| SyncSeconds | 60（30以上） |
| HistoryDays | 90（初回取り込み・再送する決済日の期間。必要なら拡大） |

同じ口座のEAは1つにします。別口座は別のMT5ターミナルで起動し、必ず別のAccountAliasを使ってください。別口座に同じAliasを再利用すると記録が上書きされる可能性があります。口座切替後はEAを再設定してください。設定ファイル（.set）には送信用キーが含まれるので公開しないでください。

MT5とPCが起動し、ネットに接続している間だけ自動送信します。停止中の取引も再起動後にHistoryDaysの期間内なら再送します。WebRequestはストラテジーテスターで動かないため、実ターミナルのデモ口座で検証します。

## 4. アプリ接続と確認

1. https://poyo0422.github.io/ryo/ のMT5自動連携欄にWorkerのルートURLと **READ_TOKEN** を入力します。
2. 「接続して同期」を押します。閲覧用キーはこのタブのメモリー内だけに保持され、再読み込み後は再入力が必要です。
3. デモ口座で決済した取引を使い、MT5のエキスパートログ、画面の最終同期時刻・件数を確認します。完全に決済したポジションが1〜2分程度で反映されるか確認してください。
4. 同じ履歴を複数回送信しても行数が増えないこと、再読み込み後も記録が残ること、JPYとUSDの合計が別々になることを確認します。
5. MT5履歴と、銘柄・方向・決済日・通貨・損益を照合してから実口座で使用します。

## 集計範囲と制約

- 1記録 = 完全に決済済みの1ポジション。分割決済は全量決済後にまとめます。取引回数・勝率もポジション単位です。
- 損益は取得できた同ポジションの全約定の profit + commission + swap + fee。別途の残高操作・ポジションと結び付かない手数料・入出金は含めません。
- 日付はブローカーのサーバー日付です。日本時間への変換はしません。
- ネッティング口座の反転売買（DEAL_ENTRY_INOUT）は未対応で、そのポジションは送信せずMT5ログにスキップ件数を表示します。
- ブローカーが提供する履歴が欠落している場合は完全な再現は保証できません。送信前に全量決済と入出数量を確認していますが、照合は必要です。
- 毎回HistoryDaysの履歴を再送します。同じIDは上書きされ、再送で二重計上しません。履歴が多い場合はPC・Workerの負荷とCloudflareの使用量を確認してください。
- MT5由来の行は閲覧専用です。接続解除してもローカル記録とクラウドの履歴は残ります。データ削除・口座分離・複数利用者のログインは今後の機能です。
- 公開Webページに履歴やキーを埋め込みません。同期した履歴はそのブラウザーにも保存されます。共有PCでは使用しないでください。

## 接続できない場合

- HTTP 401：READ_TOKEN / WRITE_TOKENの取り違え・入力を確認。
- HTTP 503：Workerの2つのキーが32文字以上か、別々か、D1接続とスキーマが設定済みか確認。
- MT5 HTTP -1：WebRequestの許可リスト、HTTPS URL、ネット接続、ターミナルのエラーコードを確認。
- ブラウザーだけ失敗：ALLOWED_ORIGINが公開サイトのオリジンと一致するか確認。
- キーを漏らした場合：Workerで該当キーを変更し、MT5またはブラウザーで再設定。
