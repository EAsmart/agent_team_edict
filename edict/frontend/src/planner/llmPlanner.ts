import type { AgentRegistry, RegisteredAgent } from '../agentRegistry';
import type { CourtTask } from '../taskBus';
import type { RetrievalResult } from '../retrieval/retrievalEngine';
import type { ReflectionReport } from '../reflection/reflectionEngine';
import type { ModelProvider } from '../modelAdapters/baseAdapter';

export type DynamicPlanStep = {
  id: string;
  title: string;
  goal: string;
  agentIds: string[];
  parallel: boolean;
  dependsOn: string[];
  expectedArtifacts: string[];
};

export type ModelSelection = {
  agentId: string;
  provider: ModelProvider;
  modelName: string;
  reason: string;
};

export type DynamicPlan = {
  id: string;
  taskId: string;
  objective: string;
  steps: DynamicPlanStep[];
  modelSelections: ModelSelection[];
  createdAt: string;
  reason: string;
};

function nowText() {
  // Planner 只生成前端本地计划，时间用于日志和任务图展示。
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function hasAny(text: string, keywords: string[]) {
  // 关键词只作为 mock LLM planner 的启发信号，后续可替换成真实模型输出。
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function pickAgent(registry: AgentRegistry, agentId: string) {
  // 读取已启用 Agent，避免计划派发到停用官职。
  const agent = registry.getAgent(agentId);
  return agent?.enabled ? agent : undefined;
}

function chooseProvider(agent: RegisteredAgent, taskText: string): ModelSelection {
  // Multi-LLM Orchestration：太子根据任务类型和官职能力动态选择模型供应商。
  const engineering = hasAny(taskText, ['代码', 'bug', '测试', '构建', '前端', '后端', '接口', 'runtime']);
  const review = hasAny(taskText, ['风险', '安全', '合规', '审计', '权限']);
  const writing = hasAny(taskText, ['文档', '公告', '报告', '总结', '发布']);
  let provider: ModelProvider = (agent.modelProvider || 'local') as ModelProvider;
  let modelName = agent.modelName;
  let reason = '沿用官职默认模型';

  if (agent.id === 'taizi' || agent.id === 'bingbu' || engineering) {
    provider = 'codex';
    modelName = agent.id === 'bingbu' ? 'mock-codex-code-runtime' : 'mock-codex-planner';
    reason = '任务偏工程或编排，选择 Codex mock 模型';
  } else if (agent.id === 'menxia' || review) {
    provider = 'claude';
    modelName = 'mock-claude-review';
    reason = '任务偏审查与风险，选择 Claude mock 模型';
  } else if (agent.id === 'gongbu') {
    provider = 'gemini';
    modelName = 'mock-gemini-ops';
    reason = '任务偏运行环境，选择 Gemini mock 模型';
  } else if (writing || agent.id === 'libu') {
    provider = 'openai';
    modelName = 'mock-openai-writing';
    reason = '任务偏文档表达，选择 OpenAI mock 模型';
  }

  return { agentId: agent.id, provider, modelName, reason };
}

export class LLMPlanner {
  constructor(private registry: AgentRegistry) {}

  createPlan(task: CourtTask, retrievals: RetrievalResult[] = []): DynamicPlan {
    // 太子 Planner 不再读取 workflow.json 固定规则，而是根据任务、记忆和产物动态生成步骤。
    const taskText = `${task.title}\n${task.content}`;
    const steps: DynamicPlanStep[] = [];
    const selectedAgents = new Set<string>();

    const required = ['zhongshu', 'menxia', 'shangshu']
      .map((agentId) => pickAgent(this.registry, agentId))
      .filter(Boolean) as RegisteredAgent[];
    required.forEach((agent, index) => {
      selectedAgents.add(agent.id);
      steps.push({
        id: `stage-${agent.id}`,
        title: `${agent.department}${index === 0 ? '拟旨' : index === 1 ? '封驳' : '领旨'}`,
        goal: `${agent.department}基于圣旨形成${index === 0 ? '规划方案' : index === 1 ? '风险复核' : '执行派发'}。`,
        agentIds: [agent.id],
        parallel: false,
        dependsOn: index === 0 ? [] : [`stage-${required[index - 1].id}`],
        expectedArtifacts: ['markdown'],
      });
    });

    const executorIds: string[] = [];
    if (hasAny(taskText, ['预算', '资金', '成本', '数据', '报表', '指标', '资源'])) executorIds.push('hubu');
    if (hasAny(taskText, ['文档', '公告', '报告', '规范', '发布', '沟通', '说明'])) executorIds.push('libu');
    if (hasAny(taskText, ['代码', 'bug', '测试', '构建', '实现', '前端', '后端', '接口', 'runtime', '工具'])) executorIds.push('bingbu');
    if (hasAny(taskText, ['安全', '合规', '审计', '权限', '风险', '漏洞'])) executorIds.push('xingbu');
    if (hasAny(taskText, ['部署', '服务器', '环境', '端口', '容器', '监控', '运维', 'playwright'])) executorIds.push('gongbu');
    if (hasAny(taskText, ['人员', '培训', '组织', '职责', 'agent', '官职', '团队'])) executorIds.push('libu_hr');

    if (retrievals.some((item) => item.type === 'artifact' && item.score > 0.4)) {
      // 如果检索到历史产物，优先让礼部整理上下文，让兵部复用代码。
      executorIds.push('libu', 'bingbu');
    }
    if (executorIds.length === 0) executorIds.push('libu', 'bingbu');

    const enabledExecutorIds = Array.from(new Set(executorIds))
      .map((agentId) => pickAgent(this.registry, agentId))
      .filter(Boolean)
      .map((agent) => agent!.id);
    enabledExecutorIds.forEach((agentId) => selectedAgents.add(agentId));

    const previousStage = steps[steps.length - 1]?.id;
    steps.push({
      id: 'stage-liubu-parallel',
      title: '六部并行执行',
      goal: '按任务性质让相关六部同时产出回奏、代码、文档或风险结论。',
      agentIds: enabledExecutorIds,
      parallel: true,
      dependsOn: previousStage ? [previousStage] : [],
      expectedArtifacts: ['code', 'markdown', 'json', 'shell'],
    });

    const modelSelections = Array.from(selectedAgents)
      .map((agentId) => this.registry.getAgent(agentId))
      .filter(Boolean)
      .map((agent) => chooseProvider(agent!, taskText));

    return {
      id: `plan-${task.id}-${Date.now()}`,
      taskId: task.id,
      objective: `完成圣旨「${task.title}」的动态朝堂编排`,
      steps,
      modelSelections,
      createdAt: nowText(),
      reason: `太子基于圣旨内容、检索结果 ${retrievals.length} 条和可用 Agent 动态生成计划。`,
    };
  }

  replan(task: CourtTask, previousPlan: DynamicPlan, reflection: ReflectionReport): DynamicPlan {
    // Reflection 发现风险时，太子会追加补救步骤，而不是回退到固定 workflow。
    const next = this.createPlan(task, []);
    if (reflection.shouldReplan) {
      const menxia = pickAgent(this.registry, 'menxia');
      if (menxia) {
        next.steps.splice(Math.max(next.steps.length - 1, 0), 0, {
          id: `stage-reflection-${Date.now()}`,
          title: '反思复核',
          goal: `针对风险重新复核：${reflection.risks.join('、') || '计划一致性'}`,
          agentIds: [menxia.id],
          parallel: false,
          dependsOn: previousPlan.steps.slice(-1).map((step) => step.id),
          expectedArtifacts: ['markdown'],
        });
      }
      next.reason = `根据反思报告自动重新规划：${reflection.summary}`;
    }
    return next;
  }
}
