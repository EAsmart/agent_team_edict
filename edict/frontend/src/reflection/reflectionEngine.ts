import type { RegisteredAgent } from '../agentRegistry';
import type { CourtTask } from '../taskBus';
import type { DynamicPlan } from '../planner/llmPlanner';

export type ReflectionReport = {
  taskId: string;
  agentId?: string;
  summary: string;
  risks: string[];
  shouldReplan: boolean;
  createdAt: string;
};

function nowText() {
  // Reflection 报告同样只保存在本地内存中。
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export class ReflectionEngine {
  reflectPlan(task: CourtTask, plan: DynamicPlan): ReflectionReport {
    // 太子对计划做自检：缺少执行部门或风险词命中时要求重新规划。
    const risks: string[] = [];
    const executorStep = plan.steps.find((step) => step.parallel);
    if (!executorStep || executorStep.agentIds.length === 0) risks.push('计划缺少执行部门');
    if (task.content.length < 8) risks.push('圣旨内容过短，目标可能不清晰');
    if (/删除|重置|危险|权限|密钥/.test(task.content)) risks.push('圣旨包含高风险关键词');
    return {
      taskId: task.id,
      summary: risks.length > 0 ? `计划存在 ${risks.length} 项风险` : '计划自检通过',
      risks,
      shouldReplan: risks.includes('计划缺少执行部门'),
      createdAt: nowText(),
    };
  }

  reflectAgent(task: CourtTask, agent: RegisteredAgent, output: string): ReflectionReport {
    // Agent 自检自身输出，必要时触发太子后续重新规划。
    const risks: string[] = [];
    if (!output.trim()) risks.push('Agent 输出为空');
    if (agent.id === 'bingbu' && !/代码|Code|Runtime|codex|构建/.test(output)) risks.push('兵部输出缺少代码执行证据');
    if (/失败|错误|blocked|error/i.test(output)) risks.push('输出包含失败信号');
    return {
      taskId: task.id,
      agentId: agent.id,
      summary: risks.length > 0 ? `${agent.department}自检发现风险：${risks.join('、')}` : `${agent.department}自检通过`,
      risks,
      shouldReplan: risks.some((risk) => risk.includes('失败') || risk.includes('为空')),
      createdAt: nowText(),
    };
  }
}
