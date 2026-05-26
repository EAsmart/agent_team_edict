import type { RegisteredAgent } from '../agentRegistry';
import type { ArtifactStore, RuntimeArtifact } from '../artifacts/artifactStore';
import type { CourtTask } from '../taskBus';
import type { SandboxPolicy } from '../sandbox/sandboxPolicy';
import type { ToolRegistry } from '../tools/toolRegistry';
import type { MemoryEngine } from '../memoryEngine';
import type { WorkspaceRuntime } from '../workspace/workspaceRuntime';
import type { ShellToolInput, ShellToolOutput } from '../tools/shellTool';

export type CodeRuntimeResult = {
  workspacePath: string;
  command: string;
  output: string;
  artifacts: RuntimeArtifact[];
};

export type CodeRuntimeServices = {
  workspace: WorkspaceRuntime;
  artifacts: ArtifactStore;
  sandbox: SandboxPolicy;
  tools: ToolRegistry;
  memory: MemoryEngine;
};

export class CodeRuntime {
  constructor(private services: CodeRuntimeServices) {}

  async generateCodeTask(task: CourtTask, agent: RegisteredAgent, instruction: string): Promise<CodeRuntimeResult> {
    // 兵部 Code Runtime 为每个任务准备独立工作区、任务说明和 Codex CLI 命令产物。
    const workspace = this.services.workspace.createWorkspace(task.id);
    const promptFile = this.services.workspace.writeFile(
      task.id,
      'codex-task.md',
      [`# 兵部代码任务`, ``, `任务：${task.title}`, ``, `圣旨内容：`, task.content, ``, `执行要求：`, instruction].join('\n'),
    );

    const shellCommand = `codex --workspace "${workspace.path}" --task "${task.title}"`;
    const shellArtifact = this.services.artifacts.createArtifact({
      taskId: task.id,
      agentId: agent.id,
      type: 'shell',
      title: 'Codex CLI 调用命令',
      content: shellCommand,
    });
    const markdownArtifact = this.services.artifacts.createArtifact({
      taskId: task.id,
      agentId: agent.id,
      type: 'markdown',
      title: '兵部代码任务说明',
      content: promptFile.content,
    });

    const shellResult = await this.services.tools.runTool<ShellToolInput, ShellToolOutput>(
      'ShellTool',
      { command: shellCommand },
      {
        task,
        agent,
        workspace: this.services.workspace,
        memory: this.services.memory,
        artifacts: this.services.artifacts,
        sandbox: this.services.sandbox,
      },
    );

    const codeContent = [
      '// 兵部 Code Runtime mock 产物，后续可替换为 Codex CLI 的真实输出。',
      `// Task: ${task.id}`,
      `export const courtTaskTitle = ${JSON.stringify(task.title)};`,
      `export const codexOutput = ${JSON.stringify(shellResult.data?.stdout || shellResult.output)};`,
    ].join('\n');
    this.services.workspace.writeFile(task.id, 'src/codex-result.ts', codeContent);
    const codeArtifact = this.services.artifacts.createArtifact({
      taskId: task.id,
      agentId: agent.id,
      type: 'code',
      title: 'Codex mock 代码产物',
      content: codeContent,
    });
    const jsonArtifact = this.services.artifacts.createArtifact({
      taskId: task.id,
      agentId: agent.id,
      type: 'json',
      title: 'Code Runtime 执行摘要',
      content: JSON.stringify({
        taskId: task.id,
        workspacePath: workspace.path,
        command: shellCommand,
        shell: shellResult.data,
      }, null, 2),
    });

    this.services.memory.rememberTask(task.id, `兵部 Code Runtime 已生成工作区 ${workspace.path}`, ['code-runtime']);
    return {
      workspacePath: workspace.path,
      command: shellCommand,
      output: shellResult.data?.stdout || shellResult.output,
      artifacts: [shellArtifact, markdownArtifact, codeArtifact, jsonArtifact],
    };
  }
}
