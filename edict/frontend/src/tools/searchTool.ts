import type { RuntimeTool, ToolContext } from './baseTool';
import type { WorkspaceFile } from '../workspace/workspaceRuntime';

export type SearchToolInput = {
  query: string;
};

export class SearchTool implements RuntimeTool<SearchToolInput, WorkspaceFile[]> {
  name = 'SearchTool';
  description = '在任务工作区内搜索文件路径和文件内容';

  async run(input: SearchToolInput, context: ToolContext) {
    // 搜索范围限制在当前任务工作区，避免跨任务泄漏上下文。
    const results = context.workspace.search(context.task.id, input.query);
    return {
      ok: true,
      output: `搜索到 ${results.length} 个匹配文件`,
      data: results,
    };
  }
}
