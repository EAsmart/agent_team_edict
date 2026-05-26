export type ArtifactType = 'code' | 'markdown' | 'json' | 'shell';

export type RuntimeArtifact = {
  id: string;
  taskId: string;
  agentId: string;
  type: ArtifactType;
  title: string;
  content: string;
  createdAt: string;
};

function nowText() {
  // Artifact 时间用于日志展示和后续下载排序。
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function makeArtifactId(type: ArtifactType) {
  // Artifact ID 保证前端内存中唯一即可。
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ArtifactStore {
  private artifacts = new Map<string, RuntimeArtifact[]>();

  createArtifact(input: Omit<RuntimeArtifact, 'id' | 'createdAt'>) {
    // 统一创建 code、markdown、json、shell 等产物。
    const artifact: RuntimeArtifact = {
      ...input,
      id: makeArtifactId(input.type),
      createdAt: nowText(),
    };
    this.artifacts.set(input.taskId, [artifact, ...(this.artifacts.get(input.taskId) || [])]);
    return artifact;
  }

  listByTask(taskId: string) {
    // 返回指定任务的全部产物快照。
    return [...(this.artifacts.get(taskId) || [])];
  }

  listByType(taskId: string, type: ArtifactType) {
    // 按类型过滤产物，供 Code Runtime 或 UI 后续扩展使用。
    return this.listByTask(taskId).filter((artifact) => artifact.type === type);
  }
}
