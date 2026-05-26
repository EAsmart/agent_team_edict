import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { type AgentInfo, type OfficialInfo, type Task } from '../api';
import { DEPTS, isArchived, isEdict, useStore } from '../store';
import { createCourtTask, createMockCourtRuntime, type AgentMessage, type CourtTask } from '../taskBus';

// 本地模型配置只保存在浏览器 localStorage，不写入后端调度配置。
type LocalModelConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  systemPrompt: string;
  enabled: boolean;
};

// 控制台官职卡片需要合并运行时配置、官员统计和本地模型配置。
type CourtAgent = {
  id: string;
  label: string;
  role: string;
  emoji: string;
  duty: string;
  model: string;
  status: string;
  statusTone: 'ok' | 'warn' | 'danger' | 'idle';
  enabled: boolean;
  recentTask: string;
  recentTaskId?: string;
  localConfig: LocalModelConfig;
  official?: OfficialInfo;
};

type TimelineStatus = 'pending' | 'active' | 'done';

type SimulatedTimelineStep = {
  name: string;
  status: TimelineStatus;
  startedAt?: string;
  finishedAt?: string;
  log: string;
  detail: string;
};

type SimulatedDecreeTask = {
  id: string;
  title: string;
  createdAt: string;
  status: '流转中' | '已完成';
  currentStep: string;
  steps: SimulatedTimelineStep[];
  logs: { at: string; step: string; text: string }[];
};

type RuntimeEventLog = {
  at: string;
  from: string;
  to: string;
  type: string;
  content: string;
};

const LOCAL_CONFIG_KEY = 'edict.localModelConfigs.v1';

const EMPTY_CONFIG: LocalModelConfig = {
  provider: '',
  baseUrl: '',
  apiKey: '',
  modelName: '',
  systemPrompt: '',
  enabled: true,
};

// 第一阶段保留原有皇上、太子、三省、六部体系，只补充用于 UI 展示的职责文案。
const DUTY_MAP: Record<string, string> = {
  emperor: '圣旨输入、裁决朝堂方向、发起任务预演',
  taizi: '阅旨分拣、巡检任务、汇总各部回奏',
  zhongshu: '接旨拟旨、拆解方案、形成执行章程',
  menxia: '封驳审议、风险把关、质量复核',
  shangshu: '领旨派发、协调六部、收束执行结果',
  hubu: '数据、预算、成本、资源核算',
  libu: '文档、规范、报告、对外表述',
  bingbu: '工程实现、代码执行、技术攻坚',
  xingbu: '安全、合规、审计、红线检查',
  gongbu: '基础设施、部署、运行环境',
  libu_hr: '人事、培训、Agent 能力管理',
};

const FLOW_STEPS = [
  '皇上下旨',
  '太子阅旨',
  '中书省拟旨',
  '门下省封驳',
  '尚书省领旨',
  '六部执行',
  '太子汇总',
];

const FLOW_DEPARTMENT_MAP: Record<string, string> = {
  皇上: '皇上下旨',
  太子: '太子阅旨',
  中书省: '中书省拟旨',
  门下省: '门下省封驳',
  尚书省: '尚书省领旨',
  六部: '六部执行',
  // 第四阶段动态编排会派发到具体六部，旧时间线统一归入六部执行阶段。
  户部: '六部执行',
  礼部: '六部执行',
  兵部: '六部执行',
  刑部: '六部执行',
  工部: '六部执行',
  吏部: '六部执行',
};

const STEP_DETAILS: Record<string, string> = {
  皇上下旨: '皇上录入圣旨，形成本地模拟任务卡，并等待太子阅旨。',
  太子阅旨: '太子阅读圣旨，确认任务可进入三省流转。',
  中书省拟旨: '中书省拟定执行方案，拆解任务目标与交付边界。',
  门下省封驳: '门下省进行封驳审议，检查方案风险与质量。',
  尚书省领旨: '尚书省领旨后准备派发六部，并协调执行节奏。',
  六部执行: '六部按职责并行执行，记录本地模拟进展日志。',
  太子汇总: '太子汇总各部回奏，形成最终流转结果。',
};

function readLocalConfigs(): Record<string, LocalModelConfig> {
  // 本地配置读取失败时回退为空对象，避免影响 Dashboard 正常展示。
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalConfigs(configs: Record<string, LocalModelConfig>) {
  // 本地配置保存为浏览器级配置，第一阶段不提交到后端。
  localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(configs));
}

function latestTaskForAgent(agentId: string, tasks: Task[]) {
  // 最近任务按官职参与关系粗略匹配，仅用于首页概览展示。
  const keywordMap: Record<string, string[]> = {
    emperor: ['皇上'],
    taizi: ['太子'],
    zhongshu: ['中书省', '中书'],
    menxia: ['门下省', '门下'],
    shangshu: ['尚书省', '尚书'],
    hubu: ['户部'],
    libu: ['礼部'],
    bingbu: ['兵部'],
    xingbu: ['刑部'],
    gongbu: ['工部'],
    libu_hr: ['吏部'],
  };
  const keys = keywordMap[agentId] || [];
  return tasks.find((task) => {
    const text = `${task.org || ''} ${task.now || ''} ${(task.flow_log || []).map((f) => `${f.from} ${f.to} ${f.remark}`).join(' ')}`;
    return keys.some((key) => text.includes(key));
  });
}

function statusTone(status?: string): CourtAgent['statusTone'] {
  // 心跳状态映射为控制台色彩语义。
  if (status === 'active') return 'ok';
  if (status === 'warn') return 'warn';
  if (status === 'stalled') return 'danger';
  if (status === 'running') return 'ok';
  if (status === 'offline' || status === 'unconfigured') return 'danger';
  return 'idle';
}

function maskKey(key: string) {
  // API Key 在卡片和详情摘要中脱敏展示。
  if (!key) return '未填写';
  if (key.length <= 8) return '已填写';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function makeLocalTaskId() {
  // 本地模拟任务 ID 使用时间戳和随机后缀，避免与真实后端任务冲突。
  const stamp = new Date()
    .toISOString()
    .split('-').join('')
    .split(':').join('')
    .split('T').join('')
    .split('Z').join('')
    .split('.').join('')
    .slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `JJC-LOCAL-${stamp}-${suffix}`;
}

function mapRuntimeTaskToView(task: CourtTask): SimulatedDecreeTask {
  // 将 TaskBus 的 CourtTask 快照映射成当前时间线 UI 使用的结构。
  const currentStep = task.status === 'completed'
    ? '太子汇总'
    : FLOW_DEPARTMENT_MAP[task.currentDepartment] || '皇上下旨';
  const activeIndex = Math.max(FLOW_STEPS.indexOf(currentStep), 0);
  const steps = FLOW_STEPS.map((name, index) => {
    const relatedLog = task.logs.find((log) => log.content.includes(name) || log.from === name.replace(/(阅旨|拟旨|封驳|领旨|执行|汇总|下旨)/g, ''));
    let status: TimelineStatus = 'pending';
    if (task.status === 'completed' || index < activeIndex) status = 'done';
    else if (index === activeIndex) status = 'active';
    return {
      name,
      status,
      startedAt: relatedLog?.at || (index <= activeIndex ? task.updatedAt : undefined),
      finishedAt: status === 'done' ? task.updatedAt : undefined,
      log: status === 'pending' ? '等待执行' : status === 'active' ? `${name}正在执行` : `${name}已完成`,
      detail: STEP_DETAILS[name] || '等待朝堂流转。',
    };
  });

  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    status: task.status === 'completed' ? '已完成' : '流转中',
    currentStep: task.status === 'completed' ? '太子汇总完成' : currentStep,
    steps,
    logs: task.logs.map((log) => ({
      at: log.at,
      step: log.from,
      text: log.content,
    })),
  };
}

function messageToRuntimeLog(message: AgentMessage): RuntimeEventLog {
  // 将 AgentMessage 规范化为 UI 日志行，保留 from/to/type/content/timestamp。
  return {
    at: message.timestamp,
    from: message.from,
    to: message.to,
    type: message.type,
    content: message.content,
  };
}

export default function CourtControlConsole() {
  const liveStatus = useStore((s) => s.liveStatus);
  const agentConfig = useStore((s) => s.agentConfig);
  const officialsData = useStore((s) => s.officialsData);
  const loadAgentConfig = useStore((s) => s.loadAgentConfig);
  const loadOfficials = useStore((s) => s.loadOfficials);
  const setModalTaskId = useStore((s) => s.setModalTaskId);
  const toast = useStore((s) => s.toast);

  const [decreeText, setDecreeText] = useState('');
  const [flowText, setFlowText] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('taizi');
  const [localConfigs, setLocalConfigs] = useState<Record<string, LocalModelConfig>>({});
  const [simulatedTasks, setSimulatedTasks] = useState<SimulatedDecreeTask[]>([]);
  const [activeSimTaskId, setActiveSimTaskId] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const runtimeRef = useRef(createMockCourtRuntime());
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeEventLog[]>([]);

  useEffect(() => {
    loadAgentConfig();
    loadOfficials();
    setLocalConfigs(readLocalConfigs());
  }, [loadAgentConfig, loadOfficials]);

  useEffect(() => {
    // 订阅 TaskBus 全量事件，将 Agent 通信、任务更新和状态广播实时映射到 UI。
    const unsubscribe = runtimeRef.current.bus.subscribe('*', ({ message, task }) => {
      setRuntimeLogs((prev) => [messageToRuntimeLog(message), ...prev].slice(0, 80));
      if (task) {
        const viewTask = mapRuntimeTaskToView(task);
        setSimulatedTasks((prev) => {
          const exists = prev.some((item) => item.id === task.id);
          if (exists) return prev.map((item) => (item.id === task.id ? viewTask : item));
          return [viewTask, ...prev];
        });
        setActiveSimTaskId((current) => current || task.id);
      }
    });
    return unsubscribe;
  }, []);

  const tasks = liveStatus?.tasks || [];
  const activeEdicts = tasks.filter((t) => isEdict(t) && !isArchived(t));
  const runningTasks = activeEdicts.filter((t) => !['Done', 'Cancelled', 'Blocked'].includes(t.state));
  const logLines = tasks
    .flatMap((task) => (task.flow_log || []).map((log) => ({ ...log, taskId: task.id })))
    .slice(-12)
    .reverse();

  const agents = useMemo<CourtAgent[]>(() => {
    // 官职列表以现有 agent 配置为主，缺失时用静态三省六部定义兜底。
    const configured = agentConfig?.agents || [];
    const configMap = new Map(configured.map((ag) => [ag.id, ag]));
    const officialMap = new Map((officialsData?.officials || []).map((o) => [o.id, o]));
    const baseAgents: AgentInfo[] = [
      {
        id: 'emperor',
        label: '皇上',
        role: '皇上',
        emoji: '👑',
        model: '本地圣旨输入',
        skills: [],
      },
      ...DEPTS.map((dept) => {
        const configuredAgent = configMap.get(dept.id);
        return {
          id: dept.id,
          label: configuredAgent?.label || dept.label,
          role: configuredAgent?.role || dept.role,
          emoji: configuredAgent?.emoji || dept.emoji,
          model: configuredAgent?.model || '未同步',
          skills: configuredAgent?.skills || [],
        };
      }),
    ];

    return baseAgents.map((agent) => {
      const official = officialMap.get(agent.id);
      const localConfig = localConfigs[agent.id] || {
        ...EMPTY_CONFIG,
        modelName: agent.model,
      };
      const recent = latestTaskForAgent(agent.id, activeEdicts);
      const heartbeat = official?.heartbeat;
      return {
        id: agent.id,
        label: agent.label,
        role: agent.role,
        emoji: agent.emoji || '🏛️',
        duty: DUTY_MAP[agent.id] || '朝廷协同与任务执行',
        model: localConfig.modelName || agent.model,
        status: heartbeat?.label || (localConfig.enabled ? '待命' : '未启用'),
        statusTone: localConfig.enabled ? statusTone(heartbeat?.status) : 'danger',
        enabled: localConfig.enabled,
        recentTask: recent ? recent.title : '暂无最近任务',
        recentTaskId: recent?.id,
        localConfig,
        official,
      };
    });
  }, [activeEdicts, agentConfig?.agents, localConfigs, officialsData?.officials]);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0];
  const threeDepartments = agents.filter((agent) => ['zhongshu', 'menxia', 'shangshu'].includes(agent.id));
  const sixDepartments = agents.filter((agent) => ['hubu', 'libu', 'bingbu', 'xingbu', 'gongbu', 'libu_hr'].includes(agent.id));
  const taizi = agents.find((agent) => agent.id === 'taizi');

  const updateSelectedConfig = (field: keyof LocalModelConfig, value: string | boolean) => {
    // 表单变更立即进入 React 状态，点击保存后落到 localStorage。
    if (!selectedAgent) return;
    setLocalConfigs((prev) => ({
      ...prev,
      [selectedAgent.id]: {
        ...(prev[selectedAgent.id] || selectedAgent.localConfig || EMPTY_CONFIG),
        [field]: value,
      },
    }));
  };

  const handleSaveConfig = () => {
    // 第一阶段只保存本地配置，不调用 set-model 或任何调度 API。
    saveLocalConfigs(localConfigs);
    toast('本地模型配置已保存', 'ok');
  };

  const handleGenerateFlow = () => {
    // 输入圣旨后创建 CourtTask，并交给 mock Agent Runtime 推进。
    const summary = decreeText.trim();
    if (!summary) {
      toast('请先输入圣旨内容', 'err');
      return;
    }
    const task = createCourtTask(makeLocalTaskId(), summary.slice(0, 80), summary);
    setFlowText(`任务ID：${task.id}\n创建时间：${task.createdAt}\n需求：${summary}\n${FLOW_STEPS.map((step, index) => `${index + 1}. ${step}`).join('\n')}`);
    setDecreeText('');
    runtimeRef.current.bus.createTask(task);
    runtimeRef.current.orchestrator.receiveTask(task);
    toast(`${task.id} 已进入 TaskBus，Agent Runtime 开始流转`, 'ok');
  };

  const toggleStep = (taskId: string, stepName: string) => {
    // 每一步支持展开详情，展开状态只保存在当前页面。
    const key = `${taskId}:${stepName}`;
    setExpandedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeSimTask = simulatedTasks.find((task) => task.id === activeSimTaskId) || simulatedTasks[0];

  return (
    <section className="court-console">
      <div className="console-hero">
        <div>
          <div className="console-eyebrow">AI 朝廷控制中心 · Phase 1</div>
          <h1>未来朝堂总控台</h1>
          <p>保留皇上、太子、三省与六部体系，仅增强 Dashboard 视觉、本地配置和执行流程预演。</p>
        </div>
        <div className="console-status-grid">
          <div className="console-stat">
            <span>当前朝堂</span>
            <strong>{runningTasks.length > 0 ? '正在议政' : '候旨待命'}</strong>
          </div>
          <div className="console-stat">
            <span>官职 Agent</span>
            <strong>{agents.length}</strong>
          </div>
          <div className="console-stat">
            <span>运行端口</span>
            <strong>{window.location.port || '7891'}</strong>
          </div>
          <div className="console-stat">
            <span>当前任务</span>
            <strong>{tasks.length}</strong>
          </div>
        </div>
      </div>

      <div className="console-grid">
        <div className="console-card decree-card">
          <div className="console-card-head">
            <span>👑 皇上圣旨输入区</span>
            <small>本地预演</small>
          </div>
          <textarea
            value={decreeText}
            onChange={(e) => setDecreeText(e.target.value)}
            placeholder="在此输入圣旨需求，例如：让三省六部规划一个新产品发布方案。"
          />
          <button className="console-primary" onClick={handleGenerateFlow}>下旨并模拟流转</button>
        </div>

        <div className="console-card prince-card">
          <div className="console-card-head">
            <span>🤴 太子任务总览区</span>
            <small>{taizi?.status || '待命'}</small>
          </div>
          <div className="prince-metrics">
            <div><b>{activeEdicts.length}</b><span>活跃旨意</span></div>
            <div><b>{runningTasks.length}</b><span>流转中</span></div>
            <div><b>{taizi?.model || '未同步'}</b><span>当前模型</span></div>
          </div>
          <p>{taizi?.recentTask || '暂无最近任务'}</p>
        </div>

        <div className="console-card departments-card">
          <div className="console-card-head">
            <span>🏛️ 三省状态区</span>
            <small>拟旨 · 封驳 · 派发</small>
          </div>
          <div className="mini-agent-row">
            {threeDepartments.map((agent) => (
              <button key={agent.id} className={`mini-agent ${agent.statusTone}`} onClick={() => setSelectedAgentId(agent.id)}>
                <span>{agent.emoji}</span>
                <b>{agent.label}</b>
                <small>{agent.status}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="console-card departments-card">
          <div className="console-card-head">
            <span>⚙️ 六部执行状态区</span>
            <small>并行执行</small>
          </div>
          <div className="mini-agent-row six">
            {sixDepartments.map((agent) => (
              <button key={agent.id} className={`mini-agent ${agent.statusTone}`} onClick={() => setSelectedAgentId(agent.id)}>
                <span>{agent.emoji}</span>
                <b>{agent.label}</b>
                <small>{agent.enabled ? agent.status : '未启用'}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeSimTask && (
        <div className="console-card simulated-flow-card">
          <div className="console-card-head">
            <span>📜 朝堂流转时间线</span>
            <small>{activeSimTask.id} · {activeSimTask.status}</small>
          </div>
          <div className="sim-task-summary">
            <div><b>任务ID</b><span>{activeSimTask.id}</span></div>
            <div><b>创建时间</b><span>{activeSimTask.createdAt}</span></div>
            <div><b>当前步骤</b><span>{activeSimTask.currentStep}</span></div>
            <div><b>圣旨</b><span>{activeSimTask.title}</span></div>
          </div>
          <div className="timeline-rail">
            {activeSimTask.steps.map((step, index) => {
              const expanded = !!expandedSteps[`${activeSimTask.id}:${step.name}`];
              return (
                <button
                  className={`timeline-step ${step.status} ${expanded ? 'expanded' : ''}`}
                  key={step.name}
                  onClick={() => toggleStep(activeSimTask.id, step.name)}
                >
                  <span className="timeline-index">{index + 1}</span>
                  <b>{step.name}</b>
                  <small>{step.log}</small>
                  <em>{step.startedAt || '待执行'}</em>
                  {expanded && (
                    <p>
                      {step.detail}
                      <br />
                      执行时间：{step.startedAt || '尚未开始'}
                      {step.finishedAt ? ` → ${step.finishedAt}` : ''}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {flowText && <pre className="sim-flow-text">{flowText}</pre>}
        </div>
      )}

      {simulatedTasks.length > 0 && (
        <div className="console-card local-task-card">
          <div className="console-card-head">
            <span>📌 本地圣旨任务卡</span>
            <small>{simulatedTasks.length} 道本地圣旨</small>
          </div>
          <div className="local-task-list">
            {simulatedTasks.map((task) => (
              <button
                key={task.id}
                className={`local-task-item ${task.id === activeSimTask?.id ? 'selected' : ''}`}
                onClick={() => setActiveSimTaskId(task.id)}
              >
                <span>{task.id}</span>
                <b>{task.title}</b>
                <small>{task.createdAt} · {task.status} · {task.currentStep}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="agent-console-layout">
        <div className="agent-card-grid">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`agent-control-card ${selectedAgent?.id === agent.id ? 'selected' : ''} ${agent.statusTone}`}
              onClick={() => setSelectedAgentId(agent.id)}
            >
              <div className="agent-card-top">
                <span className="agent-avatar">{agent.emoji}</span>
                <span className={`agent-status ${agent.statusTone}`}>{agent.enabled ? agent.status : '未启用'}</span>
              </div>
              <strong>{agent.label}</strong>
              <small>{agent.role}</small>
              <div className="agent-card-line">模型：{agent.model}</div>
              <div className="agent-card-line">职责：{agent.duty}</div>
              <div className="agent-card-line">启用：{agent.enabled ? '是' : '否'}</div>
              <div className="agent-card-task">最近任务：{agent.recentTask}</div>
            </button>
          ))}
        </div>

        {selectedAgent && (
          <aside className="agent-detail-panel">
            <div className="console-card-head">
              <span>{selectedAgent.emoji} {selectedAgent.label}详情</span>
              <small>{selectedAgent.id}</small>
            </div>
            <div className="detail-lines">
              <p><b>当前状态</b><span>{selectedAgent.enabled ? selectedAgent.status : '未启用'}</span></p>
              <p><b>当前模型</b><span>{selectedAgent.model}</span></p>
              <p><b>当前职责</b><span>{selectedAgent.duty}</span></p>
              <p><b>最近任务</b><span>{selectedAgent.recentTask}</span></p>
              <p><b>API Key</b><span>{maskKey(selectedAgent.localConfig.apiKey)}</span></p>
            </div>
            {selectedAgent.recentTaskId && (
              <button className="console-ghost" onClick={() => setModalTaskId(selectedAgent.recentTaskId!)}>
                打开最近任务
              </button>
            )}

            <div className="local-config-form">
              <div className="sec-title">本地模型配置</div>
              <label>
                <span>是否启用</span>
                <input
                  type="checkbox"
                  checked={selectedAgent.localConfig.enabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSelectedConfig('enabled', e.target.checked)}
                />
              </label>
              <label>
                <span>模型供应商</span>
                <input value={selectedAgent.localConfig.provider} onChange={(e) => updateSelectedConfig('provider', e.target.value)} placeholder="OpenAI / Anthropic / Local" />
              </label>
              <label>
                <span>Base URL</span>
                <input value={selectedAgent.localConfig.baseUrl} onChange={(e) => updateSelectedConfig('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" />
              </label>
              <label>
                <span>API Key</span>
                <input type="password" value={selectedAgent.localConfig.apiKey} onChange={(e) => updateSelectedConfig('apiKey', e.target.value)} placeholder="仅保存到本机浏览器" />
              </label>
              <label>
                <span>模型名称</span>
                <input value={selectedAgent.localConfig.modelName} onChange={(e) => updateSelectedConfig('modelName', e.target.value)} placeholder="gpt-4o / claude-sonnet / local-model" />
              </label>
              <label>
                <span>System Prompt</span>
                <textarea value={selectedAgent.localConfig.systemPrompt} onChange={(e) => updateSelectedConfig('systemPrompt', e.target.value)} placeholder="填写该官职的本地系统提示词" />
              </label>
              <button className="console-primary" onClick={handleSaveConfig}>保存本地配置</button>
            </div>
          </aside>
        )}
      </div>

      <div className="console-card log-card">
        <div className="console-card-head">
          <span>🧾 执行日志输出区</span>
          <small>{runtimeLogs.length + logLines.length} 条最近流转</small>
        </div>
        <div className="console-log">
          {runtimeLogs.map((line, index) => (
            <div className="log-line local" key={`${line.at}-${line.type}-${index}`}>
              <code>{line.at.substring(11, 19) || '--:--:--'}</code>
              <span>{line.type}</span>
              <b>{line.from} → {line.to}</b>
              <em>{line.content}</em>
            </div>
          ))}
          {runtimeLogs.length === 0 && logLines.length === 0 ? (
            <div className="log-empty">暂无流转日志，等待圣旨或后台同步。</div>
          ) : (
            logLines.map((line, index) => (
              <div className="log-line" key={`${line.taskId}-${line.at}-${index}`}>
                <code>{(line.at || '').substring(11, 19) || '--:--:--'}</code>
                <span>{line.taskId}</span>
                <b>{line.from} → {line.to}</b>
                <em>{line.remark}</em>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
