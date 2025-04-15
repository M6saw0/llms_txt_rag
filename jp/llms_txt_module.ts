import "dotenv/config";
import axios from 'axios';

import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';


const SEARCH_PROMPT_TEMPLATE = `以下のレポジトリの情報をもとに、ユーザーの要求に関連する/役立つファイルをリストアップしてください。

リポジトリの情報:
\`\`\`\`
{context}
\`\`\`\`

ユーザーの要求:
\`\`\`\`
{user_request}
\`\`\`\`

出力ルール:
ユーザーの要求を達成するために必要なファイルを特定し、レポジトリ名とファイルパス(フォルダを含む)、ファイルが関連する/役立つと考える理由を出力してください。
出力は<output>タグで囲み、辞書のリスト形式で出力してください。
見つからない場合は空のリスト([])を出力してください。

出力形式:
<output>
[
    {{
        "reason": "ここにこのファイルが関連する/役立つと考える理由を記載する",
        "repository_name": "ここにリポジトリ名を記載する",
        "file_path": "ここにファイルパスを記載する(フォルダを含むパス)"
    }},
    ...
]
</output>

それではタスクを開始してください。
`;


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
        // Organization 名を指定
        const organization = process.env.ORGANIZATION;
        const repository = process.env.LLMS_TXT_REPOSITORY;
        if (!organization) {
            throw new Error('GITHUB_ORGANIZATION 環境変数が設定されていません。');
        }
        if (!repository) {
            throw new Error('LLMS_TXT_REPOSITORY 環境変数が設定されていません。');
        }
        
        // llms.txt ファイルを取得
        const files = await listRepositoryContentsRecursive(organization, repository);
        const llmsTxtFiles = files.filter((file: any) => file.path.endsWith('llms.txt') && !file.path.startsWith(repository + '/'));
        let context = "";
        for (const file of llmsTxtFiles) {
            const eachRepositoryName = file.path.split('/')[0];
            const fileContent = await getFileContent(organization, repository, file.path);
            const fileContentStr = await encodingFileContent(fileContent);
            context += (
                `リポジトリ名: ${eachRepositoryName}\n`
                + `リポジトリの情報: \n`
                + `\`\`\`\n${fileContentStr}\n\`\`\`\n`
                + `\n`
            );
        }
        context = context.replace(/\n{1,}$/g, "");
        
        // 必要なファイルをリストアップ
        const llm = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.MODEL_NAME,
        });
        
        const contextFiles = await listContextFiles(llm, userQuery, context);
        
        // 参考ファイルを取得
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

