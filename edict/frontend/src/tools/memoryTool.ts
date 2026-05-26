import type { MemoryEntry } from '../memoryEngine';
import type { RuntimeTool, ToolContext } from './baseTool';

export type MemoryToolInput = {
  action: 'remember-task' | 'remember-agent' | 'remember-short' | 'remember-long' | 'read-task' | 'read-agent';
  content?: string;
  tags?: string[];
};

export class MemoryTool implements RuntimeTool<MemoryToolInput, MemoryEntry | MemoryEntry[]> {
  name = 'MemoryTool';
  description = '读写任务记忆、Agent 记忆、短期记忆和长期记忆';

  async run(input: MemoryToolInput, context: ToolContext) {
    // MemoryTool 统一封装 MemoryEngine，Agent 不直接接触内部 Map。
    if (input.action === 'remember-task') {
      const entry = context.memory.rememberTask(context.task.id, input.content || '', input.tags || []);
      return { ok: true, output: '已写入任务记忆', data: entry };
    }
    if (input.action === 'remember-agent') {
      const entry = context.memory.rememberAgent(context.agent.id, input.content || '', input.tags || []);
      return { ok: true, output: '已写入 Agent 记忆', data: entry };
    }
    if (input.action === 'remember-short') {
      const entry = context.memory.rememberShortTerm(input.content || '', context.task.id, context.agent.id);
      return { ok: true, output: '已写入短期记忆', data: entry };
    }
    if (input.action === 'remember-long') {
      const entry = context.memory.rememberLongTerm(input.content || '', input.tags || []);
      return { ok: true, output: '已写入长期记忆', data: entry };
    }
    if (input.action === 'read-agent') {
      const entries = context.memory.getAgentMemory(context.agent.id);
      return { ok: true, output: `读取到 ${entries.length} 条 Agent 记忆`, data: entries };
    }
    const entries = context.memory.getTaskMemory(context.task.id);
    return { ok: true, output: `读取到 ${entries.length} 条任务记忆`, data: entries };
  }
}
