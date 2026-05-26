import type { SandboxPolicy } from '../sandbox/sandboxPolicy';

export type WorkspaceFile = {
  path: string;
  content: string;
  updatedAt: string;
};

export type TaskWorkspace = {
  taskId: string;
  path: string;
  createdAt: string;
  files: WorkspaceFile[];
};

function nowText() {
  // 工作区时间统一使用中文本地时间，方便日志直接展示。
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export class WorkspaceRuntime {
  private workspaces = new Map<string, TaskWorkspace>();

  constructor(private sandbox: SandboxPolicy) {}

  createWorkspace(taskId: string) {
    // 每个任务自动创建独立虚拟工作目录，当前阶段不写真实磁盘。
    const existed = this.workspaces.get(taskId);
    if (existed) return existed;
    const workspace: TaskWorkspace = {
      taskId,
      path: `${this.sandbox.getWorkspaceRoot()}/${taskId}`,
      createdAt: nowText(),
      files: [],
    };
    this.workspaces.set(taskId, workspace);
    return workspace;
  }

  getWorkspace(taskId: string) {
    // 读取任务工作区，若不存在则自动创建。
    return this.createWorkspace(taskId);
  }

  writeFile(taskId: string, relativePath: string, content: string) {
    // 写文件前先做路径限制，确保只能写入当前任务工作区。
    const workspace = this.createWorkspace(taskId);
    const fullPath = this.resolvePath(workspace.path, relativePath);
    const decision = this.sandbox.validatePath(fullPath, workspace.path);
    if (!decision.allowed) throw new Error(decision.reason);

    const nextFile = { path: fullPath, content, updatedAt: nowText() };
    const existed = workspace.files.some((file) => file.path === fullPath);
    workspace.files = existed
      ? workspace.files.map((file) => (file.path === fullPath ? nextFile : file))
      : [nextFile, ...workspace.files];
    return nextFile;
  }

  readFile(taskId: string, relativePath: string) {
    // 读取文件同样限制在当前任务工作区内。
    const workspace = this.createWorkspace(taskId);
    const fullPath = this.resolvePath(workspace.path, relativePath);
    const decision = this.sandbox.validatePath(fullPath, workspace.path);
    if (!decision.allowed) throw new Error(decision.reason);
    return workspace.files.find((file) => file.path === fullPath);
  }

  listFiles(taskId: string) {
    // 返回任务工作区文件快照，调用方不能直接修改内部数组。
    return [...this.createWorkspace(taskId).files];
  }

  search(taskId: string, query: string) {
    // SearchTool 使用该方法在当前任务工作区内做轻量全文搜索。
    const keyword = query.toLowerCase();
    return this.listFiles(taskId).filter((file) =>
      file.path.toLowerCase().includes(keyword) || file.content.toLowerCase().includes(keyword),
    );
  }

  private resolvePath(workspacePath: string, relativePath: string) {
    // 简单规范化虚拟路径，避免浏览器端引入 Node path 依赖。
    const clean = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${workspacePath}/${clean}`;
  }
}
