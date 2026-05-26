import { BaseMockModelAdapter, type ModelProvider } from './baseAdapter';

export class GeminiAdapter extends BaseMockModelAdapter {
  // Gemini 适配器先保留 mock 行为，运行时只生成本地演示文本。
  provider: ModelProvider = 'gemini';
}
