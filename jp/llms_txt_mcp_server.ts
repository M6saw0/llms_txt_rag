import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";  // データ検証とスキーマ定義のためのライブラリ
import { zodToJsonSchema } from "zod-to-json-schema";
import { fetchRagContext } from "./llms_txt_module";
import "dotenv/config";


// Create an MCP server
const server = new Server({
    name: "llms-txt-rag-context-server",
    version: "0.0.1"
}, {
    capabilities: {
        tools: {},
    }
});

// 入力スキーマを定義
const fetchRagContextSchema = z.object({
    userQuery: z.string().describe("ユーザーからの質問やリクエスト"),
});

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "fetch_github_rag_context",
                description: (
                    "社内のGitHubリポジトリからユーザーの質問に関連する情報を取得します。" +
                    "GitHubレポジトリには、プロジェクトや研究開発で使用したコードや社内ドキュメントが含まれます。"
                ),
                inputSchema: zodToJsonSchema(fetchRagContextSchema),
            }
        ]
    }
});

// ツールの実装
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const { name, arguments: args } = request.params;
        switch (name) {
            case "fetch_github_rag_context": {
                try {
                    const { userQuery } = fetchRagContextSchema.parse(args);
                    const result = await fetchRagContext(userQuery);
                    return {
                        content: [{ type: "text", text: result }],
                    };
                } catch (error: unknown) {
                    return {
                        content: [{ type: "text", text: "エラー: " + (error instanceof Error ? error.message : String(error)) }],
                    };
                }
            }
            default: {
                throw new Error(`未知のツール: ${name}`);
            }
        }
    } catch (error: unknown) {
        return {
            content: [{ type: "text", text: "エラー: " + (error instanceof Error ? error.message : String(error)) }],
        };
    }
});

// サーバーを起動
async function runServer() {
    // const transport = new StdioServerTransport();
    // await server.connect(transport);
    // console.error("LLMs TXT RAG Context MCP サーバーが stdio で実行中です");

    const app = express();
    const transports: {[sessionId: string]: SSEServerTransport} = {};
    app.get("/sse", async (_: Request, res: Response) => {
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    res.on("close", () => {
        delete transports[transport.sessionId];
    });
    await server.connect(transport);
    });
    app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(400).send('No transport found for sessionId');
    }
    });
    app.listen(3001);
}

// サーバーを起動
console.log("サーバーを起動します...");
runServer().catch((error) => {
    console.error("サーバー実行中の致命的なエラー:", error);
    process.exit(1);
}); 
