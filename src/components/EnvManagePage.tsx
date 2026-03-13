import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AppWindow, Bot, Cloud, Laptop, RefreshCw, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AgentInfo, Env, Project, SessionRecord } from '../App'

type AcpAgent = {
  id: string
  name: string
  executable: string
  status: 'ready' | 'handshaking' | 'starting' | 'error' | 'closed' | 'disconnected' | 'not_installed' | 'runtime_missing'
  version?: string | null
  pid?: number | null
  protocolVersion?: string | null
  lastError?: string | null
  runtimeSupported?: boolean
  installHint?: string | null
  installTarget?: string
  locationLabel?: string
  wslDistro?: string | null
}

type Props = { onBack: () => void; onEnvChange?: () => void }

const CLI_AGENTS = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' },
  { id: 'gemini', name: 'Gemini CLI' },
  { id: 'opencode', name: 'OpenCode' },
  { id: 'openclaw', name: 'OpenClaw' },
] as const

const ACP_RUNTIME_INSTALLS: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
  opencode: 'npm install -g opencode',
}

const getEnvIcon = (type: Env['type']): LucideIcon => {
  if (type === 'local') return Laptop
  if (type === 'wsl') return AppWindow
  return Cloud
}

const getAcpKey = (agent: AcpAgent) => `${agent.installTarget || 'local'}:${agent.wslDistro || ''}:${agent.id}`

function Badge({ text }: { text: string }) {
  return <span className="rounded-full bg-[#1b1f2b] px-2 py-0.5 text-[10px] text-[#8b8fa7]">{text}</span>
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#1d2030] py-2 last:border-b-0">
      <span className="text-xs text-[#8b8fa7]">{label}</span>
      <span className="break-all text-right font-mono text-xs">{value}</span>
    </div>
  )
}

export default function EnvManagePage({ onBack }: Props) {
  const [envs, setEnvs] = useState<Env[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [cliAgents, setCliAgents] = useState<AgentInfo[] | null>(null)
  const [acpAgents, setAcpAgents] = useState<AcpAgent[]>([])
  const [selectedAcpKey, setSelectedAcpKey] = useState('')
  const [scanningCli, setScanningCli] = useState(false)
  const [loadingAcp, setLoadingAcp] = useState(false)

  const selectedEnv = useMemo(() => envs.find((env) => env.id === selectedEnvId) ?? null, [envs, selectedEnvId])
  const envProjects = useMemo(() => projects.filter((project) => project.env_id === selectedEnvId), [projects, selectedEnvId])
  const envSessions = useMemo(() => sessions.filter((session) => session.env_id === selectedEnvId), [sessions, selectedEnvId])
  const selectedAcp = useMemo(() => acpAgents.find((agent) => getAcpKey(agent) === selectedAcpKey) ?? null, [acpAgents, selectedAcpKey])

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    void loadCliAgents()
    void loadAcpAgents()
  }, [selectedEnvId, envs])

  const loadData = async () => {
    const [envList, projectList, sessionList] = await Promise.all([
      invoke<Env[]>('list_envs').catch(() => []),
      invoke<Project[]>('list_projects').catch(() => []),
      invoke<SessionRecord[]>('list_sessions').catch(() => []),
    ])
    setEnvs(envList)
    setProjects(projectList)
    setSessions(sessionList)
    setSelectedEnvId((current) => current && envList.some((env) => env.id === current)
      ? current
      : (envList.find((env) => env.type === 'local')?.id || envList[0]?.id || null))
  }

  const loadCliAgents = async () => {
    if (!selectedEnv) {
      setCliAgents(null)
      return
    }
    setCliAgents(await invoke<AgentInfo[]>('get_env_agent_scan_cache', { envId: selectedEnv.id }).catch(() => null))
  }

  const refreshCliAgents = async () => {
    if (!selectedEnv) return
    setScanningCli(true)
    try {
      setCliAgents(await invoke<AgentInfo[]>('refresh_env_agent_scan_cache', { envId: selectedEnv.id }))
    } finally {
      setScanningCli(false)
    }
  }

  const loadAcpAgents = async () => {
    if (!selectedEnv) {
      setAcpAgents([])
      setSelectedAcpKey('')
      return
    }

    setLoadingAcp(true)
    try {
      const scopedAgents = selectedEnv.type === 'wsl' && selectedEnv.wsl_distro
        ? await invoke<AcpAgent[]>('get_acp_agent_scan_cache', {
          installTarget: 'wsl',
          distro: selectedEnv.wsl_distro,
          user: selectedEnv.wsl_user ?? null,
        }).catch(() => [])
        : await invoke<AcpAgent[]>('get_acp_agent_scan_cache').catch(() => [])

      setAcpAgents(scopedAgents)
      setSelectedAcpKey((current) => current && scopedAgents.some((agent) => getAcpKey(agent) === current)
        ? current
        : (scopedAgents[0] ? getAcpKey(scopedAgents[0]) : ''))
    } finally {
      setLoadingAcp(false)
    }
  }

  const refreshAcpAgents = async () => {
    if (!selectedEnv) return

    setLoadingAcp(true)
    try {
      if (selectedEnv.type === 'wsl' && selectedEnv.wsl_distro) {
        await invoke('refresh_acp_agent_scan_cache', {
          installTarget: 'wsl',
          distro: selectedEnv.wsl_distro,
          user: selectedEnv.wsl_user ?? null,
        }).catch(() => null)
      } else {
        await invoke('refresh_acp_agent_scan_cache').catch(() => null)
      }
      await loadAcpAgents()
    } finally {
      setLoadingAcp(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[#08090d]">
      <div className="flex items-center gap-3 border-b border-[#1d2030] px-6 py-4">
        <button type="button" onClick={onBack} className="rounded-md px-2 py-1 text-sm text-[#4e5270] transition-colors hover:bg-[#222738] hover:text-[#8B5CF6]">
          Back
        </button>
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Settings size={16} />
            环境与 Agent 管理
          </div>
          <div className="mt-0.5 text-[11px] text-[#4e5270]">环境、CLI Agent 和 ACP Runtime 在同一页面统一展示。</div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[280px] overflow-y-auto border-r border-[#1d2030] p-2.5">
          {envs.map((env) => {
            const Icon = getEnvIcon(env.type)
            return (
              <button
                key={env.id}
                type="button"
                onClick={() => setSelectedEnvId(env.id)}
                className={`mb-1 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left ${selectedEnvId === env.id ? 'border-[#8B5CF6]/40 bg-[#8B5CF6]/12' : 'border-transparent hover:bg-[#222738]'}`}
              >
                <Icon size={18} className="text-[#8b8fa7]" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{env.name}</div>
                  <div className="truncate text-[10px] text-[#4e5270]">{env.type === 'wsl' ? env.wsl_distro || 'WSL' : env.host || env.detail || 'localhost'}</div>
                </div>
                <Badge text={env.status === 'online' ? '在线' : '离线'} />
              </button>
            )
          })}
        </div>

        {selectedEnv && (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-xl border border-[#1d2030] bg-[#151820] p-4">
              <div className="mb-3 text-lg font-semibold">{selectedEnv.name}</div>
              <Field label="类型" value={selectedEnv.type.toUpperCase()} />
              <Field label="地址" value={selectedEnv.type === 'wsl' ? (selectedEnv.wsl_distro || '-') : (selectedEnv.host || selectedEnv.detail || 'localhost')} />
              <Field label="项目" value={`${envProjects.length}`} />
              <Field label="会话" value={`${envSessions.length}`} />
            </div>

            <div className="rounded-xl border border-[#1d2030] bg-[#151820] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#4e5270]">
                  <Bot size={12} />
                  CLI Agent
                </div>
                <button type="button" onClick={() => void refreshCliAgents()} className="text-[10px] text-[#8b8fa7] transition-colors hover:text-[#8B5CF6]">
                  {scanningCli ? '扫描中...' : '重新扫描'}
                </button>
              </div>
              {CLI_AGENTS.map((agent) => {
                const detected = cliAgents?.find((item) => item.id === agent.id)
                return (
                  <div key={agent.id} className="flex items-center justify-between border-b border-[#1d2030] py-2 last:border-b-0">
                    <div>
                      <div className="text-xs">{agent.name}</div>
                      <div className="text-[10px] text-[#4e5270]">{detected?.version || '-'}</div>
                    </div>
                    <Badge text={detected?.installed ? '已安装' : '未找到'} />
                  </div>
                )
              })}
            </div>

            <div className="rounded-xl border border-[#1d2030] bg-[#151820] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#4e5270]">
                    <Bot size={12} />
                    ACP Runtime
                  </div>
                  <div className="mt-1 text-[11px] text-[#4e5270]">只检测当前选中环境内可用的 ACP Agent，不再单独绑定 WSL 环境。</div>
                </div>
                <button type="button" onClick={() => void refreshAcpAgents()} className="inline-flex items-center gap-1.5 text-[12px] text-[#8b8fa7] hover:text-[#8B5CF6]">
                  <RefreshCw size={12} className={loadingAcp ? 'animate-spin' : ''} />
                  刷新
                </button>
              </div>

              <div className="mb-4 rounded-lg border border-[#1d2030] bg-[#10131b] p-3 text-[11px] text-[#8b8fa7]">
                {selectedEnv.type === 'wsl'
                  ? `当前环境为 WSL，ACP Runtime 将在 ${selectedEnv.wsl_distro || selectedEnv.name} 内检测。`
                  : '当前环境不是 WSL，ACP Runtime 仅检测当前系统中的本地安装。'}
              </div>

              <div>
                {acpAgents.length > 0 ? acpAgents.map((agent) => (
                  <button
                    key={getAcpKey(agent)}
                    type="button"
                    onClick={() => setSelectedAcpKey(getAcpKey(agent))}
                    className={`mb-1 w-full rounded-lg border px-3 py-2 text-left ${selectedAcpKey === getAcpKey(agent) ? 'border-[#8B5CF6] bg-[#8B5CF6]/10' : 'border-[#1d2030]'}`}
                  >
                    <div className="text-xs">{agent.name}</div>
                    <div className="text-[10px] text-[#4e5270]">{agent.locationLabel || (selectedEnv.type === 'wsl' ? 'WSL' : '本机')}</div>
                  </button>
                )) : <div className="rounded-lg border border-dashed border-[#1d2030] p-3 text-[11px] text-[#4e5270]">当前环境未检测到 ACP Runtime。</div>}
              </div>

              {selectedAcp && (
                <div className="mt-4 rounded-xl border border-[#1d2030] bg-[#10131b] p-4">
                  <div className="mb-3 text-sm font-medium">{selectedAcp.name}</div>
                  <Field label="位置" value={selectedAcp.locationLabel || (selectedEnv.type === 'wsl' ? 'WSL' : '本机')} />
                  <Field label="命令" value={selectedAcp.executable || selectedAcp.id} />
                  <Field label="版本" value={selectedAcp.version || '-'} />
                  <Field label="协议" value={selectedAcp.protocolVersion || (selectedAcp.runtimeSupported ? 'ACP 可用' : '-')} />
                  <Field label="PID" value={selectedAcp.pid ? String(selectedAcp.pid) : '-'} />
                  <div className="mt-3 text-[11px] text-[#8b8fa7]">{selectedAcp.lastError || '该 Runtime 可直接用于当前环境下的 ACP 会话。'}</div>
                  <div className="mt-3 text-[11px] text-[#4e5270]">安装命令：{selectedAcp.installHint || ACP_RUNTIME_INSTALLS[selectedAcp.id] || '-'}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
