import type { RegisteredAgent } from '../agentRegistry';
import type { CourtTask } from '../taskBus';
import type { RetrievalResult } from '../retrieval/retrievalEngine';

export type PlannedToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
};

export class ToolPlanner {
  planTools(agent: RegisteredAgent, task: CourtTask, retrievals: RetrievalResult[] = []): PlannedToolCall[] {
    // Agent 自主工具规划：当前用启发式 mock，后续可替换成真实 LLM tool planning。
    const text = `${task.title}\n${task.content}`.toLowerCase();
    const calls: PlannedToolCall[] = [];

    calls.push({
      toolName: 'MemoryTool',
      input: { action: 'remember-agent', content: `${agent.department}开始处理 ${task.id}`, tags: [agent.role] },
      reason: '记录 Agent 处理轨迹',
    });

    if (retrievals.length > 0 || text.includes('复用') || text.includes('历史')) {
      calls.push({
        toolName: 'SearchTool',
        input: { query: task.title.slice(0, 20) || agent.department },
        reason: '根据历史检索结果搜索当前任务工作区',
      });
    }

    if (agent.id === 'libu' || text.includes('文档') || text.includes('报告')) {
      calls.push({
        toolName: 'FileTool',
        input: { action: 'write', path: `notes/${agent.id}-brief.md`, content: `# ${agent.department}回奏\n\n${task.content}` },
        reason: '生成文档类工作底稿',
      });
    }

    if (agent.id === 'bingbu') {
      calls.push({
        toolName: 'FileTool',
        input: { action: 'write', path: 'src/task-entry.ts', content: `export const taskId = ${JSON.stringify(task.id)};` },
        reason: '为代码任务写入入口文件',
      });
    }

    if (agent.id === 'gongbu' || text.includes('部署') || text.includes('环境')) {
      calls.push({
        toolName: 'ShellTool',
        input: { command: 'echo workspace-ready' },
        reason: '检查运行环境桥接能力',
      });
    }

    return calls;
  }
}
