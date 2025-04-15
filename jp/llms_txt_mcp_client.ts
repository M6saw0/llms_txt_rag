import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { PromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import "dotenv/config";

const RAG_PROMPT_TEMPLATE = `参考ファイルの情報を活用して、ユーザーの要求に回答してください。

参考ファイル:
\`\`\`\`
{context}
\`\`\`\`

ユーザーの要求:
\`\`\`\`
{user_request}
\`\`\`\`

それではタスクを開始してください。
`;

async function answerChain(llm: BaseChatModel, user_request: string, context: string): Promise<string> {
    const prompt = new PromptTemplate({
        template: RAG_PROMPT_TEMPLATE,
        inputVariables: ['context', 'user_request'],
    });
    const chain = prompt.pipe(llm);
    const result = await chain.invoke({
        context: context,
        user_request: user_request,
    });
    const result_str = result.content as string;
    return result_str;
}


// const transport = new StdioClientTransport({
//     command: "npx",
//     args: ["tsx", "llms_txt_mcp_server.ts"]
// });
const transport = new SSEClientTransport(new URL("http://localhost:3001/sse"));

const client = new Client(
    {
        name: "example-client",
        version: "1.0.0"
    },
    {
        capabilities: {
            prompts: {},
            resources: {},
            tools: {}
        }
    }
);

async function main(userQuery: string) {
    console.log("--------------------------------");
    console.log("MCP Client Start");
    console.log("--------------------------------");
    await client.connect(transport);

    const tools = await client.listTools();

    for (const tool of tools.tools) {
        console.log(`Name: ${tool.name}`);
        console.log(`Description: ${tool.description}`);
        console.log(`InputSchema: ${JSON.stringify(tool.inputSchema)}`);
    }
    console.log("");
    console.log("--------------------------------");
    console.log("");

    // Call a tool
    const toolInput = {
        name: "fetch_github_rag_context",
        arguments: {
            userQuery: userQuery,
        },
    };
    console.log("User Query:", userQuery);
    const result = await client.callTool(toolInput, undefined, { timeout: 300000 });
    const context = (result.content as any[])[0].text;
    console.log("Context:", context);
    console.log("--------------------------------");
    const llm = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.MODEL_NAME,
    });
    const answer = await answerChain(llm, userQuery, context);
    console.log("Answer:", answer);
    console.log("--------------------------------");

    await client.close();
}

const userQuery = "GitHub Actionsでイシューが作られたら特定のコメントを送る処理を作成してください。";
main(userQuery);
