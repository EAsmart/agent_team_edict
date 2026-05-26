import type { RuntimeTool, ToolContext } from './baseTool';

export type ShellToolInput = {
  command: string;
};

export type ShellToolOutput = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  mocked: boolean;
};

export class ShellTool implements RuntimeTool<ShellToolInput, ShellToolOutput> {
  name = 'ShellTool';
  description = '执行经过沙箱白名单校验的命令；浏览器阶段返回 mock 输出';

  async run(input: ShellToolInput, context: ToolContext) {
    // 浏览器不能直接执行本机命令，先用前端沙箱校验，再尝试 Dashboard 本地执行桥。
    const decision = context.sandbox.validateCommand(input.command);
    if (!decision.allowed) {
      return {
        ok: false,
        output: decision.reason,
        data: {
          command: input.command,
          stdout: '',
          stderr: decision.reason,
          exitCode: 126,
          mocked: true,
        },
      };
    }

    try {
      // Dashboard 生产服务提供 /api/runtime-shell；开发服务或端点不可用时自动回退到 mock 输出。
      const response = await fetch('/api/runtime-shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          command: input.command,
          taskId: context.task.id,
          workspacePath: context.workspace.getWorkspace(context.task.id).path,
        }),
      });
      if (response.ok) {
        const data = await response.json() as {
          ok: boolean;
          stdout?: string;
          stderr?: string;
          exitCode?: number;
          command?: string;
        };
        return {
          ok: data.ok,
          output: data.stdout || data.stderr || '命令已执行但没有输出',
          data: {
            command: data.command || input.command,
            stdout: data.stdout || '',
            stderr: data.stderr || '',
            exitCode: data.exitCode ?? (data.ok ? 0 : 1),
            mocked: false,
          },
        };
      }
    } catch {
      // 本地执行桥不可用时保持前端演示可用，不影响 UI。
    }

    const stdout = input.command.trim().toLowerCase().startsWith('codex')
      ? `Codex CLI mock：已接收任务 ${context.task.id}，将在工作区 ${context.workspace.getWorkspace(context.task.id).path} 生成代码建议。`
      : `Shell mock：命令已通过沙箱校验，等待后端执行桥接。`;

    return {
      ok: true,
      output: stdout,
      data: {
        command: input.command,
        stdout,
        stderr: '',
        exitCode: 0,
        mocked: true,
      },
    };
  }
}
