import type { RuntimeTool, ToolContext } from './baseTool';
import type { WorkspaceFile } from '../workspace/workspaceRuntime';

export type FileToolInput = {
  action: 'write' | 'read' | 'list';
  path?: string;
  content?: string;
};

export class FileTool implements RuntimeTool<FileToolInput, WorkspaceFile | WorkspaceFile[] | undefined> {
  name = 'FileTool';
  description = '在任务独立工作区内读写和列出文件';

  async run(input: FileToolInput, context: ToolContext) {
    // FileTool 只操作当前任务工作区，不访问真实磁盘。
    if (input.action === 'write') {
      if (!input.path) return { ok: false, output: '缺少写入路径' };
      const file = context.workspace.writeFile(context.task.id, input.path, input.content || '');
      return { ok: true, output: `已写入 ${file.path}`, data: file };
    }
    if (input.action === 'read') {
      if (!input.path) return { ok: false, output: '缺少读取路径' };
      const file = context.workspace.readFile(context.task.id, input.path);
      return { ok: !!file, output: file ? file.content : '文件不存在', data: file };
    }
    return {
      ok: true,
      output: `共 ${context.workspace.listFiles(context.task.id).length} 个文件`,
      data: context.workspace.listFiles(context.task.id),
    };
  }
}
