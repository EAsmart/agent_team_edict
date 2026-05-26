export type SandboxDecision = {
  allowed: boolean;
  reason: string;
};

export type SandboxPolicyConfig = {
  allowedCommands: string[];
  blockedCommands: string[];
  workspaceRoot: string;
};

export class SandboxPolicy {
  constructor(private config: SandboxPolicyConfig) {}

  validateCommand(command: string): SandboxDecision {
    // 命令执行前先过白名单和危险命令检查，避免 Runtime 直接运行高风险指令。
    const normalized = command.trim().toLowerCase();
    if (!normalized) return { allowed: false, reason: '空命令已被沙箱拒绝' };

    const tokens = normalized.split(/\s+/);
    const executable = tokens[0];
    const dangerous = this.config.blockedCommands.find((blocked) => normalized.includes(blocked));
    if (dangerous) {
      return { allowed: false, reason: `命中危险命令片段：${dangerous}` };
    }

    if (!this.config.allowedCommands.includes(executable)) {
      return { allowed: false, reason: `命令 ${executable} 不在白名单内` };
    }

    return { allowed: true, reason: '命令通过沙箱校验' };
  }

  validatePath(path: string, workspacePath: string): SandboxDecision {
    // 文件访问必须限制在任务工作目录内，当前实现使用虚拟路径前缀检查。
    const normalized = path.replace(/\\/g, '/');
    const normalizedWorkspace = workspacePath.replace(/\\/g, '/');
    if (!normalized.startsWith(normalizedWorkspace)) {
      return { allowed: false, reason: '文件路径越过当前任务工作目录' };
    }
    if (normalized.includes('..')) {
      return { allowed: false, reason: '文件路径包含上级目录访问' };
    }
    return { allowed: true, reason: '路径通过沙箱校验' };
  }

  getWorkspaceRoot() {
    // 暴露只读 workspace root，供 WorkspaceRuntime 创建任务目录。
    return this.config.workspaceRoot;
  }
}

export function createDefaultSandboxPolicy() {
  // 默认白名单只允许开发期必要命令，危险命令全部拦截。
  return new SandboxPolicy({
    workspaceRoot: '/virtual-court-workspace',
    allowedCommands: ['codex', 'npm', 'node', 'python', 'git', 'rg', 'echo', 'type', 'dir'],
    blockedCommands: [
      'rm ',
      'del ',
      'rmdir',
      'format',
      'shutdown',
      'restart-computer',
      'remove-item',
      'git reset',
      'git checkout --',
      'taskkill',
    ],
  });
}
