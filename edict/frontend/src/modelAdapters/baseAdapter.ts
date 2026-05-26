import type { RegisteredAgent } from '../agentRegistry';
import type { CourtTask } from '../taskBus';

export type ModelProvider = 'openai' | 'claude' | 'gemini' | 'codex' | 'local';

export type ModelRequest = {
  agent: RegisteredAgent;
  task: CourtTask;
  prompt: string;
  purpose: string;
};

export type ModelResponse = {
  provider: ModelProvider;
  model: string;
  content: string;
  mocked: true;
  createdAt: string;
};

export interface ModelAdapter {
  provider: ModelProvider;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export abstract class BaseMockModelAdapter implements ModelAdapter {
  abstract provider: ModelProvider;

  async generate(request: ModelRequest): Promise<ModelResponse> {
    // 当前阶段不接真实 API，只返回带供应商标签的 mock 输出。
    return {
      provider: this.provider,
      model: request.agent.modelName,
      content: this.buildMockContent(request),
      mocked: true,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
  }

  protected buildMockContent(request: ModelRequest) {
    // mock 输出保留任务、官职和用途，便于日志追踪动态编排过程。
    return `${request.agent.department}基于 ${this.provider}/${request.agent.modelName} 完成「${request.purpose}」：已处理《${request.task.title}》。`;
  }
}
