import "dotenv/config";
import axios from 'axios';

import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';


const SEARCH_PROMPT_TEMPLATE = `Please list files from the repository that are relevant/helpful for the user's request.

Repository information:
\`\`\`\`
{context}
\`\`\`\`

User's request:
\`\`\`\`
{user_request}
\`\`\`\`

Output rules:
Identify the files needed to fulfill the user's request, and output the repository name, file path (including folders), and the reason why the file is relevant/helpful.
Wrap your output with <output> tags and format it as a list of dictionaries.
If no relevant files are found, output an empty list ([]).

Output format:
<output>
[
    {{
        "reason": "State here why this file is relevant/helpful",
        "repository_name": "Repository name here",
        "file_path": "File path here (including folder path)"
    }},
    ...
]
</output>

Please begin the task now.
`;


async function listRepositoryContentsRecursive(organization: string, repository: string, path: string="", aggregatedFiles: any[]=[]): Promise<any[]> {
    // Get GITHUB_TOKEN from environment variable
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }

    try {
        // Call GET /orgs/{org}/repos endpoint to get the organization's repository list
        const response = await axios.get(`https://api.github.com/repos/${organization}/${repository}/contents/${path}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        if (Array.isArray(response.data)) {
            for (const item of response.data) {
                if (item.type === 'file') {
                    aggregatedFiles.push(item);
                } else if (item.type === 'dir') {
                    // For directories, recursively fetch its contents and filter for files only
                    aggregatedFiles = await listRepositoryContentsRecursive(organization, repository, item.path, aggregatedFiles);
                }
            }
        }
        return aggregatedFiles;
    } catch (error) {
        console.error('Failed to retrieve repository contents:', error);
        return aggregatedFiles;
    }
}

async function getFileContent(organization: string, repository: string, path: string) {
    // Get GITHUB_TOKEN from environment variable
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }
    try {
        const response = await axios.get(`https://api.github.com/repos/${organization}/${repository}/contents/${path}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Failed to retrieve file content:', error);
        return null;
    }
}

async function encodingFileContent(content: any) {
    try {
        return Buffer.from(content.content, content.encoding).toString('utf-8');
    } catch (error) {
        return "";
    }
}

type ContextFile = {
    repository_name: string;
    file_path: string;
    reason: string;
}

async function listContextFiles(llm: BaseChatModel, user_request: string, context: string): Promise<ContextFile[]> {
    const prompt = new PromptTemplate({
        template: SEARCH_PROMPT_TEMPLATE,
        inputVariables: ['context', 'user_request'],
    });
    const chain = prompt.pipe(llm);
    const result = await chain.invoke({
        context: context,
        user_request: user_request,
    });
    const result_str = result.content as string;
    const result_match = result_str.match(/<output>\n*([\s\S]*?)\n*<\/output>/);
    if (result_match) {
        const result_json = JSON.parse(result_match[1]);
        return result_json.map((item: any) => ({
            repository_name: item.repository_name,
            file_path: item.file_path,
            reason: item.reason,
        }));
    } else {
        return [];
    }
}

// MCP function to return RAG context
export async function fetchRagContext(userQuery: string): Promise<string> {
    try {
        // Specify organization name
        const organization = process.env.ORGANIZATION;
        const repository = process.env.LLMS_TXT_REPOSITORY;
        if (!organization) {
            throw new Error('GITHUB_ORGANIZATION environment variable is not set.');
        }
        if (!repository) {
            throw new Error('LLMS_TXT_REPOSITORY environment variable is not set.');
        }
        
        // Get llms.txt files
        const files = await listRepositoryContentsRecursive(organization, repository);
        const llmsTxtFiles = files.filter((file: any) => file.path.endsWith('llms.txt') && !file.path.startsWith(repository + '/'));
        let context = "";
        for (const file of llmsTxtFiles) {
            const eachRepositoryName = file.path.split('/')[0];
            const fileContent = await getFileContent(organization, repository, file.path);
            const fileContentStr = await encodingFileContent(fileContent);
            context += (
                `Repository name: ${eachRepositoryName}\n`
                + `Repository information: \n`
                + `\`\`\`\n${fileContentStr}\n\`\`\`\n`
                + `\n`
            );
        }
        context = context.replace(/\n{1,}$/g, "");
        
        // List required files
        const llm = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.MODEL_NAME,
        });
        
        const contextFiles = await listContextFiles(llm, userQuery, context);
        
        // Get reference files
        let ragContext = "";
        for (const file of contextFiles) {
            const eachRepositoryName = file.repository_name;
            const eachFilePath = file.file_path;
            const fileContent = await getFileContent(organization, eachRepositoryName, eachFilePath);
            const fileContentStr = await encodingFileContent(fileContent);
            ragContext += (
                `\`\`\`${eachRepositoryName}/${eachFilePath}\n${fileContentStr}\`\`\`\n\n`
            );
        }
        ragContext = ragContext.replace(/\n{1,}$/g, "");
        
        return ragContext;
    } catch (error) {
        console.error('Error fetching RAG context:', error);
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
}

