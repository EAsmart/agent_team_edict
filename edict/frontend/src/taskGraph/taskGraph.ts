import type { DynamicPlan, DynamicPlanStep } from '../planner/llmPlanner';

export type TaskGraphNodeStatus = 'pending' | 'running' | 'completed' | 'blocked';

export type TaskGraphNode = {
  id: string;
  taskId: string;
  title: string;
  goal: string;
  agentIds: string[];
  parentId?: string;
  dependsOn: string[];
  status: TaskGraphNodeStatus;
};

export class TaskGraph {
  private nodes = new Map<string, TaskGraphNode>();

  buildFromPlan(plan: DynamicPlan) {
    // 根据动态计划生成任务树，计划步骤会变成可追踪子任务节点。
    plan.steps.forEach((step) => this.addStep(plan.taskId, step));
    return this.listByTask(plan.taskId);
  }

  addStep(taskId: string, step: DynamicPlanStep, parentId?: string) {
    // 子任务节点保留依赖关系，后续可以驱动更细粒度调度。
    const node: TaskGraphNode = {
      id: step.id,
      taskId,
      title: step.title,
      goal: step.goal,
      agentIds: [...step.agentIds],
      parentId,
      dependsOn: [...step.dependsOn],
      status: 'pending',
    };
    this.nodes.set(node.id, node);
    return node;
  }

  updateStatus(nodeId: string, status: TaskGraphNodeStatus) {
    // Agent 执行前后更新任务图状态。
    const node = this.nodes.get(nodeId);
    if (!node) return;
    this.nodes.set(nodeId, { ...node, status });
  }

  listByTask(taskId: string) {
    // 返回单个 CourtTask 的任务树节点。
    return Array.from(this.nodes.values()).filter((node) => node.taskId === taskId);
  }

  getReadyNodes(taskId: string) {
    // 找出依赖已完成的 pending 节点，预留给后续更精细调度器。
    const nodes = this.listByTask(taskId);
    const completed = new Set(nodes.filter((node) => node.status === 'completed').map((node) => node.id));
    return nodes.filter((node) => node.status === 'pending' && node.dependsOn.every((id) => completed.has(id)));
  }
}
