import { BaseMockModelAdapter, type ModelProvider } from './baseAdapter';

export class CodexAdapter extends BaseMockModelAdapter {
  // Codex 适配器用于太子编排和兵部工程类任务的 mock 输出。
  provider: ModelProvider = 'codex';
}
