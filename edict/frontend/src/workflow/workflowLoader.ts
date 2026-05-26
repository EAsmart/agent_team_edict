import type { RegisteredAgent } from '../agentRegistry';
import defaultWorkflowRaw from './defaultWorkflow.json?raw';

export type WorkflowStage = {
  id: string;
  label: string;
  agentIds: string[];
  required: boolean;
};

export type WorkflowRoutingRule = {
  id: string;
  label: string;
  keywords: string[];
  agentIds: string[];
};

export type CourtWorkflowDefinition = {
  id: string;
  name: string;
  version: number;
  entryAgentId: string;
  summaryAgentId: string;
  stages: WorkflowStage[];
  routingRules: WorkflowRoutingRule[];
  fallbackAgentIds: string[];
};

export type WorkflowRoute = {
  agentIds: string[];
  matchedRules: WorkflowRoutingRule[];
  reason: string;
};

export function loadWorkflowFromJson(raw: string): CourtWorkflowDefinition {
  // JSON 工作流入口，后续可以把用户上传或本地保存的 JSON 交给这里解析。
  const parsed = JSON.parse(raw) as CourtWorkflowDefinition;
  return {
    ...parsed,
    stages: parsed.stages || [],
    routingRules: parsed.routingRules || [],
    fallbackAgentIds: parsed.fallbackAgentIds || [],
  };
}

export function loadDefaultWorkflow() {
  // 默认工作流来自真实 JSON 文件，不把流程硬编码在 TaskBus 里。
  return loadWorkflowFromJson(defaultWorkflowRaw);
}

export function resolveWorkflowRoute(
  workflow: CourtWorkflowDefinition,
  content: string,
  enabledAgents: RegisteredAgent[],
): WorkflowRoute {
  // 太子编排时根据圣旨内容命中路由规则，并过滤掉未启用 Agent。
  const enabledIds = new Set(enabledAgents.map((agent) => agent.id));
  const requiredAgentIds = workflow.stages
    .filter((stage) => stage.required)
    .flatMap((stage) => stage.agentIds)
    .filter((agentId) => enabledIds.has(agentId));

  const normalizedContent = content.toLowerCase();
  const matchedRules = workflow.routingRules.filter((rule) =>
    rule.keywords.some((keyword) => normalizedContent.includes(keyword.toLowerCase())),
  );

  const routedAgentIds = matchedRules
    .flatMap((rule) => rule.agentIds)
    .filter((agentId) => enabledIds.has(agentId));

  const fallbackAgentIds = workflow.fallbackAgentIds.filter((agentId) => enabledIds.has(agentId));
  const selectedExecutorIds = routedAgentIds.length > 0 ? routedAgentIds : fallbackAgentIds;
  const agentIds = Array.from(new Set([...requiredAgentIds, ...selectedExecutorIds]));
  const reason = matchedRules.length > 0
    ? `命中规则：${matchedRules.map((rule) => rule.label).join('、')}`
    : '未命中特定规则，启用默认兜底部门';

  return { agentIds, matchedRules, reason };
}
