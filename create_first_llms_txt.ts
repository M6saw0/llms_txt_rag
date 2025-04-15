import "dotenv/config";
import axios from 'axios';

import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';

const PROMPT_TEMPLATE = `Please output llms.txt in the following format based on the repository information.

Repository information:
\`\`\`\`
Repository name: {repository_name}
Repository URL: {repository_url}

File contents in the repository:
{file_contents}
\`\`\`\`

Output format for llms.txt:
Please include the necessary information within the <output> tags as shown below.
<output>
# Repository name[Repository URL]

> Project overview

Project detailed description (within 500 characters)

## File list
- File name 1[File path 1]: File 1 overview (within 300 characters)
- File name 2[File path 2]: File 2 overview (within 300 characters)
...
</output>

Please begin the task now.
`;

// Get list of repositories from the organization
async function listOrganizationRepositories(organization: string) {
    // Get GITHUB_TOKEN from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }

    try {
        // Call GET /orgs/{org}/repos endpoint to get the repository list for the organization
        const response = await axios.get(`https://api.github.com/orgs/${organization}/repos`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Failed to get the repository list for the organization:', error);
    }
}

async function listRepositoryContentsRecursive(organization: string, repository: string, path: string="", aggregatedFiles: any[]=[]): Promise<any[]> {
    // Get GITHUB_TOKEN from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }

    try {
        // Call GET /repos/{owner}/{repo}/contents/{path} endpoint to get the repository contents
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
        console.error('Failed to get the repository contents list:', error);
        return aggregatedFiles;
    }
}

async function getFileContent(organization: string, repository: string, path: string) {
    // Get GITHUB_TOKEN from environment variables
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
        console.error('Failed to get file content:', error);
        return null;
    }
}

async function encodingFileContent(content: any) {
    return Buffer.from(content.content, content.encoding).toString('utf-8');
}

async function createLLMsTxt(llm: BaseChatModel, repository_name: string, repository_url: string, file_contents: string): Promise<string> {
    const prompt = new PromptTemplate({
        template: PROMPT_TEMPLATE,
        inputVariables: ['repository_name', 'repository_url', 'file_contents'],
    });
    const chain = prompt.pipe(llm);
    const result = await chain.invoke({
        repository_name: repository_name,
        repository_url: repository_url,
        file_contents: file_contents,
    });
    const result_str = result.content as string;
    const result_match = result_str.match(/<output>\n*([\s\S]*?)\n*<\/output>/);
    if (result_match) {
        return result_match[1];
    } else {
        return result_str;
    }
}

async function getLatestCommitSha(organization: string, repository: string, branch: string): Promise<string> {
    // Get token from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }
    try {
        const response = await axios.get(`https://api.github.com/repos/${organization}/${repository}/git/ref/heads/${branch}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        return response.data.object.sha;
    } catch (error: any) {
        console.error('An error occurred:', error.response?.data || error.message);
        throw error;
    }
}

async function createBranch(organization: string, repository: string, newBranch: string, sha: string): Promise<void> {
    // Get token from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }
    try {
        await axios.post(`https://api.github.com/repos/${organization}/${repository}/git/refs`, {
            ref: `refs/heads/${newBranch}`,
            sha,
        }, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
    } catch (error: any) {
        console.error('An error occurred:', error.response?.data || error.message);
        throw error;
    }
}

async function createFile(organization: string, repository: string, branch: string, filePath: string, content: string, message: string): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }
    try {
        const base64Content = Buffer.from(content).toString('base64');
        await axios.put(`https://api.github.com/repos/${organization}/${repository}/contents/${filePath}`, {
            message,
            content: base64Content,
            branch,
        }, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
    } catch (error: any) {
        console.error('An error occurred:', error.response?.data || error.message);
        throw error;
    }
}

async function createPullRequest(organization: string, repository: string, title: string, body: string, head: string, base: string): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is not set.');
    }
    try {
        await axios.post(`https://api.github.com/repos/${organization}/${repository}/pulls`, {
            title,
            body,
            head,
            base,
        }, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
    } catch (error: any) {
        console.error('An error occurred:', error.response?.data || error.message);
        throw error;
    }
}

async function main() {
    // Specify the organization name (change as needed)
    const organization = process.env.GITHUB_ORGANIZATION;
    if (!organization) {
        throw new Error('GITHUB_ORGANIZATION environment variable is not set.');
    }
    try {
        const repos = await listOrganizationRepositories(organization);
        console.log(`Repository list for organization "${organization}":`);
        repos.forEach((repo: any) => {
            console.log(`${repo.name}(${repo.full_name}) - ${repo.html_url}`);
        });
        console.log("--------------------------------");

        const llmsTxtsMap = new Map<string, string>();
        for (const repo of repos) {
            const contents = await listRepositoryContentsRecursive(organization, repo.name);
            contents.forEach((content: any) => {
                console.log(`[${content.type}]${content.name}(${content.path}) - ${content.html_url}`);
            });
            console.log("--------------------------------");

            const repository_name = repo.name;
            const repository_url = repo.html_url;
            let file_contents = "";
            for (const file of contents) {
                const content = await getFileContent(organization, repo.name, file.path);
                const content_str = await encodingFileContent(content);
                file_contents += (
                    `File name: ${file.name}\n`
                    + `File path: ${file.path}\n`
                    + `File content: \n\`\`\`\n${content_str}\n\`\`\`\n`
                    + `\n`
                );
            }
            const llm = new ChatOpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                model: process.env.MODEL_NAME,
            });
            const llmsTxt = await createLLMsTxt(llm, repository_name, repository_url, file_contents);
            console.log(llmsTxt);
            console.log("--------------------------------");
            llmsTxtsMap.set(repository_name, llmsTxt);
        }
        console.log(llmsTxtsMap);

        // Get the latest commit SHA from the base branch
        const MAIN_REPOSITORY = process.env.GITHUB_MAIN_REPOSITORY;
        const now = new Date();
        const BASE_BRANCH = "main";
        const formattedDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        const NEW_BRANCH = `llms-txt-${formattedDate}`;
        if (!MAIN_REPOSITORY) {
            throw new Error('GITHUB_MAIN_REPOSITORY environment variable is not set.');
        }
        const baseSha = await getLatestCommitSha(organization, MAIN_REPOSITORY, BASE_BRANCH);
        console.log(`baseSha: ${baseSha}`);

        // Create a new branch
        await createBranch(organization, MAIN_REPOSITORY, NEW_BRANCH, baseSha);
        console.log(`newBranch: ${NEW_BRANCH}`);

        // Create files in the new folder
        for (const [repository_name, llmsTxt] of llmsTxtsMap) {
            const filePath = `${repository_name}/llms.txt`;
            const COMMIT_MESSAGE = `Update llms.txt`;
            await createFile(organization, MAIN_REPOSITORY, NEW_BRANCH, filePath, llmsTxt, COMMIT_MESSAGE);
            console.log(`filePath: ${filePath}`);
        }

        // Create a pull request
        const PR_TITLE = `first llms.txt`;
        const PR_BODY = `first llms.txt`;
        await createPullRequest(organization, MAIN_REPOSITORY, PR_TITLE, PR_BODY, NEW_BRANCH, BASE_BRANCH);
        console.log(`PR_TITLE: ${PR_TITLE}`);

        console.log('Pull request created successfully.');
    } catch (error: any) {
        console.error('An error occurred:', error.response?.data || error.message);
    }
}

main();
