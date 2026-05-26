import { useEffect } from 'react';
import { useStore, TAB_DEFS, startPolling, stopPolling, isEdict, isArchived } from './store';
import EdictBoard from './components/EdictBoard';
import MonitorPanel from './components/MonitorPanel';
import OfficialPanel from './components/OfficialPanel';
import ModelConfig from './components/ModelConfig';
import SkillsConfig from './components/SkillsConfig';
import SessionsPanel from './components/SessionsPanel';
import MemorialPanel from './components/MemorialPanel';
import TemplatePanel from './components/TemplatePanel';
import MorningPanel from './components/MorningPanel';
import TaskModal from './components/TaskModal';
// ConfirmDialog is used inside TaskModal as needed
import Toaster from './components/Toaster';
import CourtCeremony from './components/CourtCeremony';
import CourtDiscussion from './components/CourtDiscussion';
import CourtControlConsole from './components/CourtControlConsole';

export default function App() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const liveStatus = useStore((s) => s.liveStatus);
  const agentConfig = useStore((s) => s.agentConfig);
  const countdown = useStore((s) => s.countdown);
  const loadAll = useStore((s) => s.loadAll);
  const loadAgentConfig = useStore((s) => s.loadAgentConfig);

  useEffect(() => {
    // 首页顶部需要展示 Agent 数量，因此启动时同步一次本地 Agent 配置。
    loadAgentConfig();
    startPolling();
    return () => stopPolling();
  }, [loadAgentConfig]);

  // Compute header chips
  const tasks = liveStatus?.tasks || [];
  const edicts = tasks.filter(isEdict);
  const activeEdicts = edicts.filter((t) => !isArchived(t));
  const sync = liveStatus?.syncStatus;
  const syncOk = sync?.ok;
  const runningEdicts = activeEdicts.filter((t) => !['Done', 'Cancelled', 'Blocked'].includes(t.state));
  const courtStatus = syncOk === false ? '朝堂离线' : runningEdicts.length > 0 ? '正在议政' : '候旨待命';
  const dashboardPort = window.location.port || '7891';

  // Tab badge counts
  const tabBadge = (key: string): string => {
    if (key === 'edicts') return String(activeEdicts.length);
    if (key === 'sessions') return String(tasks.filter((t) => !isEdict(t)).length);
    if (key === 'memorials') return String(edicts.filter((t) => ['Done', 'Cancelled'].includes(t.state)).length);
    if (key === 'monitor') {
      const activeDepts = tasks.filter((t) => isEdict(t) && t.state === 'Doing').length;
      return activeDepts + '活跃';
    }
    return '';
  };

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <div className="hdr">
        <div>
          <div className="logo">三省六部 · 总控台</div>
          <div className="sub-text">OpenClaw Sansheng-Liubu Dashboard</div>
        </div>
        <div className="hdr-r">
          {/* 新增朝堂态势指标，只读展示，不影响原调度逻辑。 */}
          <span className={`chip ${runningEdicts.length > 0 ? 'warn' : syncOk === false ? 'err' : 'ok'}`}>
            朝堂状态：{courtStatus}
          </span>
          <span className="chip">Agent：{agentConfig?.agents?.length || 0}</span>
          <span className="chip">端口：{dashboardPort}</span>
          <span className="chip">任务：{tasks.length}</span>
          <span className={`chip ${syncOk ? 'ok' : syncOk === false ? 'err' : ''}`}>
            {syncOk ? '✅ 同步正常' : syncOk === false ? '❌ 服务器未启动' : '⏳ 连接中…'}
          </span>
          <span className="chip">{activeEdicts.length} 道旨意</span>
          <button className="btn-refresh" onClick={() => loadAll()}>
            ⟳ 刷新
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>⟳ {countdown}s</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs">
        {TAB_DEFS.map((t) => (
          <div
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
            {tabBadge(t.key) && <span className="tbadge">{tabBadge(t.key)}</span>}
          </div>
        ))}
      </div>

      {/* ── Panels ── */}
      {activeTab === 'edicts' && (
        <>
          {/* AI 朝廷控制台是第一阶段新增首页，不改变原旨意看板能力。 */}
          <CourtControlConsole />
          <EdictBoard />
        </>
      )}
      {activeTab === 'court' && <CourtDiscussion />}
      {activeTab === 'monitor' && <MonitorPanel />}
      {activeTab === 'officials' && <OfficialPanel />}
      {activeTab === 'models' && <ModelConfig />}
      {activeTab === 'skills' && <SkillsConfig />}
      {activeTab === 'sessions' && <SessionsPanel />}
      {activeTab === 'memorials' && <MemorialPanel />}
      {activeTab === 'templates' && <TemplatePanel />}
      {activeTab === 'morning' && <MorningPanel />}

      {/* ── Overlays ── */}
      <TaskModal />
      <Toaster />
      <CourtCeremony />
    </div>
  );
}
