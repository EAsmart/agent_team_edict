import type { RuntimeTool, ToolContext, ToolRunResult } from './baseTool';
import { FileTool } from './fileTool';
import { MemoryTool } from './memoryTool';
import { SearchTool } from './searchTool';
import { ShellTool } from './shellTool';

export class ToolRegistry {
  private tools = new Map<string, RuntimeTool>();

  register(tool: RuntimeTool) {
    // 所有工具通过统一注册表暴露给 Agent Runtime。
    this.tools.set(tool.name, tool);
  }

  getTool<TInput = Record<string, unknown>, TOutput = unknown>(name: string) {
    // 读取工具时保留泛型，方便调用方获得输入输出类型提示。
    return this.tools.get(name) as RuntimeTool<TInput, TOutput> | undefined;
  }

  listTools() {
    // 返回工具清单，后续可展示到 UI 或写入日志。
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  async runTool<TInput = Record<string, unknown>, TOutput = unknown>(
    name: string,
    input: TInput,
    context: ToolContext,
  ): Promise<ToolRunResult<TOutput>> {
    // Agent 调用工具的统一入口，未注册工具会直接返回失败。
    const tool = this.getTool<TInput, TOutput>(name);
    if (!tool) return { ok: false, output: `工具 ${name} 未注册` };
    return tool.run(input, context);
  }
}

export function createDefaultToolRegistry() {
  // 默认注册第五阶段要求的 File、Shell、Search、Memory 四类工具。
  const registry = new ToolRegistry();
  registry.register(new FileTool());
  registry.register(new ShellTool());
  registry.register(new SearchTool());
  registry.register(new MemoryTool());
  return registry;
}
