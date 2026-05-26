import type { ArtifactStore } from '../artifacts/artifactStore';
import type { MemoryEngine, MemoryEntry } from '../memoryEngine';
import type { CourtTask } from '../taskBus';

export type RetrievalType = 'task' | 'artifact' | 'memory';

export type RetrievalResult = {
  id: string;
  type: RetrievalType;
  title: string;
  content: string;
  score: number;
  source: string;
};

function tokenize(text: string) {
  // 简单相似度检索使用字符和词混合切分，适配中文短文本。
  const normalized = text.toLowerCase();
  const words = normalized.split(/[\s,，。；;:：、/\\|]+/).filter(Boolean);
  const chars = Array.from(normalized).filter((char) => /[\u4e00-\u9fffa-z0-9]/i.test(char));
  return Array.from(new Set([...words, ...chars]));
}

function similarity(a: string, b: string) {
  // Jaccard 相似度足够支撑当前 mock retrieval，后续可替换向量检索。
  const left = tokenize(a);
  const right = new Set(tokenize(b));
  if (left.length === 0 || right.size === 0) return 0;
  const hit = left.filter((token) => right.has(token)).length;
  return hit / Math.max(left.length, right.size);
}

export class RetrievalEngine {
  constructor(private memory: MemoryEngine, private artifacts: ArtifactStore, private getTasks: () => CourtTask[]) {}

  retrieveForTask(task: CourtTask, agentId?: string) {
    // 综合 task、artifact、memory 三类来源，为 Planner 和 Agent 提供上下文。
    const query = `${task.title}\n${task.content}`;
    return [
      ...this.retrieveTasks(query, task.id),
      ...this.retrieveArtifacts(task.id, query),
      ...this.retrieveMemory(task.id, agentId, query),
    ].sort((a, b) => b.score - a.score).slice(0, 10);
  }

  retrieveTasks(query: string, excludeTaskId?: string) {
    // task retrieval：在当前 TaskBus 任务快照中寻找相似圣旨。
    return this.getTasks()
      .filter((task) => task.id !== excludeTaskId)
      .map((task) => ({
        id: task.id,
        type: 'task' as const,
        title: task.title,
        content: task.content,
        score: similarity(query, `${task.title}\n${task.content}\n${task.logs.map((log) => log.content).join('\n')}`),
        source: 'TaskBus',
      }))
      .filter((item) => item.score > 0.05);
  }

  retrieveArtifacts(taskId: string, query: string) {
    // artifact retrieval：检索当前任务已经生成的 code、markdown、json、shell 产物。
    return this.artifacts.listByTask(taskId)
      .map((artifact) => ({
        id: artifact.id,
        type: 'artifact' as const,
        title: artifact.title,
        content: artifact.content,
        score: similarity(query, `${artifact.title}\n${artifact.content}`),
        source: artifact.type,
      }))
      .filter((item) => item.score > 0.03);
  }

  retrieveMemory(taskId: string, agentId: string | undefined, query: string) {
    // memory retrieval：同时检索任务记忆、Agent 记忆、短期记忆和长期记忆。
    const entries: MemoryEntry[] = [
      ...this.memory.getTaskMemory(taskId),
      ...(agentId ? this.memory.getAgentMemory(agentId) : []),
      ...this.memory.getShortTermMemory(),
      ...this.memory.getLongTermMemory(),
    ];
    return entries
      .map((entry) => ({
        id: entry.id,
        type: 'memory' as const,
        title: `${entry.scope} memory`,
        content: entry.content,
        score: similarity(query, entry.content),
        source: entry.scope,
      }))
      .filter((item) => item.score > 0.03);
  }
}
