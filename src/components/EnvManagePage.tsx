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
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1b1f2b] text-[#8b8fa7]">{text}</span>
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 py-2 border-b border-[#1d2030] last:border-b-0"><span className="text-xs text-[#8b8fa7]">{label}</span><span className="text-xs font-mono text-right break-all">{value}</span></div>
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
  const [configuredWslEnvId, setConfiguredWslEnvId] = useState<string | null>(null)
  const [pendingWslEnvId, setPendingWslEnvId] = useState('')
  const [wslInstalled, setWslInstalled] = useState(false)

  const selectedEnv = useMemo(() => envs.find((env) => env.id === selectedEnvId) ?? null, [envs, selectedEnvId])
  const envProjects = useMemo(() => projects.filter((project) => project.env_id === selectedEnvId), [projects, selectedEnvId])
  const envSessions = useMemo(() => sessions.filter((session) => session.env_id === selectedEnvId), [sessions, selectedEnvId])
  const selectedAcp = useMemo(() => acpAgents.find((agent) => getAcpKey(agent) === selectedAcpKey) ?? null, [acpAgents, selectedAcpKey])

  useEffect(() => {
    void loadData()
    void loadWslConfig()
  }, [])

  useEffect(() => {
    void loadCliAgents()
  }, [selectedEnvId])

  useEffect(() => {
    void loadAcpAgents()
  }, [envs, configuredWslEnvId])

  const loadData = async () => {
    const [envList, projectList, sessionList, installed] = await Promise.all([
      invoke<Env[]>('list_envs').catch(() => []),
      invoke<Project[]>('list_projects').catch(() => []),
      invoke<SessionRecord[]>('list_sessions').catch(() => []),
      invoke<boolean>('check_wsl_installed').catch(() => false),
    ])
    setEnvs(envList)
    setProjects(projectList)
    setSessions(sessionList)
    setWslInstalled(installed)
    setSelectedEnvId((current) => current && envList.some((env) => env.id === current) ? current : (envList.find((env) => env.type === 'local')?.id || envList[0]?.id || null))
  }

  const loadWslConfig = async () => {
    const envId = await invoke<string | null>('get_acp_wsl_env_id').catch(() => null)
    setConfiguredWslEnvId(envId)
    setPendingWslEnvId(envId || '')
  }

  const loadCliAgents = async () => {
    if (!selectedEnv) return
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
    setLoadingAcp(true)
    try {
      const local = await invoke<AcpAgent[]>('get_acp_agent_scan_cache').catch(() => [])
      const configuredWslEnv = envs.find((env) => env.id === configuredWslEnvId && env.type === 'wsl')
      const wsl = configuredWslEnv?.wsl_distro ? await invoke<AcpAgent[]>('get_acp_agent_scan_cache', { installTarget: 'wsl', distro: configuredWslEnv.wsl_distro }).catch(() => []) : []
      const merged = [...local, ...wsl]
      setAcpAgents(merged)
      setSelectedAcpKey((current) => current && merged.some((agent) => getAcpKey(agent) === current) ? current : (merged[0] ? getAcpKey(merged[0]) : ''))
    } finally {
      setLoadingAcp(false)
    }
  }

  const refreshAcpAgents = async () => {
    setLoadingAcp(true)
    try {
      await invoke('refresh_acp_agent_scan_cache').catch(() => null)
      const configuredWslEnv = envs.find((env) => env.id === configuredWslEnvId && env.type === 'wsl')
      if (configuredWslEnv?.wsl_distro) {
        await invoke('refresh_acp_agent_scan_cache', { installTarget: 'wsl', distro: configuredWslEnv.wsl_distro, user: configuredWslEnv.wsl_user ?? null }).catch(() => null)
      }
      await loadAcpAgents()
    } finally {
      setLoadingAcp(false)
    }
  }

  const saveWslConfig = async () => {
    await invoke('set_acp_wsl_env_id', { envId: pendingWslEnvId || null }).catch(() => null)
    await loadWslConfig()
    await loadAcpAgents()
  }

  return (
    <div className="flex-1 flex flex-col bg-[#08090d]">
      <div className="px-6 py-4 border-b border-[#1d2030] flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-sm text-[#4e5270] px-2 py-1 rounded-md hover:bg-[#222738] hover:text-[#8B5CF6] transition-colors">←</button>
        <div>
          <div className="text-base font-semibold flex items-center gap-2"><Settings size={16} />环境与 Agent 管理</div>
          <div className="text-[11px] text-[#4e5270] mt-0.5">环境、CLI Agent、ACP Runtime 统一展示</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[280px] border-r border-[#1d2030] overflow-y-auto p-2.5">
          {envs.map((env) => {
            const Icon = getEnvIcon(env.type)
            return (
              <button key={env.id} type="button" onClick={() => setSelectedEnvId(env.id)} className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-1 ${selectedEnvId === env.id ? 'bg-[#8B5CF6]/12 border border-[#8B5CF6]/40' : 'border border-transparent hover:bg-[#222738]'}`}>
                <Icon size={18} className="text-[#8b8fa7]" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{env.name}</div>
                  <div className="text-[10px] text-[#4e5270] truncate">{env.type === 'wsl' ? env.wsl_distro || 'WSL' : env.host || env.detail || 'localhost'}</div>
                </div>
                <Badge text={env.status === 'online' ? '在线' : '离线'} />
              </button>
            )
          })}
        </div>

        {selectedEnv && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4">
              <div className="text-lg font-semibold mb-3">{selectedEnv.name}</div>
              <Field label="类型" value={selectedEnv.type.toUpperCase()} />
              <Field label="地址" value={selectedEnv.type === 'wsl' ? (selectedEnv.wsl_distro || '-') : (selectedEnv.host || selectedEnv.detail || 'localhost')} />
              <Field label="项目" value={`${envProjects.length} 个`} />
              <Field label="会话" value={`${envSessions.length} 个`} />
            </div>

            <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] inline-flex items-center gap-1.5"><Bot size={12} />CLI Agent</div>
                <button type="button" onClick={() => void refreshCliAgents()} className="text-[10px] text-[#8b8fa7] hover:text-[#8B5CF6] transition-colors">{scanningCli ? '扫描中...' : '重新扫描'}</button>
              </div>
              {CLI_AGENTS.map((agent) => {
                const detected = cliAgents?.find((item) => item.id === agent.id)
                return <div key={agent.id} className="flex items-center justify-between py-2 border-b border-[#1d2030] last:border-b-0"><div><div className="text-xs">{agent.name}</div><div className="text-[10px] text-[#4e5270]">{detected?.version || '-'}</div></div><Badge text={detected?.installed ? '已安装' : '未找到'} /></div>
              })}
            </div>

            <div className="bg-[#151820] rounded-xl border border-[#1d2030] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4e5270] inline-flex items-center gap-1.5"><Bot size={12} />ACP Runtime</div>
                  <div className="text-[11px] text-[#4e5270] mt-1">原来的 ACP Agent 菜单已合并进环境页面。</div>
                </div>
                <button type="button" onClick={() => void refreshAcpAgents()} className="text-[12px] text-[#8b8fa7] hover:text-[#8B5CF6] inline-flex items-center gap-1.5"><RefreshCw size={12} className={loadingAcp ? 'animate-spin' : ''} />刷新</button>
              </div>

              {wslInstalled && (
                <div className="mb-4 p-3 rounded-lg bg-[#10131b] border border-[#1d2030]">
                  <div className="text-[11px] text-[#8b8fa7] mb-2">WSL ACP 一次只绑定一个 WSL 环境。</div>
                  <div className="flex gap-2">
                    <select value={pendingWslEnvId} onChange={(e) => setPendingWslEnvId(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-[#282d3e] bg-[#0f1117] text-[#e2e4ed] text-[12px] outline-none">
                      <option value="">不使用 WSL ACP</option>
                      {envs.filter((env) => env.type === 'wsl').map((env) => <option key={env.id} value={env.id}>{env.name} {env.wsl_distro ? `(${env.wsl_distro})` : ''}</option>)}
                    </select>
                    <button type="button" onClick={() => void saveWslConfig()} className="px-3 py-2 rounded-lg border border-[#282d3e] text-[12px] text-[#8b8fa7] hover:border-[#8B5CF6] hover:text-[#8B5CF6]">应用</button>
                  </div>
                  <div className="text-[10px] text-[#4e5270] mt-2">{configuredWslEnvId ? `当前 WSL ACP 环境：${envs.find((env) => env.id === configuredWslEnvId)?.name || configuredWslEnvId}` : '当前 WSL ACP 环境：未配置'}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>{acpAgents.filter((agent) => agent.installTarget !== 'wsl').map((agent) => <button key={getAcpKey(agent)} type="button" onClick={() => setSelectedAcpKey(getAcpKey(agent))} className={`w-full text-left py-2 px-3 rounded-lg border mb-1 ${selectedAcpKey === getAcpKey(agent) ? 'border-[#8B5CF6] bg-[#8B5CF6]/10' : 'border-[#1d2030]'}`}><div className="text-xs">{agent.name}</div><div className="text-[10px] text-[#4e5270]">{agent.locationLabel || '本机'}</div></button>)}</div>
                <div>{acpAgents.filter((agent) => agent.installTarget === 'wsl').length > 0 ? acpAgents.filter((agent) => agent.installTarget === 'wsl').map((agent) => <button key={getAcpKey(agent)} type="button" onClick={() => setSelectedAcpKey(getAcpKey(agent))} className={`w-full text-left py-2 px-3 rounded-lg border mb-1 ${selectedAcpKey === getAcpKey(agent) ? 'border-[#8B5CF6] bg-[#8B5CF6]/10' : 'border-[#1d2030]'}`}><div className="text-xs">{agent.name}</div><div className="text-[10px] text-[#4e5270]">{agent.locationLabel || 'WSL'}</div></button>) : <div className="text-[11px] text-[#4e5270] border border-dashed border-[#1d2030] rounded-lg p-3">未配置 WSL ACP 环境。</div>}</div>
              </div>

              {selectedAcp && (
                <div className="mt-4 bg-[#10131b] rounded-xl border border-[#1d2030] p-4">
                  <div className="text-sm font-medium mb-3">{selectedAcp.name}</div>
                  <Field label="位置" value={selectedAcp.locationLabel || '本机'} />
                  <Field label="命令" value={selectedAcp.executable || selectedAcp.id} />
                  <Field label="版本" value={selectedAcp.version || '-'} />
                  <Field label="协议" value={selectedAcp.protocolVersion || (selectedAcp.runtimeSupported ? 'ACP 可用' : '-')} />
                  <Field label="PID" value={selectedAcp.pid ? String(selectedAcp.pid) : '-'} />
                  <div className="mt-3 text-[11px] text-[#8b8fa7]">{selectedAcp.lastError || '该 Runtime 可直接在项目型 ACP 会话中使用。'}</div>
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
