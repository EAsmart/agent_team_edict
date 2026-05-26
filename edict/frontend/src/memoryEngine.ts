export type MemoryEntry = {
  id: string;
  scope: 'task' | 'agent' | 'short' | 'long';
  content: string;
  createdAt: string;
  taskId?: string;
  agentId?: string;
  tags?: string[];
};

function makeMemoryId(scope: MemoryEntry['scope']) {
  // 内存记忆只服务前端 mock runtime，ID 用时间戳加随机后缀即可。
  return `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowText() {
  // 与 TaskBus 使用相同本地时间格式，方便日志和记忆互相对齐。
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export class MemoryEngine {
  private taskMemory = new Map<string, MemoryEntry[]>();
  private agentMemory = new Map<string, MemoryEntry[]>();
  private shortTermMemory: MemoryEntry[] = [];
  private longTermMemory: MemoryEntry[] = [];

  rememberTask(taskId: string, content: string, tags: string[] = []) {
    // 任务记忆记录单个圣旨的规划、审核、执行结果。
    const entry = this.createEntry('task', content, { taskId, tags });
    this.taskMemory.set(taskId, [entry, ...(this.taskMemory.get(taskId) || [])].slice(0, 40));
    return entry;
  }

  rememberAgent(agentId: string, content: string, tags: string[] = []) {
    // Agent 记忆记录某个官职最近承担的动作和输出。
    const entry = this.createEntry('agent', content, { agentId, tags });
    this.agentMemory.set(agentId, [entry, ...(this.agentMemory.get(agentId) || [])].slice(0, 40));
    return entry;
  }

  rememberShortTerm(content: string, taskId?: string, agentId?: string) {
    // 短期记忆保存当前页面会话中的即时上下文。
    const entry = this.createEntry('short', content, { taskId, agentId });
    this.shortTermMemory = [entry, ...this.shortTermMemory].slice(0, 60);
    return entry;
  }

  rememberLongTerm(content: string, tags: string[] = []) {
    // 长期记忆预留给后续持久化，目前仍保存在前端内存中。
    const entry = this.createEntry('long', content, { tags });
    this.longTermMemory = [entry, ...this.longTermMemory].slice(0, 80);
    return entry;
  }

  getTaskMemory(taskId: string) {
    // 读取任务上下文，返回副本防止外部修改内部数组。
    return [...(this.taskMemory.get(taskId) || [])];
  }

  getAgentMemory(agentId: string) {
    // 读取 Agent 上下文，供 Prompt Runtime 拼接。
    return [...(this.agentMemory.get(agentId) || [])];
  }

  getShortTermMemory() {
    // 短期记忆用于同一运行时内的上下文补充。
    return [...this.shortTermMemory];
  }

  getLongTermMemory() {
    // 长期记忆目前是 mock 形态，后续可替换为 IndexedDB 或后端存储。
    return [...this.longTermMemory];
  }

  buildMemoryContext(taskId: string, agentId: string) {
    // 为 Prompt Runtime 生成结构化记忆上下文，不在这里拼接自然语言。
    return {
      taskMemory: this.getTaskMemory(taskId),
      agentMemory: this.getAgentMemory(agentId),
      shortTermMemory: this.getShortTermMemory(),
      longTermMemory: this.getLongTermMemory(),
    };
  }

  private createEntry(
    scope: MemoryEntry['scope'],
    content: string,
    options: { taskId?: string; agentId?: string; tags?: string[] } = {},
  ): MemoryEntry {
    // 统一入口保证所有记忆字段完整。
    return {
      id: makeMemoryId(scope),
      scope,
      content,
      createdAt: nowText(),
      taskId: options.taskId,
      agentId: options.agentId,
      tags: options.tags,
    };
  }
}
