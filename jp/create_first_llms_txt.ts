import "dotenv/config";
import axios from 'axios';

import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';

const PROMPT_TEMPLATE = `レポジトリ情報をもとに以下の形式でllms.txtを出力してください。

レポジトリ情報:
\`\`\`\`
レポジトリ名: {repository_name}
レポジトリURL: {repository_url}

レポジトリ内のファイル内容:
{file_contents}
\`\`\`\`

llms.txtの出力形式:
以下のように<output>タグ内に必要な情報を記載してください。
<output>
# レポジトリ名[レポジトリURL]

> プロジェクト概要説明

プロジェクト詳細説明(500文字以内で記載)

## ファイル一覧
- ファイル名1[ファイルパス1]: ファイル1の概要説明(300文字以内で記載)
- ファイル名2[ファイルパス2]: ファイル2の概要説明(300文字以内で記載)
...
</output>

それではタスクを開始してください。
`;

// Organizationのリポジトリ一覧を取得
async function listOrganizationRepositories(organization: string) {
    // GITHUB_TOKEN を環境変数から取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
    }

    try {
        // GET /orgs/{org}/repos エンドポイントを呼び出して organization のリポジトリ一覧を取得する
        const response = await axios.get(`https://api.github.com/orgs/${organization}/repos`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Organization のリポジトリ一覧の取得に失敗しました:', error);
    }
}

async function listRepositoryContents(organization: string, repository: string, path: string="") {
    // GITHUB_TOKEN を環境変数から取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
    }

    try {
        // GET /orgs/{org}/repos エンドポイントを呼び出して organization のリポジトリ一覧を取得する
        const response = await axios.get(`https://api.github.com/repos/${organization}/${repository}/contents/${path}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('リポジトリのコンテンツ一覧の取得に失敗しました:', error);
    }
}

async function listRepositoryContentsRecursive(organization: string, repository: string, path: string="", aggregatedFiles: any[]=[]): Promise<any[]> {
    // GITHUB_TOKEN を環境変数から取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
    }

    try {
        // GET /orgs/{org}/repos エンドポイントを呼び出して organization のリポジトリ一覧を取得する
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
        console.error('リポジトリのコンテンツ一覧の取得に失敗しました:', error);
        return aggregatedFiles;
    }
}

async function getFileContent(organization: string, repository: string, path: string) {
    // GITHUB_TOKEN を環境変数から取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
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
        console.error('ファイルの内容の取得に失敗しました:', error);
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
    // 環境変数からトークンを取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
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
    // 環境変数からトークンを取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
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
    // 環境変数からトークンを取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
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
    // 環境変数からトークンを取得
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN 環境変数が設定されていません。');
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
    // Organization 名を指定（必要に応じて変更してください）
    const organization = process.env.GITHUB_ORGANIZATION;
    if (!organization) {
        throw new Error('GITHUB_ORGANIZATION 環境変数が設定されていません。');
    }
    try {
        const repos = await listOrganizationRepositories(organization);
        console.log(`Organization "${organization}" のリポジトリ一覧:`);
        repos.forEach((repo: any) => {
            console.log(`${repo.name}(${repo.full_name}) - ${repo.html_url}`);
        });
        console.log("--------------------------------");

        const llmsTxtsMap = new Map<string, string>();
        for (const repo of repos) {
            // const contents = await listRepositoryContents(organization, repo.name);
            // contents.forEach((content: any) => {
            //     console.log(`[${content.type}]${content.name}(${content.path}) - ${content.html_url}`);
            // });
            // console.log("--------------------------------");

            const contents = await listRepositoryContentsRecursive(organization, repo.name);
            contents.forEach((content: any) => {
                console.log(`[${content.type}]${content.name}(${content.path}) - ${content.html_url}`);
            });
            console.log("--------------------------------");

            // for (const file of contents) {
            //     const content = await getFileContent(organization, repo.name, file.path);
            //     console.log(`${file.name}(${file.path}) - ${content.download_url}`);
            //     const content_str = await encodingFileContent(content);
            //     console.log(`content: \n\`\`\`\n${content_str}\n\`\`\``);
            //     console.log("");
            // }
            // console.log("--------------------------------");

            const repository_name = repo.name;
            const repository_url = repo.html_url;
            let file_contents = "";
            for (const file of contents) {
                const content = await getFileContent(organization, repo.name, file.path);
                const content_str = await encodingFileContent(content);
                file_contents += (
                    `ファイル名: ${file.name}\n`
                    + `ファイルパス: ${file.path}\n`
                    + `ファイル内容: \n\`\`\`\n${content_str}\n\`\`\`\n`
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

        // ベースブランチの最新コミットSHAを取得
        const MAIN_REPOSITORY = process.env.GITHUB_MAIN_REPOSITORY;
        const now = new Date();
        const BASE_BRANCH = "main";
        const formattedDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        const NEW_BRANCH = `llms-txt-${formattedDate}`;
        if (!MAIN_REPOSITORY) {
            throw new Error('GITHUB_MAIN_REPOSITORY 環境変数が設定されていません。');
        }
        const baseSha = await getLatestCommitSha(organization, MAIN_REPOSITORY, BASE_BRANCH);
        console.log(`baseSha: ${baseSha}`);

        // 新しいブランチを作成
        await createBranch(organization, MAIN_REPOSITORY, NEW_BRANCH, baseSha);
        console.log(`newBranch: ${NEW_BRANCH}`);

        // 新しいフォルダ内にファイルを作成
        for (const [repository_name, llmsTxt] of llmsTxtsMap) {
            const filePath = `${repository_name}/llms.txt`;
            const COMMIT_MESSAGE = `Update llms.txt`;
            await createFile(organization, MAIN_REPOSITORY, NEW_BRANCH, filePath, llmsTxt, COMMIT_MESSAGE);
            console.log(`filePath: ${filePath}`);
        }

        // プルリクエストを作成
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
