import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api, type RuntimeModelConfig, type RuntimeModelProfile } from '../api';

const FALLBACK_MODELS = [
  { id: 'anthropic/claude-sonnet-4-6', l: 'Claude Sonnet 4.6', p: 'Anthropic' },
  { id: 'anthropic/claude-opus-4-5', l: 'Claude Opus 4.5', p: 'Anthropic' },
  { id: 'anthropic/claude-haiku-3-5', l: 'Claude Haiku 3.5', p: 'Anthropic' },
  { id: 'openai/gpt-4o', l: 'GPT-4o', p: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', l: 'GPT-4o Mini', p: 'OpenAI' },
  { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro', p: 'Google' },
  { id: 'copilot/claude-sonnet-4', l: 'Claude Sonnet 4', p: 'Copilot' },
  { id: 'copilot/claude-opus-4.5', l: 'Claude Opus 4.5', p: 'Copilot' },
  { id: 'copilot/gpt-4o', l: 'GPT-4o', p: 'Copilot' },
  { id: 'copilot/gemini-2.5-pro', l: 'Gemini 2.5 Pro', p: 'Copilot' },
];

const CHANNELS = [
  { id: 'feishu', label: '飞书 Feishu' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'wecom', label: '企业微信 WeCom' },
  { id: 'discord', label: 'Discord' },
  { id: 'slack', label: 'Slack' },
  { id: 'signal', label: 'Signal' },
  { id: 'tui', label: 'TUI (终端)' },
];

const ROUTABLE_AGENT_IDS = ['taizi', 'zhongshu', 'menxia', 'shangshu', 'libu', 'hubu', 'bingbu', 'xingbu', 'gongbu', 'libu_hr'];
const ROUTABLE_AGENT_LABELS: Record<string, string> = {
  taizi: '太子',
  zhongshu: '中书省',
  menxia: '门下省',
  shangshu: '尚书省',
  libu: '礼部',
  hubu: '户部',
  bingbu: '兵部',
  xingbu: '刑部',
  gongbu: '工部',
  libu_hr: '吏部',
};

const DEFAULT_RUNTIME_CONFIG: RuntimeModelConfig = {
  provider: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  model: '',
  mode: 'mock',
  agentModels: {},
  models: [],
};

function newRuntimeModel(): RuntimeModelProfile {
  const stamp = Date.now().toString(36);
  return {
    id: `model-${stamp}`,
    name: `模型 ${stamp.slice(-4).toUpperCase()}`,
    provider: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    enabled: true,
  };
}

export default function ModelConfig() {
  const agentConfig = useStore((s) => s.agentConfig);
  const changeLog = useStore((s) => s.changeLog);
  const loadAgentConfig = useStore((s) => s.loadAgentConfig);
  const toast = useStore((s) => s.toast);

  const [selMap, setSelMap] = useState<Record<string, string>>({});
  const [statusMap, setStatusMap] = useState<Record<string, { cls: string; text: string }>>({});
  const [channelSel, setChannelSel] = useState('feishu');
  const [channelStatus, setChannelStatus] = useState('');
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeModelConfig>(DEFAULT_RUNTIME_CONFIG);
  const [runtimeStatus, setRuntimeStatus] = useState('');

  useEffect(() => {
    loadAgentConfig();
    api.runtimeConfig().then((result) => {
      if (result.ok && result.config) {
        setRuntimeConfig({
          ...DEFAULT_RUNTIME_CONFIG,
          ...result.config,
          apiKey: '',
          agentModels: result.config.agentModels || {},
          models: (result.config.models || []).map((model) => ({ ...model, apiKey: '' })),
        });
      }
    }).catch(() => setRuntimeStatus('Runtime 配置读取失败'));
  }, [loadAgentConfig]);

  useEffect(() => {
    if (agentConfig?.agents) {
      const m: Record<string, string> = {};
      agentConfig.agents.forEach((ag) => {
        m[ag.id] = ag.model;
      });
      setSelMap(m);
    }
    if (agentConfig?.dispatchChannel) {
      setChannelSel(agentConfig.dispatchChannel);
    }
  }, [agentConfig]);

  if (!agentConfig?.agents) {
    return <div className="empty" style={{ gridColumn: '1/-1' }}>⚠️ 请先启动本地服务器</div>;
  }

  const models = agentConfig.knownModels?.length
    ? agentConfig.knownModels.map((m) => ({ id: m.id, l: m.label, p: m.provider }))
    : FALLBACK_MODELS;

  const handleSelect = (agentId: string, val: string) => {
    setSelMap((p) => ({ ...p, [agentId]: val }));
  };

  const resetMC = (agentId: string) => {
    const ag = agentConfig.agents.find((a) => a.id === agentId);
    if (ag) setSelMap((p) => ({ ...p, [agentId]: ag.model }));
  };

  const applyModel = async (agentId: string) => {
    const model = selMap[agentId];
    if (!model) return;
    setStatusMap((p) => ({ ...p, [agentId]: { cls: 'pending', text: '⟳ 提交中…' } }));
    try {
      const r = await api.setModel(agentId, model);
      if (r.ok) {
        setStatusMap((p) => ({ ...p, [agentId]: { cls: 'ok', text: '✅ 已提交，Gateway 重启中（约5秒）' } }));
        toast(agentId + ' 模型已更改', 'ok');
        setTimeout(() => loadAgentConfig(), 5500);
      } else {
        setStatusMap((p) => ({ ...p, [agentId]: { cls: 'err', text: '❌ ' + (r.error || '错误') } }));
      }
    } catch {
      setStatusMap((p) => ({ ...p, [agentId]: { cls: 'err', text: '❌ 无法连接服务器' } }));
    }
  };

  const updateRuntimeModel = (modelId: string, field: keyof RuntimeModelProfile, value: string | boolean) => {
    setRuntimeConfig((prev) => ({
      ...prev,
      models: (prev.models || []).map((model) => model.id === modelId ? { ...model, [field]: value } : model),
    }));
  };

  const saveRuntime = async () => {
    const result = await api.saveRuntimeConfig(runtimeConfig);
    if (result.ok) {
      setRuntimeConfig({
        ...DEFAULT_RUNTIME_CONFIG,
        ...result.config,
        apiKey: '',
        agentModels: result.config.agentModels || {},
        models: (result.config.models || []).map((model) => ({ ...model, apiKey: '' })),
      });
      setRuntimeStatus('Runtime 模型配置已保存');
      toast('Runtime 模型配置已保存', 'ok');
    } else {
      setRuntimeStatus(result.error || 'Runtime 模型配置保存失败');
    }
  };

  return (
    <div>
      <div className="model-grid">
        {agentConfig.agents.map((ag) => {
          const sel = selMap[ag.id] || ag.model;
          const changed = sel !== ag.model;
          const st = statusMap[ag.id];
          return (
            <div className="mc-card" key={ag.id}>
              <div className="mc-top">
                <span className="mc-emoji">{ag.emoji || '🏛️'}</span>
                <div>
                  <div className="mc-name">
                    {ag.label}{' '}
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ag.id}</span>
                  </div>
                  <div className="mc-role">{ag.role}</div>
                </div>
              </div>
              <div className="mc-cur">
                当前: <b>{ag.model}</b>
              </div>
              <select className="msel" value={sel} onChange={(e) => handleSelect(ag.id, e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.l} ({m.p})
                  </option>
                ))}
              </select>
              <div className="mc-btns">
                <button className="btn btn-p" disabled={!changed} onClick={() => applyModel(ag.id)}>
                  应用
                </button>
                <button className="btn btn-g" onClick={() => resetMC(ag.id)}>
                  重置
                </button>
              </div>
              {st && <div className={`mc-st ${st.cls}`}>{st.text}</div>}
            </div>
          );
        })}
      </div>

      {/* Dispatch Channel 配置 */}
      <div className="console-card runtime-model-card" style={{ marginTop: 18 }}>
        <div className="console-card-head">
          <span>Runtime 独立模型绑定</span>
          <small>{runtimeConfig.mode === 'real' ? '真实模型模式' : 'Mock 模式'}</small>
        </div>
        <div className="local-config-form runtime-config-form">
          <label>
            <span>运行模式</span>
            <select value={runtimeConfig.mode} onChange={(e) => setRuntimeConfig((prev) => ({ ...prev, mode: e.target.value as RuntimeModelConfig['mode'] }))}>
              <option value="mock">Mock 模式</option>
              <option value="real">真实模型模式</option>
            </select>
          </label>
          <div className="runtime-config-actions">
            <button className="btn btn-p" onClick={() => setRuntimeConfig((prev) => ({ ...prev, models: [...(prev.models || []), newRuntimeModel()] }))}>新增模型</button>
            <button className="btn btn-g" onClick={() => void saveRuntime()}>保存 Runtime 配置</button>
            {runtimeStatus && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{runtimeStatus}</span>}
          </div>
        </div>
        <div className="runtime-model-list">
          {(runtimeConfig.models || []).map((model) => (
            <div className="runtime-model-item" key={model.id}>
              <input value={model.name} onChange={(e) => updateRuntimeModel(model.id, 'name', e.target.value)} placeholder="名称" />
              <input value={model.baseUrl} onChange={(e) => updateRuntimeModel(model.id, 'baseUrl', e.target.value)} placeholder="Base URL" />
              <input type="password" value={model.apiKey || ''} onChange={(e) => updateRuntimeModel(model.id, 'apiKey', e.target.value)} placeholder={model.apiKeyMasked || (model.hasApiKey ? 'API Key 已保存' : 'API Key')} />
              <input value={model.model} onChange={(e) => updateRuntimeModel(model.id, 'model', e.target.value)} placeholder="模型 ID" />
              <label className="runtime-model-enabled">
                <input type="checkbox" checked={model.enabled !== false} onChange={(e) => updateRuntimeModel(model.id, 'enabled', e.target.checked)} />
                启用
              </label>
              <button className="btn btn-g" onClick={() => setRuntimeConfig((prev) => ({
                ...prev,
                models: (prev.models || []).filter((item) => item.id !== model.id),
                agentModels: Object.fromEntries(Object.entries(prev.agentModels || {}).map(([agentId, bound]) => [agentId, bound === model.id ? '' : bound])),
              }))}>删除</button>
            </div>
          ))}
        </div>
        <div className="runtime-agent-bindings">
          {ROUTABLE_AGENT_IDS.map((agentId) => (
            <label key={agentId}>
              <span>{ROUTABLE_AGENT_LABELS[agentId]}</span>
              <select value={runtimeConfig.agentModels?.[agentId] || ''} onChange={(e) => setRuntimeConfig((prev) => ({ ...prev, agentModels: { ...(prev.agentModels || {}), [agentId]: e.target.value } }))}>
                <option value="">Mock / 未绑定</option>
                {(runtimeConfig.models || []).map((model) => (
                  <option key={model.id} value={model.id}>{model.name || model.id} · {model.model || '未填写模型'}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <div className="sec-title">派发渠道</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <select className="msel" value={channelSel} onChange={(e) => setChannelSel(e.target.value)}
            style={{ maxWidth: 220 }}>
            {CHANNELS.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.label}</option>
            ))}
          </select>
          <button className="btn btn-p" disabled={channelSel === (agentConfig?.dispatchChannel || 'feishu')}
            onClick={async () => {
              try {
                const r = await api.setDispatchChannel(channelSel);
                if (r.ok) { setChannelStatus('✅ 已保存'); toast('派发渠道已切换', 'ok'); loadAgentConfig(); }
                else setChannelStatus('❌ ' + (r.error || '失败'));
              } catch { setChannelStatus('❌ 无法连接'); }
              setTimeout(() => setChannelStatus(''), 3000);
            }}>应用</button>
          {channelStatus && <span style={{ fontSize: 12, color: channelStatus.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>{channelStatus}</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>自动派发时使用的 OpenClaw 通知渠道（需已在 openclaw.json 中配置对应 channel）</div>
      </div>

      {/* Change Log */}
      <div style={{ marginTop: 24 }}>
        <div className="sec-title">变更日志</div>
        <div className="cl-list">
          {!changeLog?.length ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>暂无变更</div>
          ) : (
            [...changeLog]
              .reverse()
              .slice(0, 15)
              .map((e, i) => (
                <div className="cl-row" key={i}>
                  <span className="cl-t">{(e.at || '').substring(0, 16).replace('T', ' ')}</span>
                  <span className="cl-a">{e.agentId}</span>
                  <span className="cl-c">
                    <b>{e.oldModel}</b> → <b>{e.newModel}</b>
                    {e.rolledBack && (
                      <span
                        style={{
                          color: 'var(--danger)',
                          fontSize: 10,
                          border: '1px solid #ff527044',
                          padding: '1px 5px',
                          borderRadius: 3,
                          marginLeft: 4,
                        }}
                      >
                        ⚠ 已回滚
                      </span>
                    )}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
