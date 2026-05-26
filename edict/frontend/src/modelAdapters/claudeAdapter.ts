import { BaseMockModelAdapter, type ModelProvider } from './baseAdapter';

export class ClaudeAdapter extends BaseMockModelAdapter {
  // Claude 适配器先保留 mock 行为，避免第四阶段触碰真实 API。
  provider: ModelProvider = 'claude';
}
