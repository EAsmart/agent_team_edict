import type { RuntimeArtifact } from '../artifacts/artifactStore';
import type { MemoryEngine } from '../memoryEngine';
import type { CourtTask } from '../taskBus';
import type { SandboxPolicy } from '../sandbox/sandboxPolicy';
import type { WorkspaceRuntime } from '../workspace/workspaceRuntime';
import type { ArtifactStore } from '../artifacts/artifactStore';
import type { RegisteredAgent } from '../agentRegistry';

export type ToolRunResult<T = unknown> = {
  ok: boolean;
  output: string;
  data?: T;
  artifacts?: RuntimeArtifact[];
};

export type ToolContext = {
  task: CourtTask;
  agent: RegisteredAgent;
  workspace: WorkspaceRuntime;
  memory: MemoryEngine;
  artifacts: ArtifactStore;
  sandbox: SandboxPolicy;
};

export interface RuntimeTool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  run(input: TInput, context: ToolContext): Promise<ToolRunResult<TOutput>>;
}
