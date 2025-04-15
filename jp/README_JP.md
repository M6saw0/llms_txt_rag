# llms.txtを使用したRAG MCP

## 概要
GitHubリポジトリから関連する情報を取得するためのMCPサーバーとクライアントを作成します。
特にllms.txtを使用してレポジトリとファイルを検索します。llms.txtは生成AIのみを使用して、作成・更新・検索が可能なため、最新情報を維持しやすいです。


## 事前準備
Windows 11での動作を確認しています。

### .envの作成
.env.templateを参考に.envを作成してください。
GitHubのPersonal Access Tokenには以下の権限を付与してください。
- Actions: Read and Write
- Commit statuses: Read and Write
- Contents: Read and Write
- Environments: Read-Only
- Pull requests: Read and Write
- Secrets: Read-Only
- Variables: Read-only

### ライブラリインストール
以下のコマンドを実行してください。
```bash
npm install
```


## 実行手順
### llms.txtの作成
create_first_llms_txt.tsを実行することで、llms.txtを作成します。
実行が完了すると、`LLMS_TXT_REPOSITORY` に"<レポジトリ名>/llms.txt" が作成されます。
以下は実行後のレポジトリの例です。
```
sample_repository/
└── llms.txt
sample_repository2/
└── llms.txt
```

### サーバーの起動
SSEを使用してサーバーを起動します。今回はlocalhostを指定していますが、外部で起動する場合は適宜ホスト名を変更してください。
```bash
npx tsx llms_txt_mcp_server.ts
```

### クライアントの起動
```bash
npx tsx llms_txt_mcp_client.ts
```

エディタでMCPとして利用する場合は以下のように設定します。
```json
{
  "mcpServers": {
    "llms-txt-rag-server": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```
