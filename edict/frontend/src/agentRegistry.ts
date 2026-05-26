export type AgentRuntimeRole =
  | 'emperor'
  | 'orchestrator'
  | 'planner'
  | 'reviewer'
  | 'dispatcher'
  | 'executor'
  | 'specialist';

export type AgentRuntimeState = 'idle' | 'running' | 'completed' | 'disabled';

export type RegisteredAgent = {
  id: string;
  name: string;
  department: string;
  role: AgentRuntimeRole;
  enabled: boolean;
  modelProvider: string;
  modelName: string;
  capabilities: string[];
  systemPrompt: string;
  state: AgentRuntimeState;
  lastTaskId?: string;
};

export class AgentRegistry {
  private agents = new Map<string, RegisteredAgent>();

  registerAgent(agent: RegisteredAgent) {
    // 注册或覆盖 Agent，运行时只通过 Registry 查询可用官职。
    this.agents.set(agent.id, { ...agent });
  }

  getAgent(agentId: string) {
    // 按 ID 读取单个 Agent 快照，避免调用方直接改内部状态。
    const agent = this.agents.get(agentId);
    return agent ? { ...agent, capabilities: [...agent.capabilities] } : undefined;
  }

  getEnabledAgents() {
    // 只返回已启用 Agent，太子编排时会用它过滤工作流候选。
    return this.listAgents().filter((agent) => agent.enabled);
  }

  getAgentsByRole(role: AgentRuntimeRole) {
    // 按运行时角色筛选 Agent，支持 planner、reviewer、executor 等动态组合。
    return this.getEnabledAgents().filter((agent) => agent.role === role);
  }

  updateAgentState(agentId: string, state: AgentRuntimeState, lastTaskId?: string) {
    // Agent 状态变化集中写入 Registry，方便后续 UI 或日志订阅。
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.agents.set(agentId, { ...agent, state, lastTaskId });
  }

  updateAgentModel(agentId: string, modelProvider: string, modelName: string) {
    // 太子 Multi-LLM 编排时可以临时调整 Agent 的运行模型配置。
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.agents.set(agentId, { ...agent, modelProvider, modelName });
  }

  listAgents() {
    // 返回全量 Agent 快照，保持 Registry 内部 Map 不被外部引用。
    return Array.from(this.agents.values()).map((agent) => ({
      ...agent,
      capabilities: [...agent.capabilities],
    }));
  }
}

export function createDefaultAgentRegistry() {
  // 默认注册保持原项目皇上、太子、三省、尚书省、六部体系不变。
  const registry = new AgentRegistry();
  const defaults: RegisteredAgent[] = [
    {
      id: 'emperor',
      name: '皇上',
      department: '皇上',
      role: 'emperor',
      enabled: true,
      modelProvider: 'local',
      modelName: 'imperial-input',
      capabilities: ['edict', 'decision'],
      systemPrompt: '你是皇上，负责下达圣旨并确认朝堂方向。',
      state: 'idle',
    },
    {
      id: 'taizi',
      name: '太子',
      department: '太子',
      role: 'orchestrator',
      enabled: true,
      modelProvider: 'codex',
      modelName: 'mock-orchestrator',
      capabilities: ['orchestration', 'routing', 'summary'],
      systemPrompt: '你是太子，负责阅旨、动态编排三省六部并汇总回奏。',
      state: 'idle',
    },
    {
      id: 'zhongshu',
      name: '中书省',
      department: '中书省',
      role: 'planner',
      enabled: true,
      modelProvider: 'openai',
      modelName: 'mock-planner',
      capabilities: ['planning', 'decomposition', 'proposal'],
      systemPrompt: '你是中书省，负责拟旨、拆解方案和形成执行章程。',
      state: 'idle',
    },
    {
      id: 'menxia',
      name: '门下省',
      department: '门下省',
      role: 'reviewer',
      enabled: true,
      modelProvider: 'claude',
      modelName: 'mock-reviewer',
      capabilities: ['review', 'risk', 'quality'],
      systemPrompt: '你是门下省，负责封驳、复核风险和审查方案质量。',
      state: 'idle',
    },
    {
      id: 'shangshu',
      name: '尚书省',
      department: '尚书省',
      role: 'dispatcher',
      enabled: true,
      modelProvider: 'gemini',
      modelName: 'mock-dispatcher',
      capabilities: ['dispatch', 'coordination'],
      systemPrompt: '你是尚书省，负责领旨派发并协调六部执行。',
      state: 'idle',
    },
    {
      id: 'hubu',
      name: '户部',
      department: '户部',
      role: 'executor',
      enabled: true,
      modelProvider: 'openai',
      modelName: 'mock-finance',
      capabilities: ['budget', 'data', 'resource', 'cost'],
      systemPrompt: '你是户部，负责预算、资源、数据和成本核算。',
      state: 'idle',
    },
    {
      id: 'libu',
      name: '礼部',
      department: '礼部',
      role: 'executor',
      enabled: true,
      modelProvider: 'claude',
      modelName: 'mock-docs',
      capabilities: ['document', 'communication', 'standard'],
      systemPrompt: '你是礼部，负责文档、规范、公告和对外表述。',
      state: 'idle',
    },
    {
      id: 'bingbu',
      name: '兵部',
      department: '兵部',
      role: 'executor',
      enabled: true,
      modelProvider: 'codex',
      modelName: 'mock-engineering',
      capabilities: ['code', 'implementation', 'debug', 'test'],
      systemPrompt: '你是兵部，负责工程实现、代码执行和技术攻坚。',
      state: 'idle',
    },
    {
      id: 'xingbu',
      name: '刑部',
      department: '刑部',
      role: 'executor',
      enabled: true,
      modelProvider: 'claude',
      modelName: 'mock-audit',
      capabilities: ['security', 'compliance', 'audit', 'risk'],
      systemPrompt: '你是刑部，负责安全、合规、审计和红线检查。',
      state: 'idle',
    },
    {
      id: 'gongbu',
      name: '工部',
      department: '工部',
      role: 'executor',
      enabled: true,
      modelProvider: 'gemini',
      modelName: 'mock-infra',
      capabilities: ['infra', 'deploy', 'ops', 'environment'],
      systemPrompt: '你是工部，负责基础设施、部署、环境和运行维护。',
      state: 'idle',
    },
    {
      id: 'libu_hr',
      name: '吏部',
      department: '吏部',
      role: 'executor',
      enabled: true,
      modelProvider: 'openai',
      modelName: 'mock-organization',
      capabilities: ['people', 'training', 'organization', 'agent'],
      systemPrompt: '你是吏部，负责人事、训练、组织和 Agent 能力管理。',
      state: 'idle',
    },
  ];

  defaults.forEach((agent) => registry.registerAgent(agent));
  return registry;
}
