import { api, type RuntimeArtifact, type RuntimeModelConfig, type RuntimeModelMessage, type RuntimeModelProfile } from './api';

export type ModelRouterResult = {
  ok: boolean;
  mode: 'real' | 'mock';
  content: string;
  artifact?: RuntimeArtifact;
  error?: string;
};

type RouteInput = {
  taskId: string;
  agentId: string;
  title: string;
  messages: RuntimeModelMessage[];
  fallback: string;
  timeoutSec?: number;
};

type ModelRouterLogger = (agentId: string, status: 'ok' | 'err' | 'info', content: string) => void;

export class ModelRouter {
  constructor(
    private readonly config: RuntimeModelConfig,
    private readonly log?: ModelRouterLogger,
  ) {}

  async generate(input: RouteInput): Promise<ModelRouterResult> {
    const boundModel = this.findAgentModel(input.agentId);
    if (this.config.mode !== 'real' || !boundModel) {
      return this.saveMock(input, boundModel ? 'Runtime is in mock mode' : 'Agent has no bound real model');
    }

    this.log?.(input.agentId, 'info', `Routing to ${boundModel.name || boundModel.id} / ${boundModel.model}`);
    try {
      const result = await api.runtimeModelChat({
        taskId: input.taskId,
        agentId: input.agentId,
        config: boundModel,
        messages: input.messages,
        timeoutSec: input.timeoutSec || 60,
      });
      if (!result.ok) {
        this.log?.(input.agentId, 'err', result.error || 'Model call failed; falling back to mock');
        return this.saveMock(input, result.error || 'Model call failed');
      }
      const content = result.message || input.fallback;
      this.log?.(input.agentId, 'ok', `${input.title} completed; artifact ${result.artifact?.id || 'saved'}`);
      return { ok: true, mode: 'real', content, artifact: result.artifact };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log?.(input.agentId, 'err', `${message}; falling back to mock`);
      return this.saveMock(input, message);
    }
  }

  private findAgentModel(agentId: string): RuntimeModelProfile | undefined {
    const binding = this.config.agentModels?.[agentId];
    const models = this.config.models || [];
    const fromList = models.find((model) => model.id === binding && model.enabled !== false);
    if (fromList) return fromList;

    if (!binding && this.config.model && this.config.baseUrl && this.config.hasApiKey) {
      return {
        id: 'default',
        name: 'Default Runtime Model',
        provider: 'openai-compatible',
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey,
        apiKeyMasked: this.config.apiKeyMasked,
        hasApiKey: this.config.hasApiKey,
        model: this.config.model,
        enabled: true,
      };
    }
    return undefined;
  }

  private async saveMock(input: RouteInput, reason: string): Promise<ModelRouterResult> {
    await this.writeEvent(input, reason);
    try {
      const artifactResult = await api.saveRuntimeArtifact({
        taskId: input.taskId,
        agentId: input.agentId,
        type: 'markdown',
        title: `${input.agentId} mock output - ${input.title}`,
        content: input.fallback,
      });
      this.log?.(input.agentId, 'info', `Mock fallback saved; artifact ${artifactResult.artifact?.id || 'saved'}`);
      return { ok: true, mode: 'mock', content: input.fallback, artifact: artifactResult.artifact, error: reason };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log?.(input.agentId, 'err', `Mock artifact save failed: ${message}`);
      return { ok: true, mode: 'mock', content: input.fallback, error: reason };
    }
  }

  private async writeEvent(input: RouteInput, reason: string) {
    try {
      await api.runtimeEvent({
        taskId: input.taskId,
        type: 'model.mock_fallback',
        from: input.agentId,
        to: 'ModelRouter',
        content: `Mock fallback for ${input.title}: ${reason}`,
        payload: { title: input.title },
      });
    } catch {
      // Logging failures should not stop task execution.
    }
  }
}
