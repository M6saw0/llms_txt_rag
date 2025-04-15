# RAG MCP using llms.txt

## Overview
This project creates an MCP server and client for retrieving relevant information from GitHub repositories.
It specifically searches repositories and files using llms.txt. Since llms.txt can be created, updated, and searched using only generative AI, it's easy to maintain up-to-date information.

## Prerequisites
Operation has been confirmed on Windows 11.

### Creating .env
Please create a .env file with reference to .env.template.
Grant the following permissions to your GitHub Personal Access Token:
- Actions: Read and Write
- Commit statuses: Read and Write
- Contents: Read and Write
- Environments: Read-Only
- Pull requests: Read and Write
- Secrets: Read-Only
- Variables: Read-only

### Library Installation
Execute the following command:
```bash
npm install
```

## Execution Steps
### Creating llms.txt
Run create_first_llms_txt.ts to create llms.txt.
Upon completion, "<repository_name>/llms.txt" will be created in `LLMS_TXT_REPOSITORY`.
Here's an example of repositories after execution:
```
sample_repository/
└── llms.txt
sample_repository2/
└── llms.txt
```

### Starting the Server
Start the server using SSE. We're specifying localhost here, but change the hostname accordingly if launching externally.
```bash
npx tsx llms_txt_mcp_server.ts
```

### Starting the Client
```bash
npx tsx llms_txt_mcp_client.ts
```

To use it as an MCP in your editor, configure it as follows:
```json
{
  "mcpServers": {
    "llms-txt-rag-server": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```