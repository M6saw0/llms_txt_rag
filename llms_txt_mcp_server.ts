import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";  // Library for data validation and schema definition
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

// Define input schema
const fetchRagContextSchema = z.object({
    userQuery: z.string().describe("User question or request"),
});

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "fetch_github_rag_context",
                description: (
                    "Retrieves information related to user queries from internal GitHub repositories. " +
                    "GitHub repositories include code used in projects and R&D, as well as internal documentation."
                ),
                inputSchema: zodToJsonSchema(fetchRagContextSchema),
            }
        ]
    }
});

// Tool implementation
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
                        content: [{ type: "text", text: "Error: " + (error instanceof Error ? error.message : String(error)) }],
                    };
                }
            }
            default: {
                throw new Error(`Unknown tool: ${name}`);
            }
        }
    } catch (error: unknown) {
        return {
            content: [{ type: "text", text: "Error: " + (error instanceof Error ? error.message : String(error)) }],
        };
    }
});

// Start server
async function runServer() {
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

// Launch server
console.log("Starting server...");
runServer().catch((error) => {
    console.error("Fatal error during server execution:", error);
    process.exit(1);
}); 
