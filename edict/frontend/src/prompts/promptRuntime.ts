import type { RegisteredAgent } from '../agentRegistry';
import type { MemoryEntry } from '../memoryEngine';
import type { CourtTask } from '../taskBus';

export type PromptMemoryContext = {
  taskMemory: MemoryEntry[];
  agentMemory: MemoryEntry[];
  shortTermMemory: MemoryEntry[];
  longTermMemory: MemoryEntry[];
};

export type PromptRuntimeInput = {
  agent: RegisteredAgent;
  task: CourtTask;
  memory: PromptMemoryContext;
  agentState: Record<string, unknown>;
};

function summarizeEntries(entries: MemoryEntry[]) {
  // 记忆条目只取最近内容，避免 mock prompt 无限膨胀。
  if (entries.length === 0) return '暂无';
  return entries.slice(0, 6).map((entry) => `- [${entry.createdAt}] ${entry.content}`).join('\n');
}

export class PromptRuntime {
  buildPrompt(input: PromptRuntimeInput) {
    // Prompt Runtime 统一拼接 system prompt、任务上下文、记忆上下文和 Agent 状态。
    const { agent, task, memory, agentState } = input;
    return [
      `【System Prompt】\n${agent.systemPrompt}`,
      `【Task Context】\n任务ID：${task.id}\n标题：${task.title}\n内容：${task.content}\n当前部门：${task.currentDepartment}\n状态：${task.status}`,
      `【Memory Context】\n任务记忆：\n${summarizeEntries(memory.taskMemory)}\n\nAgent记忆：\n${summarizeEntries(memory.agentMemory)}\n\n短期记忆：\n${summarizeEntries(memory.shortTermMemory)}\n\n长期记忆：\n${summarizeEntries(memory.longTermMemory)}`,
      `【Agent State】\n${JSON.stringify(agentState, null, 2)}`,
      '【Instruction】\n请基于当前官职职责输出一段简短 mock 处理结果，不调用真实 AI。',
    ].join('\n\n');
  }
}
