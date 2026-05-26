import {
  createDefaultAgentRegistry,
  type AgentRuntimeRole,
  type AgentRuntimeState,
  type AgentRegistry,
  type RegisteredAgent,
} from './agentRegistry';
import { MemoryEngine } from './memoryEngine';
import { ClaudeAdapter } from './modelAdapters/claudeAdapter';
import { CodexAdapter } from './modelAdapters/codexAdapter';
import { GeminiAdapter } from './modelAdapters/geminiAdapter';
import { OpenAIAdapter } from './modelAdapters/openaiAdapter';
import type { ModelAdapter, ModelProvider } from './modelAdapters/baseAdapter';
import { PromptRuntime } from './prompts/promptRuntime';
import { loadDefaultWorkflow, type CourtWorkflowDefinition } from './workflow/workflowLoader';
import { ArtifactStore } from './artifacts/artifactStore';
import { CodeRuntime } from './codeRuntime/codeRuntime';
import { createDefaultSandboxPolicy, type SandboxPolicy } from './sandbox/sandboxPolicy';
import { createDefaultToolRegistry, type ToolRegistry } from './tools/toolRegistry';
import { WorkspaceRuntime } from './workspace/workspaceRuntime';
import { BrowserRuntime } from './browserRuntime/browserRuntime';
import { BingbuCodeLoop } from './agentLoops/bingbuCodeLoop';
import { LLMPlanner, type DynamicPlan, type ModelSelection } from './planner/llmPlanner';
import { ToolPlanner } from './planner/toolPlanner';
import { ReflectionEngine } from './reflection/reflectionEngine';
import { RetrievalEngine, type RetrievalResult } from './retrieval/retrievalEngine';
import { TaskGraph } from './taskGraph/taskGraph';

// TaskBus 是前端内存任务总线，第四阶段升级为动态 Agent Runtime，不连接真实 AI 或后端调度。
export type CourtTaskStatus = 'created' | 'running' | 'completed' | 'blocked';

export type AgentMessageType =
  | 'task.created'
  | 'task.update'
  | 'task.completed'
  | 'task.log'
  | 'agent.message'
  | 'agent.status';

export type CourtTaskLog = {
  at: string;
  from: string;
  to?: string;
  type: AgentMessageType;
  content: string;
};

export type CourtTask = {
  id: string;
  title: string;
  content: string;
  status: CourtTaskStatus;
  currentDepartment: string;
  logs: CourtTaskLog[];
  createdAt: string;
  updatedAt: string;
};

export type AgentMessage = {
  from: string;
  to: string;
  type: AgentMessageType;
  content: string;
  timestamp: string;
  taskId?: string;
  payload?: Record<string, unknown>;
};

export type TaskBusEvent = {
  message: AgentMessage;
  task?: CourtTask;
};

export type AgentProcessContext = {
  routeAgentIds?: string[];
  routeReason?: string;
  matchedRuleLabels?: string[];
  planId?: string;
  stepId?: string;
  goal?: string;
  modelSelection?: ModelSelection;
};

type TaskBusHandler = (event: TaskBusEvent) => void;

type RuntimeServices = {
  workspace: WorkspaceRuntime;
  artifacts: ArtifactStore;
  sandbox: SandboxPolicy;
  tools: ToolRegistry;
  codeRuntime: CodeRuntime;
  codeLoop: BingbuCodeLoop;
  planner: LLMPlanner;
  toolPlanner: ToolPlanner;
  retrieval: RetrievalEngine;
  reflection: ReflectionEngine;
  taskGraph: TaskGraph;
  browserRuntime: BrowserRuntime;
};

function nowText() {
  // 统一事件时间格式，便于 UI 直接显示。
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function wait(ms: number) {
  // mock Runtime 用固定延迟模拟 Agent 思考和执行耗时。
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function roleLabel(role: AgentRuntimeRole) {
  // 运行时角色翻译成朝堂语义，写入日志时更容易读。
  const labels: Record<AgentRuntimeRole, string> = {
    emperor: '下旨',
    orchestrator: '编排',
    planner: '拟旨',
    reviewer: '封驳',
    dispatcher: '领旨',
    executor: '执行',
    specialist: '专办',
  };
  return labels[role];
}

export class TaskBus {
  private tasks = new Map<string, CourtTask>();
  private subscribers = new Map<string, Set<TaskBusHandler>>();

  subscribe(type: AgentMessageType | '*', handler: TaskBusHandler) {
    // 订阅指定事件，'*' 表示订阅所有事件；返回取消订阅函数。
    const handlers = this.subscribers.get(type) || new Set<TaskBusHandler>();
    handlers.add(handler);
    this.subscribers.set(type, handlers);
    return () => {
      handlers.delete(handler);
    };
  }

  publish(message: AgentMessage, task?: CourtTask) {
    // 发布事件给对应类型订阅者和全量订阅者。
    const event = { message, task };
    this.subscribers.get(message.type)?.forEach((handler) => handler(event));
    this.subscribers.get('*')?.forEach((handler) => handler(event));
  }

  emit(
    from: string,
    to: string,
    type: AgentMessageType,
    content: string,
    taskId?: string,
    payload?: Record<string, unknown>,
  ) {
    // emit 是便捷发布方法，供 Agent 与 UI 统一发消息。
    const task = taskId ? this.tasks.get(taskId) : undefined;
    this.publish({ from, to, type, content, timestamp: nowText(), taskId, payload }, task);
  }

  createTask(task: CourtTask) {
    // 创建任务后立即广播 task.created，任务仍只存在前端内存。
    this.tasks.set(task.id, task);
    this.publish({
      from: '皇上',
      to: '太子',
      type: 'task.created',
      content: `皇上下旨：${task.title}`,
      timestamp: nowText(),
      taskId: task.id,
    }, task);
  }

  updateTask(taskId: string, patch: Partial<CourtTask>, log?: Omit<CourtTaskLog, 'at'>) {
    // task update 会合并任务字段、追加日志，并广播最新任务快照。
    const current = this.tasks.get(taskId);
    if (!current) return;
    const nextLog = log ? [{ at: nowText(), ...log }, ...current.logs] : current.logs;
    const next = {
      ...current,
      ...patch,
      logs: nextLog,
      updatedAt: nowText(),
    };
    this.tasks.set(taskId, next);
    this.publish({
      from: log?.from || patch.currentDepartment || current.currentDepartment,
      to: log?.to || '朝堂',
      type: patch.status === 'completed' ? 'task.completed' : 'task.update',
      content: log?.content || `任务更新：${next.currentDepartment}`,
      timestamp: nowText(),
      taskId,
    }, next);
  }

  getTask(taskId: string) {
    // 读取单个任务快照。
    return this.tasks.get(taskId);
  }

  getTasks() {
    // 读取全部任务快照，按创建顺序由调用方决定展示。
    return Array.from(this.tasks.values());
  }
}

export abstract class CourtAgent {
  constructor(
    protected bus: TaskBus,
    protected registry: AgentRegistry,
    protected memory: MemoryEngine,
    protected promptRuntime: PromptRuntime,
    protected adapters: Record<ModelProvider, ModelAdapter>,
    protected services: RuntimeServices,
    protected profile: RegisteredAgent,
  ) {}

  get id() {
    // 对外保留 id 读取方式，便于 runtime 内部映射。
    return this.profile.id;
  }

  get department() {
    // 对外保留 department 读取方式，日志仍使用原官职名称。
    return this.profile.department;
  }

  async receiveTask(task: CourtTask, context: AgentProcessContext = {}) {
    // Agent 接收任务后广播状态，再进入自身处理逻辑。
    this.setState('running', task.id);
    this.emit('朝堂', 'agent.status', `${this.department}已接收 ${task.id}`, task, context);
    try {
      await this.process(task, context);
      this.setState('completed', task.id);
    } catch (error) {
      this.setState('idle', task.id);
      this.bus.updateTask(task.id, { status: 'blocked', currentDepartment: this.department }, {
        from: this.department,
        to: '太子',
        type: 'task.log',
        content: `${this.department}处理失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  protected abstract process(task: CourtTask, context: AgentProcessContext): Promise<void>;

  protected emit(
    to: string,
    type: AgentMessageType,
    content: string,
    task?: CourtTask,
    payload?: Record<string, unknown>,
  ) {
    // Agent 统一通过 TaskBus 对外发消息，避免组件间直接耦合。
    this.bus.emit(this.department, to, type, content, task?.id, payload);
  }

  protected update(task: CourtTask, department: string, content: string, to = '朝堂') {
    // Agent 更新任务所属部门并写入可见日志。
    this.bus.updateTask(task.id, {
      status: 'running',
      currentDepartment: department,
    }, {
      from: this.department,
      to,
      type: 'task.log',
      content,
    });
  }

  protected async runAutonomousTools(task: CourtTask) {
    // Agent Loop 前置工具规划：先检索上下文，再由 ToolPlanner 决定要调用哪些工具。
    const retrievals = this.services.retrieval.retrieveForTask(task, this.id);
    const calls = this.services.toolPlanner.planTools(this.profile, task, retrievals);
    const outputs: string[] = [];
    for (const call of calls) {
      const result = await this.services.tools.runTool(call.toolName, call.input, {
        task,
        agent: this.profile,
        workspace: this.services.workspace,
        memory: this.memory,
        artifacts: this.services.artifacts,
        sandbox: this.services.sandbox,
      });
      outputs.push(`${call.toolName}: ${result.output}`);
      this.emit('太子', 'agent.message', `${this.department}调用 ${call.toolName}：${result.output}`, task, {
        toolName: call.toolName,
        reason: call.reason,
        ok: result.ok,
      });
    }
    return { retrievals, outputs };
  }

  protected async generateMockOutput(task: CourtTask, purpose: string, state: Record<string, unknown> = {}) {
    // Prompt Runtime 负责拼接上下文，Adapter 负责生成当前阶段的 mock 输出。
    const memory = this.memory.buildMemoryContext(task.id, this.id);
    const modelSelection = state.modelSelection as ModelSelection | undefined;
    const runtimeProfile = modelSelection
      ? { ...this.profile, modelProvider: modelSelection.provider, modelName: modelSelection.modelName }
      : this.profile;
    const prompt = this.promptRuntime.buildPrompt({
      agent: runtimeProfile,
      task,
      memory,
      agentState: {
        role: runtimeProfile.role,
        capabilities: runtimeProfile.capabilities,
        ...state,
      },
    });
    const provider = (runtimeProfile.modelProvider || 'local') as ModelProvider;
    const adapter = this.adapters[provider] || this.adapters.local;
    const response = await adapter.generate({ agent: runtimeProfile, task, prompt, purpose });
    this.memory.rememberAgent(this.id, response.content, [this.profile.role, purpose]);
    this.memory.rememberShortTerm(response.content, task.id, this.id);
    return response;
  }

  private setState(state: AgentRuntimeState, taskId?: string) {
    // Agent 状态统一落入 Registry，同时向 UI 广播。
    this.registry.updateAgentState(this.id, state, taskId);
  }
}

export class TaiziOrchestrator extends CourtAgent {
  constructor(
    bus: TaskBus,
    registry: AgentRegistry,
    memory: MemoryEngine,
    promptRuntime: PromptRuntime,
    adapters: Record<ModelProvider, ModelAdapter>,
    services: RuntimeServices,
    profile: RegisteredAgent,
    private workflow: CourtWorkflowDefinition,
    private agents: Map<string, CourtAgent>,
  ) {
    super(bus, registry, memory, promptRuntime, adapters, services, profile);
  }

  protected async process(task: CourtTask) {
    // 第六阶段由 LLMPlanner 动态规划，不再使用 workflow.json 的固定路由规则。
    const retrievals = this.services.retrieval.retrieveForTask(task, this.id);
    let plan = this.services.planner.createPlan(task, retrievals);
    const reflection = this.services.reflection.reflectPlan(task, plan);
    if (reflection.shouldReplan) {
      plan = this.services.planner.replan(task, plan, reflection);
    }
    this.services.taskGraph.buildFromPlan(plan);

    plan.modelSelections.forEach((selection) => {
      // 太子动态选择各官职模型，Registry 记录当前运行态模型。
      this.registry.updateAgentModel(selection.agentId, selection.provider, selection.modelName);
    });

    const selectedAgentIds = Array.from(new Set(plan.steps.flatMap((step) => step.agentIds)));
    const selectedNames = selectedAgentIds
      .map((agentId) => this.registry.getAgent(agentId)?.department)
      .filter(Boolean)
      .join('、');
    this.memory.rememberTask(task.id, `太子动态计划：${plan.objective}；${plan.reason}`, ['planner']);

    await this.generateMockOutput(task, 'LLM Planner 动态编排', {
      planId: plan.id,
      retrievalCount: retrievals.length,
      modelSelections: plan.modelSelections,
      reflection: reflection.summary,
      modelSelection: plan.modelSelections.find((item) => item.agentId === this.id),
    });

    this.update(
      task,
      '太子',
      `太子阅旨：${plan.reason}。动态步骤 ${plan.steps.length} 个，调度：${selectedNames || '暂无可用部门'}。`,
      selectedNames || '朝堂',
    );

    await this.executePlan(task, plan);

    const latest = this.bus.getTask(task.id) || task;
    if (latest.status !== 'blocked') {
      await wait(800);
      const summary = await this.generateMockOutput(latest, '太子汇总', {
        planId: plan.id,
        routeAgentIds: selectedAgentIds,
        completedDepartments: selectedNames,
        modelSelection: plan.modelSelections.find((item) => item.agentId === this.id),
      });
      this.memory.rememberLongTerm(`任务 ${task.id} 完成：${selectedNames}`, ['completed', 'court-task']);
      this.bus.updateTask(task.id, {
        status: 'completed',
        currentDepartment: '太子',
      }, {
        from: '太子',
        to: '皇上',
        type: 'task.completed',
        content: `太子汇总：${summary.content} 各部回奏完毕，圣旨任务完成。`,
      });
    }
  }

  private async executePlan(task: CourtTask, plan: DynamicPlan) {
    // 根据动态任务图执行步骤：审批类按顺序，六部执行类可并行。
    const allAgentIds = Array.from(new Set(plan.steps.flatMap((step) => step.agentIds)));
    for (const step of plan.steps) {
      if (this.bus.getTask(task.id)?.status === 'blocked') break;
      this.services.taskGraph.updateStatus(step.id, 'running');
      const agentNames = step.agentIds
        .map((agentId) => this.registry.getAgent(agentId)?.department)
        .filter(Boolean)
        .join('、');
      this.bus.emit('太子', agentNames || '朝堂', 'agent.message', `太子执行计划步骤：${step.title}，目标：${step.goal}`, task.id, {
        planId: plan.id,
        stepId: step.id,
        parallel: step.parallel,
      });

      const runAgent = async (agentId: string, index: number) => {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        await wait(step.parallel ? 350 + index * 120 : 700);
        await agent.receiveTask(this.bus.getTask(task.id) || task, {
          routeAgentIds: allAgentIds,
          routeReason: plan.reason,
          matchedRuleLabels: plan.steps.map((item) => item.title),
          planId: plan.id,
          stepId: step.id,
          goal: step.goal,
          modelSelection: plan.modelSelections.find((item) => item.agentId === agentId),
        });
      };

      if (step.parallel) {
        await Promise.all(step.agentIds.map((agentId, index) => runAgent(agentId, index)));
      } else {
        for (const agentId of step.agentIds) {
          await runAgent(agentId, 0);
        }
      }
      this.services.taskGraph.updateStatus(step.id, this.bus.getTask(task.id)?.status === 'blocked' ? 'blocked' : 'completed');
    }
  }
}

export class ZhongshuPlanner extends CourtAgent {
  protected async process(task: CourtTask, context: AgentProcessContext) {
    // 中书省仍是 planner，但是否参与和目标由太子动态计划决定。
    const toolState = await this.runAutonomousTools(task);
    const output = await this.generateMockOutput(task, '拟旨规划', {
      ...context,
      retrievalCount: toolState.retrievals.length,
      toolOutputs: toolState.outputs,
      modelSelection: context.modelSelection,
    });
    this.memory.rememberTask(task.id, output.content, ['planner']);
    const reflection = this.services.reflection.reflectAgent(task, this.profile, output.content);
    this.memory.rememberTask(task.id, reflection.summary, ['reflection', this.id]);
    this.update(task, '中书省', `中书省拟旨：${output.content}`, '太子');
  }
}

export class MenxiaReviewer extends CourtAgent {
  protected async process(task: CourtTask, context: AgentProcessContext) {
    // 门下省负责风险复核，并在输出后写入自检报告。
    const toolState = await this.runAutonomousTools(task);
    const output = await this.generateMockOutput(task, '封驳复核', {
      ...context,
      retrievalCount: toolState.retrievals.length,
      toolOutputs: toolState.outputs,
      modelSelection: context.modelSelection,
    });
    this.memory.rememberTask(task.id, output.content, ['reviewer']);
    const reflection = this.services.reflection.reflectAgent(task, this.profile, output.content);
    this.memory.rememberTask(task.id, reflection.summary, ['reflection', this.id]);
    this.update(task, '门下省', `门下省封驳：${output.content} 风险可控，准奏继续。`, '太子');
  }
}

export class ShangshuDispatcher extends CourtAgent {
  protected async process(task: CourtTask, context: AgentProcessContext) {
    // 尚书省负责领旨派发，工具规划会记录派发上下文。
    const toolState = await this.runAutonomousTools(task);
    const output = await this.generateMockOutput(task, '领旨派发', {
      ...context,
      retrievalCount: toolState.retrievals.length,
      toolOutputs: toolState.outputs,
      modelSelection: context.modelSelection,
    });
    this.memory.rememberTask(task.id, output.content, ['dispatcher']);
    const reflection = this.services.reflection.reflectAgent(task, this.profile, output.content);
    this.memory.rememberTask(task.id, reflection.summary, ['reflection', this.id]);
    this.update(task, '尚书省', `尚书省领旨：${output.content}`, '太子');
  }
}

export class LiubuExecutor extends CourtAgent {
  protected async process(task: CourtTask, context: AgentProcessContext) {
    // 六部执行器按各自 profile.department 工作，支持户礼兵刑工吏动态参战。
    let codeRuntimeState: Record<string, unknown> = {};
    const toolState = await this.runAutonomousTools(task);
    if (this.id === 'bingbu') {
      // 兵部进入 Agent Loop：生成代码、构建、自检、自动修复，循环到成功或达到上限。
      const codeResult = await this.services.codeLoop.run(
        task,
        this.profile,
      );
      codeRuntimeState = {
        loopSuccess: codeResult.success,
        loopAttempts: codeResult.attempts,
        artifactCount: codeResult.artifacts.length,
      };
      this.emit('太子', 'agent.message', `兵部 Agent Loop：${codeResult.summary}`, task, {
        artifacts: codeResult.artifacts.map((artifact) => ({
          id: artifact.id,
          type: artifact.type,
          title: artifact.title,
        })),
      });
    }
    if (this.id === 'gongbu' && /浏览器|playwright|截图|页面/i.test(task.content)) {
      // BrowserRuntime 预留 Playwright 执行动作，当前只记录计划。
      this.services.browserRuntime.recordPlannedAction(task, {
        type: 'screenshot',
        target: window.location.href,
        note: '工部预留 Playwright 截图验证动作',
      });
    }
    const output = await this.generateMockOutput(task, `${this.department}${roleLabel(this.profile.role)}`, {
      ...context,
      retrievalCount: toolState.retrievals.length,
      toolOutputs: toolState.outputs,
      codeRuntimeState,
      modelSelection: context.modelSelection,
    });
    this.memory.rememberTask(task.id, output.content, ['executor', this.id]);
    const reflection = this.services.reflection.reflectAgent(task, this.profile, output.content);
    this.memory.rememberTask(task.id, reflection.summary, ['reflection', this.id]);
    this.update(task, this.department, `${this.department}执行：${output.content}`, '太子');
    if (this.id === 'bingbu') {
      this.memory.rememberAgent(this.id, `Code Runtime 状态：${JSON.stringify(codeRuntimeState)}`, ['code-runtime']);
    }
  }
}

function createAdapters(): Record<ModelProvider, ModelAdapter> {
  // Adapter 注册表保留真实供应商边界，但所有实现当前都只返回 mock 输出。
  const openai = new OpenAIAdapter();
  const claude = new ClaudeAdapter();
  const gemini = new GeminiAdapter();
  const codex = new CodexAdapter();
  return {
    openai,
    claude,
    gemini,
    codex,
    local: codex,
  };
}

function createAgentInstance(
  bus: TaskBus,
  registry: AgentRegistry,
  memory: MemoryEngine,
  promptRuntime: PromptRuntime,
  adapters: Record<ModelProvider, ModelAdapter>,
  services: RuntimeServices,
  agent: RegisteredAgent,
) {
  // 根据 Registry 中的角色选择对应 Agent 类，未识别执行类默认走六部 executor。
  if (agent.id === 'zhongshu') {
    return new ZhongshuPlanner(bus, registry, memory, promptRuntime, adapters, services, agent);
  }
  if (agent.id === 'menxia') {
    return new MenxiaReviewer(bus, registry, memory, promptRuntime, adapters, services, agent);
  }
  if (agent.id === 'shangshu') {
    return new ShangshuDispatcher(bus, registry, memory, promptRuntime, adapters, services, agent);
  }
  return new LiubuExecutor(bus, registry, memory, promptRuntime, adapters, services, agent);
}

export function createMockCourtRuntime() {
  // 组装动态朝廷 Runtime，UI 仍只需要拿到 bus 和入口 orchestrator。
  const bus = new TaskBus();
  const registry = createDefaultAgentRegistry();
  const memory = new MemoryEngine();
  const promptRuntime = new PromptRuntime();
  const adapters = createAdapters();
  const workflow = loadDefaultWorkflow();
  const sandbox = createDefaultSandboxPolicy();
  const workspace = new WorkspaceRuntime(sandbox);
  const artifacts = new ArtifactStore();
  const tools = createDefaultToolRegistry();
  const codeRuntime = new CodeRuntime({ workspace, artifacts, sandbox, tools, memory });
  const planner = new LLMPlanner(registry);
  const toolPlanner = new ToolPlanner();
  const retrieval = new RetrievalEngine(memory, artifacts, () => bus.getTasks());
  const reflection = new ReflectionEngine();
  const taskGraph = new TaskGraph();
  const browserRuntime = new BrowserRuntime();
  const codeLoop = new BingbuCodeLoop({ codeRuntime, tools, workspace, memory, artifacts, sandbox, reflection });
  const services = {
    workspace,
    artifacts,
    sandbox,
    tools,
    codeRuntime,
    codeLoop,
    planner,
    toolPlanner,
    retrieval,
    reflection,
    taskGraph,
    browserRuntime,
  };
  const agents = new Map<string, CourtAgent>();

  registry.getEnabledAgents()
    .filter((agent) => agent.id !== workflow.entryAgentId && agent.role !== 'emperor')
    .forEach((agent) => {
      agents.set(agent.id, createAgentInstance(bus, registry, memory, promptRuntime, adapters, services, agent));
    });

  const taiziProfile = registry.getAgent(workflow.entryAgentId);
  if (!taiziProfile) {
    throw new Error('缺少太子 orchestrator，无法启动朝堂 Runtime');
  }
  const orchestrator = new TaiziOrchestrator(
    bus,
    registry,
    memory,
    promptRuntime,
    adapters,
    services,
    taiziProfile,
    workflow,
    agents,
  );

  return {
    bus,
    orchestrator,
    registry,
    memory,
    workflow,
    workspace,
    artifacts,
    sandbox,
    tools,
    codeRuntime,
    codeLoop,
    planner,
    retrieval,
    reflection,
    taskGraph,
    browserRuntime,
  };
}

export function createCourtTask(id: string, title: string, content: string): CourtTask {
  // UI 创建任务结构时使用统一工厂，保证字段完整。
  const createdAt = nowText();
  return {
    id,
    title,
    content,
    status: 'created',
    currentDepartment: '皇上',
    logs: [{ at: createdAt, from: '皇上', to: '太子', type: 'task.created', content: `皇上下旨：${title}` }],
    createdAt,
    updatedAt: createdAt,
  };
}
