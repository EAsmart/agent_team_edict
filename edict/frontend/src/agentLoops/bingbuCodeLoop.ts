import type { RegisteredAgent } from '../agentRegistry';
import type { ArtifactStore, RuntimeArtifact } from '../artifacts/artifactStore';
import type { CodeRuntime } from '../codeRuntime/codeRuntime';
import type { MemoryEngine } from '../memoryEngine';
import type { ReflectionEngine } from '../reflection/reflectionEngine';
import type { SandboxPolicy } from '../sandbox/sandboxPolicy';
import type { CourtTask } from '../taskBus';
import type { ShellToolInput, ShellToolOutput } from '../tools/shellTool';
import type { ToolRegistry } from '../tools/toolRegistry';
import type { WorkspaceRuntime } from '../workspace/workspaceRuntime';

export type AgentLoopResult = {
  success: boolean;
  attempts: number;
  summary: string;
  artifacts: RuntimeArtifact[];
};

export type BingbuLoopServices = {
  codeRuntime: CodeRuntime;
  tools: ToolRegistry;
  workspace: WorkspaceRuntime;
  memory: MemoryEngine;
  artifacts: ArtifactStore;
  sandbox: SandboxPolicy;
  reflection: ReflectionEngine;
};

export class BingbuCodeLoop {
  constructor(private services: BingbuLoopServices, private maxAttempts = 3) {}

  async run(task: CourtTask, agent: RegisteredAgent): Promise<AgentLoopResult> {
    // 兵部 Agent Loop：生成代码、模拟 build、反思失败、写入修复，再循环到成功或达到上限。
    const artifacts: RuntimeArtifact[] = [];
    let summary = '';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const codeResult = await this.services.codeRuntime.generateCodeTask(
        task,
        agent,
        `第 ${attempt} 轮：生成代码、准备构建并根据失败信息自动修复。`,
      );
      artifacts.push(...codeResult.artifacts);

      const buildCommand = attempt === 1 ? 'echo build-start' : 'echo build-success';
      const buildResult = await this.services.tools.runTool<ShellToolInput, ShellToolOutput>(
        'ShellTool',
        { command: buildCommand },
        {
          task,
          agent,
          workspace: this.services.workspace,
          memory: this.services.memory,
          artifacts: this.services.artifacts,
          sandbox: this.services.sandbox,
        },
      );

      const buildArtifact = this.services.artifacts.createArtifact({
        taskId: task.id,
        agentId: agent.id,
        type: 'shell',
        title: `第 ${attempt} 轮构建输出`,
        content: buildResult.data?.stdout || buildResult.output,
      });
      artifacts.push(buildArtifact);

      const reflection = this.services.reflection.reflectAgent(task, agent, buildResult.output);
      this.services.memory.rememberTask(task.id, `兵部第 ${attempt} 轮构建：${buildResult.output}`, ['agent-loop', 'build']);
      if (buildResult.ok && !reflection.shouldReplan) {
        summary = `兵部 Agent Loop 第 ${attempt} 轮构建成功。`;
        return { success: true, attempts: attempt, summary, artifacts };
      }

      const fixContent = [
        '// 兵部自动修复记录',
        `// attempt: ${attempt}`,
        `// reason: ${reflection.summary}`,
        'export const fixed = true;',
      ].join('\n');
      this.services.workspace.writeFile(task.id, `fixes/attempt-${attempt}.ts`, fixContent);
      artifacts.push(this.services.artifacts.createArtifact({
        taskId: task.id,
        agentId: agent.id,
        type: 'code',
        title: `第 ${attempt} 轮自动修复`,
        content: fixContent,
      }));
      summary = `兵部第 ${attempt} 轮未完全通过，已写入自动修复。`;
    }

    return { success: false, attempts: this.maxAttempts, summary, artifacts };
  }
}
