import { BaseMockModelAdapter, type ModelProvider } from './baseAdapter';

export class OpenAIAdapter extends BaseMockModelAdapter {
  // OpenAI 适配器先保留 mock 行为，后续只需要替换 generate 实现。
  provider: ModelProvider = 'openai';
}
