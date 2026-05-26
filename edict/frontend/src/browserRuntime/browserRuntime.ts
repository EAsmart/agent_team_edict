import type { CourtTask } from '../taskBus';

export type BrowserRuntimeAction = {
  type: 'screenshot' | 'navigate' | 'assert';
  target: string;
  note: string;
};

export class BrowserRuntime {
  private actions = new Map<string, BrowserRuntimeAction[]>();

  recordPlannedAction(task: CourtTask, action: BrowserRuntimeAction) {
    // Playwright Runtime 预留入口：当前只记录计划动作，不启动真实浏览器。
    this.actions.set(task.id, [action, ...(this.actions.get(task.id) || [])]);
    return action;
  }

  listActions(taskId: string) {
    // 后续接入 Playwright 后，UI 可读取这些动作作为浏览器执行轨迹。
    return [...(this.actions.get(taskId) || [])];
  }
}
