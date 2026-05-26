import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Folder,
  Key,
  Cpu,
  Send,
  Loader2,
  RefreshCw,
  User,
  Bot,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  Zap,
  FolderOpen,
  Settings,
  Download,
  BookOpen,
  Plus,
  Code,
  Globe,
  Trash2,
  Clock,
  Calendar,
  Play,
  Pause
} from 'lucide-react'

// Message in local UI format
interface MessageLog {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: Date
}

// Custom code component for ReactMarkdown with premium styling
const renderers = {
  code({ node, inline, className, children, ...props }: any) {
    const [copied, setCopied] = useState(false)
    const match = /language-(\w+)/.exec(className || '')
    const codeText = String(children).replace(/\n$/, '')

    const handleCopy = async () => {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    return !inline ? (
      <div className="my-5 rounded-2xl overflow-hidden border border-zinc-800/80 bg-zinc-950/90 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between px-5 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            <span className="text-xs text-indigo-400 font-mono font-semibold tracking-wider ml-2">
              {match ? match[1].toUpperCase() : 'CODE'}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors bg-zinc-850 hover:bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-700/30"
          >
            {copied ? (
              <>
                <Check size={12} className="text-green-400" />
                <span className="text-green-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-5 overflow-x-auto text-xs sm:text-sm text-zinc-200 font-mono leading-relaxed bg-[#020203]">
          <code>{children}</code>
        </pre>
      </div>
    ) : (
      <code
        className="px-1.5 py-0.5 rounded-md text-xs font-semibold bg-zinc-900 border border-zinc-800/50 text-indigo-400 font-mono"
        {...props}
      >
        {children}
      </code>
    )
  }
}

// Helper to extract text from Pi Agent messages
const getTextFromMessage = (msg: any): string => {
  if (!msg) return ''
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((c: any) => {
        if (c.type === 'text') return c.text
        return ''
      })
      .join('')
  }
  return ''
}

export default function App(): React.JSX.Element {
  // Navigation & configuration state
  const [viewState, setViewState] = useState<'setup' | 'chat'>('chat')
  const [apiKey, setApiKey] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [modelId, setModelId] = useState('')
  const [availableModels, setAvailableModels] = useState<
    { provider: string; id: string; name: string }[]
  >([])
  const [mcpCommand, setMcpCommand] = useState('')
  const [mcpArgs, setMcpArgs] = useState('')
  const [isInitializing, setIsInitializing] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  // Planning state
  const [planningMode, setPlanningMode] = useState(false)
  const [planningStep, setPlanningStep] = useState(0)
  const [planningData, setPlanningData] = useState<{ framework: string; details: string }>({
    framework: '',
    details: ''
  })

  // Chat conversation state
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [inputPrompt, setInputPrompt] = useState('')

  // Slash commands state
  const [slashCommands, setSlashCommands] = useState<{ name: string; description: string }[]>([])
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const [slashCommandFilter, setSlashCommandFilter] = useState('')
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0)

  // Load slash commands
  useEffect(() => {
    window.copilot
      .getCommands()
      .then((commands) => {
        setSlashCommands(commands)
      })
      .catch((err) => {
        console.error('Failed to load slash commands:', err)
      })
  }, [])

  // Agent activity states
  const [isAgentWorking, setIsAgentWorking] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [activeToolArgs, setActiveToolArgs] = useState<any>(null)

  // Skills Manager states
  const [installedSkills, setInstalledSkills] = useState<string[]>([])
  const [skillUrlInput, setSkillUrlInput] = useState('')
  const [isInstallingSkill, setIsInstallingSkill] = useState(false)
  const [skillInstallError, setSkillInstallError] = useState<string | null>(null)
  const [skillInstallSuccess, setSkillInstallSuccess] = useState<string | null>(null)

  // SQLite persistent chats & Settings Modal states
  const [chats, setChats] = useState<any[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Scheduler States
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledTasks, setScheduledTasks] = useState<any[]>([])
  const [newCronPrompt, setNewCronPrompt] = useState('')
  const [newCronInterval, setNewCronInterval] = useState('Every Hour')

  const activeChatIdRef = useRef<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Keep ref up to date to prevent React stale closure issues in onAgentEvent listener
  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  // Load API key and workspace from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('openai_api_key') || ''
    if (savedKey) {
      setApiKey(savedKey)
    }
    const savedModelId = localStorage.getItem('selected_model_id') || ''
    if (savedModelId) {
      setModelId(savedModelId)
    }
    const savedMcpCommand = localStorage.getItem('mcp_command') || ''
    if (savedMcpCommand) {
      setMcpCommand(savedMcpCommand)
    }
    const savedMcpArgs = localStorage.getItem('mcp_args') || ''
    if (savedMcpArgs) {
      setMcpArgs(savedMcpArgs)
    }

    // Load available models
    window.copilot.listModels().then((models) => {
      setAvailableModels(models)
    })

    const savedWorkspace = localStorage.getItem('workspace_path')
    if (savedWorkspace) {
      handleLoadWorkspace(savedWorkspace, savedKey, savedModelId, savedMcpCommand, savedMcpArgs)
    }
  }, [])

  // Auto-scroll chat log
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, activeTool])

  // Set up agent event stream pipeline
  useEffect(() => {
    if (viewState !== 'chat') return

    window.copilot.onAgentEvent((event: any) => {
      console.log('Received agent event:', event)

      switch (event.type) {
        case 'agent_start':
        case 'turn_start':
          setIsAgentWorking(true)
          break

        case 'message_start':
          if (
            event.message?.role === 'user' ||
            event.message?.role === 'system' ||
            event.message?.role === 'tool'
          )
            break
          setStreamingText('')
          break

        case 'message_update': {
          if (
            event.message?.role === 'user' ||
            event.message?.role === 'system' ||
            event.message?.role === 'tool'
          )
            break
          const text = getTextFromMessage(event.message)
          setStreamingText(text)
          break
        }

        case 'message_end': {
          if (
            event.message?.role === 'user' ||
            event.message?.role === 'system' ||
            event.message?.role === 'tool'
          )
            break
          const finalVal = getTextFromMessage(event.message)
          if (finalVal.trim()) {
            const assistantMsgId = 'assistant-' + Date.now()

            // Save assistant message to SQLite
            if (activeChatIdRef.current) {
              window.copilot.addMessage({
                id: assistantMsgId,
                chatId: activeChatIdRef.current,
                sender: 'assistant',
                text: finalVal
              })
            }

            setMessages((prev) => [
              ...prev,
              {
                id: assistantMsgId,
                sender: 'assistant',
                text: finalVal,
                timestamp: new Date()
              }
            ])
          }
          setStreamingText('')
          break
        }

        case 'tool_execution_start':
          setActiveTool(event.toolName)
          setActiveToolArgs(event.args)
          break

        case 'tool_execution_end':
          setActiveTool(null)
          setActiveToolArgs(null)

          // Auto refresh skills list if agent executed the install_skill tool successfully
          if (event.toolName === 'install_skill' && !event.isError) {
            refreshSkillsList()
          }
          break

        case 'turn_end':
        case 'agent_end':
          setIsAgentWorking(false)
          setStreamingText('')
          setActiveTool(null)
          setActiveToolArgs(null)
          break

        default:
          break
      }
    })
  }, [viewState, workspace])

  // Listen for scheduled task events to refresh conversation log
  const workspaceRef = useRef<string>('')
  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    window.copilot.onScheduledTaskTriggered((payload: any) => {
      console.log('Scheduled task triggered:', payload)
      if (workspaceRef.current === payload.workspace) {
        loadWorkspaceChats(workspaceRef.current)
      }
    })
    window.copilot.onScheduledTaskCompleted((payload: any) => {
      console.log('Scheduled task completed:', payload)
      if (workspaceRef.current === payload.workspace) {
        loadWorkspaceChats(workspaceRef.current)
        if (activeChatIdRef.current === payload.chatId) {
          handleSelectChat(payload.chatId)
        }
      }
    })
  }, [])

  // Fetch installed skills list
  const refreshSkillsList = async (wsPath?: string) => {
    const pathToCheck = wsPath || workspace
    if (!pathToCheck) return
    try {
      const list = await window.copilot.listSkills()
      setInstalledSkills(list)
    } catch (err) {
      console.error('Failed to load skills list:', err)
    }
  }

  // Handle Select Workspace and Initialize Agent
  const handleLoadWorkspace = async (
    explicitFolder?: string,
    explicitApiKey?: string,
    explicitModelId?: string,
    explicitMcpCmd?: string,
    explicitMcpArgs?: string
  ) => {
    let folder = explicitFolder
    if (!folder) {
      try {
        const selected = await window.copilot.selectWorkspace()
        if (selected) {
          folder = selected
        } else {
          return // User cancelled directory selection
        }
      } catch (err: any) {
        setInitError('Failed to launch folder picker: ' + err.message)
        return
      }
    }

    setIsInitializing(true)
    setInitError(null)

    const keyToUse = explicitApiKey !== undefined ? explicitApiKey : apiKey
    const modelToUse = explicitModelId !== undefined ? explicitModelId : modelId
    const cmdToUse = explicitMcpCmd !== undefined ? explicitMcpCmd : mcpCommand
    const argsToUse = explicitMcpArgs !== undefined ? explicitMcpArgs : mcpArgs

    try {
      const res = await window.copilot.initAgent({
        workspace: folder,
        apiKey: keyToUse,
        modelId: modelToUse,
        mcpCommand: cmdToUse,
        mcpArgs: argsToUse
      })
      if (res.success) {
        setWorkspace(folder)
        localStorage.setItem('workspace_path', folder)
        loadWorkspaceChats(folder)
        loadScheduledTasks(folder)
        refreshSkillsList(folder)
      } else {
        setInitError(res.error || 'Failed to initialize agent.')
      }
    } catch (err: any) {
      setInitError('Initialization error: ' + err.message)
    } finally {
      setIsInitializing(false)
    }
  }

  // Load Scheduled Tasks from DB
  const loadScheduledTasks = async (wsPath: string) => {
    if (!wsPath) return
    try {
      const tasks = await window.copilot.getScheduledTasks(wsPath)
      setScheduledTasks(tasks)
    } catch (err) {
      console.error('Failed to load scheduled tasks:', err)
    }
  }

  const handleCreateScheduledTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCronPrompt.trim() || !workspace) return
    try {
      const taskId = 'task-cron-' + Date.now()
      const res = await window.copilot.createScheduledTask({
        id: taskId,
        workspace,
        prompt: newCronPrompt.trim(),
        cronExpression: newCronInterval,
        status: 'active'
      })
      if (res.success) {
        setNewCronPrompt('')
        loadScheduledTasks(workspace)
      } else {
        console.error('Failed to create scheduled task:', res.error)
      }
    } catch (err) {
      console.error('Failed to create scheduled task:', err)
    }
  }

  const handleToggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    try {
      const res = await window.copilot.updateScheduledTaskStatus({ id: taskId, status: newStatus })
      if (res.success) {
        loadScheduledTasks(workspace)
      }
    } catch (err) {
      console.error('Failed to toggle scheduled task status:', err)
    }
  }

  const handleDeleteScheduledTask = async (taskId: string) => {
    try {
      const res = await window.copilot.deleteScheduledTask(taskId)
      if (res.success) {
        loadScheduledTasks(workspace)
      }
    } catch (err) {
      console.error('Failed to delete scheduled task:', err)
    }
  }

  // Install Skill from URL
  const handleInstallSkill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!skillUrlInput.trim() || !workspace) return

    setIsInstallingSkill(true)
    setSkillInstallError(null)
    setSkillInstallSuccess(null)

    try {
      const res = await window.copilot.installSkill(skillUrlInput.trim())
      if (res.success) {
        setSkillInstallSuccess(`Successfully installed skill: ${res.name}`)
        setSkillUrlInput('')
        refreshSkillsList()
      } else {
        setSkillInstallError(res.error || 'Failed to install skill')
      }
    } catch (err: any) {
      setSkillInstallError(err.message)
    } finally {
      setIsInstallingSkill(false)
    }
  }

  // SQLite persistence helper functions
  const loadWorkspaceChats = async (wsPath: string) => {
    if (!wsPath) return
    try {
      const list = await window.copilot.getChats(wsPath)
      setChats(list)

      if (list.length > 0) {
        handleSelectChat(list[0].id)
      } else {
        // Start a brand new session with welcome message
        handleNewChat()
        setMessages([
          {
            id: 'init-message-' + Date.now(),
            sender: 'assistant',
            text: `Hello! I am now successfully initialized in your workspace:\n\`${wsPath}\`\n\nI operate fully autonomously within this directory. I can search the web, download skills from URLs, run bash commands, and edit files without requiring permission checks. What coding task would you like me to tackle today?`,
            timestamp: new Date()
          }
        ])
      }
    } catch (err) {
      console.error('Failed to load workspace chats:', err)
    }
  }

  const handleNewChat = () => {
    setActiveChatId(null)
    activeChatIdRef.current = null
    setMessages([])
    setStreamingText('')
    setPlanningMode(false)
    setPlanningStep(0)
  }

  const startPlanning = () => {
    handleNewChat()
    setPlanningMode(true)
    setPlanningStep(1)
    setMessages([
      {
        id: 'init-plan-' + Date.now(),
        sender: 'assistant',
        text: "Let's plan your project! First, what framework are you building with? (e.g. Next.js, React Native, Flutter, Python CLI, etc.)",
        timestamp: new Date()
      }
    ])
  }

  const handleSelectChat = async (chatId: string) => {
    if (isAgentWorking) return
    setActiveChatId(chatId)
    activeChatIdRef.current = chatId
    try {
      const dbMessages = await window.copilot.loadMessages(chatId)
      setMessages(
        dbMessages.map((m: any) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          timestamp: new Date(m.timestamp)
        }))
      )
    } catch (err) {
      console.error('Failed to load chat messages:', err)
    }
  }

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    if (isAgentWorking) return
    try {
      await window.copilot.deleteChat(chatId)
      if (activeChatIdRef.current === chatId) {
        handleNewChat()
      }
      const list = await window.copilot.getChats(workspace)
      setChats(list)
    } catch (err) {
      console.error('Failed to delete chat:', err)
    }
  }

  // Send prompt to Agent
  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputPrompt.trim() || isAgentWorking || !workspace) return

    const promptText = inputPrompt
    setInputPrompt('')

    if (planningMode) {
      const userMsgId = 'user-' + Date.now()
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, sender: 'user', text: promptText, timestamp: new Date() }
      ])

      if (planningStep === 1) {
        setPlanningData((prev) => ({ ...prev, framework: promptText }))
        setPlanningStep(2)
        const sysMsgId = 'assistant-' + Date.now()
        setMessages((prev) => [
          ...prev,
          {
            id: sysMsgId,
            sender: 'assistant',
            text: 'Great. Now please provide the details and specifications for your project.',
            timestamp: new Date()
          }
        ])
      } else if (planningStep === 2) {
        setPlanningData((prev) => ({ ...prev, details: promptText }))

        // Generate plan
        setPlanningMode(false)
        setPlanningStep(0)

        try {
          setIsAgentWorking(true)
          const res = await window.copilot.createProjectPlan({
            workspace,
            framework: planningData.framework || 'General',
            details: promptText
          })
          if (res.success) {
            setMessages((prev) => [
              ...prev,
              {
                id: 'sys-' + Date.now(),
                sender: 'assistant',
                text: 'Project Spec generated successfully in `AGENTS.md`. I am now ready to begin development based on this spec. What should we tackle first?',
                timestamp: new Date()
              }
            ])
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: 'sys-' + Date.now(),
                sender: 'assistant',
                text: `Failed to generate AGENTS.md: ${res.error}`,
                timestamp: new Date()
              }
            ])
          }
        } catch (err: any) {
          setMessages((prev) => [
            ...prev,
            {
              id: 'sys-' + Date.now(),
              sender: 'assistant',
              text: `Failed to generate AGENTS.md: ${err.message}`,
              timestamp: new Date()
            }
          ])
        } finally {
          setIsAgentWorking(false)
        }
      }
      return
    }

    let chatId = activeChatId
    const isNewChat = !chatId

    if (isNewChat) {
      chatId = 'chat-' + Date.now()
      setActiveChatId(chatId)
      activeChatIdRef.current = chatId

      // Save chat entry in SQLite using first query as title
      const title = promptText.slice(0, 30) + (promptText.length > 30 ? '...' : '')
      await window.copilot.createChat({ id: chatId, title, workspace })

      // Refresh chats list
      const list = await window.copilot.getChats(workspace)
      setChats(list)
    }

    const userMsgId = 'user-' + Date.now()
    // Save user message to SQLite
    await window.copilot.addMessage({
      id: userMsgId,
      chatId: chatId as string,
      sender: 'user',
      text: promptText
    })

    // Append user message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: promptText,
        timestamp: new Date()
      }
    ])

    setIsAgentWorking(true)

    try {
      await window.copilot.sendPrompt(promptText)
    } catch (err: any) {
      const errMsgId = 'error-' + Date.now()
      await window.copilot.addMessage({
        id: errMsgId,
        chatId: chatId as string,
        sender: 'assistant',
        text: `⚠️ **Error executing prompt**: ${err.message}`
      })
      setMessages((prev) => [
        ...prev,
        {
          id: errMsgId,
          sender: 'assistant',
          text: `⚠️ **Error executing prompt**: ${err.message}`,
          timestamp: new Date()
        }
      ])
      setIsAgentWorking(false)
    }
  }

  // Handle Stop/Abort Agent execution
  const handleAbortAgent = async () => {
    try {
      await window.copilot.abortAgent()
    } catch (err: any) {
      console.error('Failed to abort agent:', err)
    }
  }

  // Handle text input changes (for slash commands)
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInputPrompt(val)

    if (val.startsWith('/')) {
      setShowSlashCommands(true)
      setSlashCommandFilter(val.substring(1).toLowerCase())
      setSelectedSlashCommandIndex(0)
    } else {
      setShowSlashCommands(false)
    }
  }

  // Handle keys
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashCommands) {
      const filteredCommands = slashCommands.filter((c) =>
        c.name.toLowerCase().includes(slashCommandFilter)
      )
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSlashCommandIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSlashCommandIndex((prev) => Math.max(prev - 1, 0))
        return
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filteredCommands.length > 0) {
          const selected = filteredCommands[selectedSlashCommandIndex]
          setInputPrompt(`/${selected.name} `)
          setShowSlashCommands(false)
        }
        return
      } else if (e.key === 'Escape') {
        setShowSlashCommands(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendPrompt(e)
    }
  }

  // Reset Session
  const handleResetSession = () => {
    setViewState('setup')
    setWorkspace('')
    setMessages([])
    setInstalledSkills([])
    setStreamingText('')
    setIsAgentWorking(false)
    setActiveTool(null)
    setActiveToolArgs(null)
    setSkillInstallSuccess(null)
    setSkillInstallError(null)
    localStorage.removeItem('openai_api_key')
  }

  // Quick prompt templates
  const quickPrompts = [
    {
      label: 'Search & Create Web App',
      text: 'Search the web for the latest responsive Tailwind portfolio designs. Then build a responsive premium single page react app based on that.'
    },
    {
      label: 'Build React Native App',
      text: 'Initialize a new Expo React Native project and build a complete app based on our AGENTS.md spec.'
    },
    {
      label: 'Build Flutter App',
      text: 'Initialize a new Flutter project and build a complete app based on our AGENTS.md spec.'
    },
    {
      label: 'Build Next.js App',
      text: 'Initialize a new Next.js project and build a complete web app based on our AGENTS.md spec.'
    },
    {
      label: 'Check File Syntax',
      text: 'Find all TypeScript files, identify any syntax bugs, and surgically edit files to resolve errors.'
    }
  ]

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black font-sans text-zinc-100 antialiased">
      <div className="flex w-full h-full overflow-hidden bg-black">
        {/* Left panel: Live activity log and info */}
        <aside className="w-80 shrink-0 border-r border-zinc-900 bg-black flex flex-col h-full z-10 shadow-2xl">
          {/* Header info */}
          <div className="p-5 border-b border-zinc-900/60 bg-black/40">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-zinc-800 to-zinc-950 border border-zinc-700 flex items-center justify-center shadow-lg">
                <Sparkles size={20} className="text-white animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-white">Pi Copilot</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${workspace ? 'bg-green-500 animate-ping' : 'bg-amber-500 animate-pulse'}`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${workspace ? 'text-green-400' : 'text-amber-400'}`}
                  >
                    {workspace ? 'Workspace Loaded' : 'No Project Folder'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status details inside dashboard pill */}
            <div className="space-y-2.5 mt-5 font-mono text-[11px] text-zinc-400">
              <div className="flex items-center justify-between p-3 bg-black rounded-xl border border-zinc-800/80 hover:border-zinc-750 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Cpu size={14} className="text-zinc-400 shrink-0" />
                  <span className="truncate">GPT-4o-Mini</span>
                </div>
                <button
                  onClick={() => setShowSettings(true)}
                  title="Configure Copilot Settings"
                  className="p-1 text-zinc-500 hover:text-white transition-colors"
                >
                  <Settings size={12} />
                </button>
              </div>

              <div className="flex flex-col gap-1.5 p-3 bg-black rounded-xl border border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder size={14} className="text-zinc-400 shrink-0" />
                    <span className="text-zinc-300 font-semibold truncate">Active Workspace</span>
                  </div>
                  {workspace && (
                    <button
                      onClick={() => handleLoadWorkspace()}
                      className="text-[10px] text-zinc-400 hover:text-white transition-colors font-bold uppercase"
                    >
                      Switch
                    </button>
                  )}
                </div>
                {workspace ? (
                  <span className="text-[10px] text-zinc-500 truncate block pl-5" title={workspace}>
                    {workspace}
                  </span>
                ) : (
                  <button
                    onClick={() => handleLoadWorkspace()}
                    className="mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-lg text-zinc-300 font-bold font-sans text-[10px] w-full text-left transition-all"
                  >
                    <FolderOpen size={10} />
                    Open Workspace Folder
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Skills manager section */}
          {workspace && (
            <div className="px-5 py-4 border-b border-zinc-900/60 bg-black/20">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2 font-mono">
                <Code size={14} />
                Installed Skills
              </h3>

              {/* Scrollable list of folders inside .agents/skills */}
              <div className="max-h-24 overflow-y-auto mb-3 space-y-1.5 pr-1 custom-scroll">
                {installedSkills.length === 0 ? (
                  <p className="text-[10px] text-zinc-650 italic">No custom skills loaded.</p>
                ) : (
                  installedSkills.map((skill, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2.5 py-1 bg-black rounded-lg border border-zinc-800/80 text-[10px] text-zinc-300 font-mono truncate"
                    >
                      <BookOpen size={10} className="text-zinc-400 shrink-0" />
                      <span className="truncate">{skill}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Form to install skill */}
              <form onSubmit={handleInstallSkill} className="space-y-1.5">
                <div className="relative flex items-center">
                  <Plus size={10} className="absolute left-2.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Skill Git Repository URL..."
                    value={skillUrlInput}
                    onChange={(e) => setSkillUrlInput(e.target.value)}
                    disabled={isInstallingSkill}
                    className="w-full pl-7 pr-2 py-1.5 bg-black rounded-lg text-[9px] text-zinc-200 placeholder-zinc-700 focus:outline-none border border-zinc-800/60 focus:border-zinc-500 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isInstallingSkill || !skillUrlInput.trim()}
                  className="w-full flex items-center justify-center gap-1 py-1.5 px-2 bg-black hover:bg-zinc-950 border border-zinc-800/80 rounded-lg text-[9px] font-bold text-zinc-300 disabled:opacity-40 transition-all hover:text-white"
                >
                  {isInstallingSkill ? (
                    <>
                      <Loader2 size={8} className="animate-spin text-zinc-450" />
                      <span>Cloning skill...</span>
                    </>
                  ) : (
                    <>
                      <Download size={8} />
                      <span>Download & Install Skill</span>
                    </>
                  )}
                </button>
              </form>

              {skillInstallSuccess && (
                <p className="mt-2 text-[9px] text-green-400 font-semibold font-mono text-center truncate">
                  {skillInstallSuccess}
                </p>
              )}
              {skillInstallError && (
                <p className="mt-2 text-[9px] text-red-400 leading-normal font-mono break-all">
                  {skillInstallError}
                </p>
              )}
            </div>
          )}

          {/* Conversations History List */}
          <div className="flex-1 overflow-y-auto p-5 custom-scroll bg-black/20 flex flex-col">
            <div className="flex items-center justify-between mb-5 border-b border-zinc-900 pb-3">
              <h3 className="text-xs font-bold text-zinc-150 uppercase tracking-wider flex items-center gap-2 font-mono">
                <BookOpen size={14} className="text-zinc-400" />
                Conversations
              </h3>
              {workspace && (
                <button
                  onClick={handleNewChat}
                  className="px-2 py-1 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                  title="Start new conversation"
                >
                  <Plus size={10} />
                  New
                </button>
              )}
            </div>

            {!workspace ? (
              <div className="h-32 flex flex-col items-center justify-center text-center p-5 border border-dashed border-zinc-900 rounded-2xl bg-black">
                <BookOpen size={20} className="text-zinc-800 mb-2" />
                <p className="text-[10px] text-zinc-650 max-w-[150px] leading-relaxed">
                  Connect a workspace to load conversation history.
                </p>
              </div>
            ) : chats.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center text-center p-5 border border-dashed border-zinc-900 rounded-2xl bg-black">
                <BookOpen size={20} className="text-zinc-800 mb-2" />
                <p className="text-[10px] text-zinc-650 max-w-[150px] leading-relaxed mb-3">
                  No conversations saved yet. Send a prompt to save your first chat.
                </p>
                <button
                  onClick={startPlanning}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg"
                >
                  Plan Project
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 flex-1 pr-1 custom-scroll max-h-[calc(100vh-340px)] overflow-y-auto">
                {chats.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectChat(c.id)}
                    className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      activeChatId === c.id
                        ? 'bg-zinc-900 text-white border-zinc-700 shadow-md'
                        : 'bg-black text-zinc-400 border-zinc-900 hover:border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate flex-1 pr-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeChatId === c.id ? 'bg-white' : 'bg-zinc-700'}`}
                      />
                      <span className="text-[11px] font-semibold truncate leading-none">
                        {c.title}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteChat(e, c.id)}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-550 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar Footer settings / reset */}
          <div className="p-5 border-t border-zinc-900 bg-black/40 flex flex-col gap-2">
            {workspace && (
              <button
                type="button"
                onClick={() => setShowScheduler(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-black hover:bg-zinc-950 text-xs font-semibold text-zinc-400 hover:text-white transition-all active:scale-[0.98] shadow-inner cursor-pointer"
              >
                <Clock size={14} />
                Scheduled Tasks
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-black hover:bg-zinc-950 text-xs font-semibold text-zinc-400 hover:text-white transition-all active:scale-[0.98] shadow-inner cursor-pointer"
            >
              <Settings size={14} />
              Open Settings
            </button>
            <button
              type="button"
              onClick={handleResetSession}
              className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-xl border border-zinc-900/60 hover:border-zinc-800 bg-black hover:bg-zinc-950 text-xs font-semibold text-zinc-500 hover:text-zinc-350 transition-all active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw size={14} />
              Reset Copilot Session
            </button>
          </div>
        </aside>

        {/* Right panel: Chat log */}
        <main className="flex-1 flex flex-col h-full bg-black grid-bg relative">
          <div className="absolute inset-0 spotlight pointer-events-none" />

          <header className="h-16 border-b border-zinc-900 bg-black px-8 flex items-center justify-between z-10 relative">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-bold tracking-widest uppercase font-mono">
                Status:
              </span>
              {!workspace ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black text-zinc-400 border border-zinc-800/80 text-xs font-semibold font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                  <span>Awaiting Workspace Directory</span>
                </div>
              ) : isAgentWorking ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-950/40 text-zinc-300 border border-zinc-800 text-xs font-semibold font-mono shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span>Agent is working autonomous...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black text-zinc-300 border border-zinc-800/80 text-xs font-semibold font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
                  <span>Idle & Standby</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {workspace && (
                <button
                  type="button"
                  onClick={() => setShowScheduler(true)}
                  className="p-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-white transition-all active:scale-[0.96] flex items-center justify-center cursor-pointer"
                  title="Scheduled Tasks (Crons)"
                >
                  <Clock size={16} />
                </button>
              )}
              {workspace && (
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="p-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-white transition-all active:scale-[0.96] flex items-center justify-center cursor-pointer"
                  title="Configure API Keys"
                >
                  <Settings size={16} />
                </button>
              )}
              {workspace && isAgentWorking && (
                <button
                  type="button"
                  onClick={handleAbortAgent}
                  className="flex items-center gap-2 px-4 py-2 bg-red-950/30 hover:bg-red-900/20 text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-xl text-xs font-bold font-mono tracking-widest transition-all duration-300 shadow-lg active:scale-[0.98] select-none cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500 animate-pulse shrink-0" />
                  <span>STOP AGENT</span>
                </button>
              )}
            </div>
          </header>

          {/* Conversation Messages / Workspace Picker Splash */}
          {!workspace ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center z-10 relative overflow-y-auto">
              <div className="max-w-xl p-10 rounded-3xl premium-card bg-black border border-zinc-900/80 shadow-2xl flex flex-col items-center animate-float">
                <div className="flex items-center justify-center w-20 h-20 mb-6 rounded-2xl bg-gradient-to-tr from-zinc-800 to-zinc-950 border border-zinc-700 shadow-xl relative group">
                  <div className="absolute -inset-1.5 rounded-2xl bg-zinc-700/30 blur opacity-75 animate-pulse" />
                  <FolderOpen size={40} className="text-white relative z-10" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-450 bg-clip-text text-transparent">
                  Connect a Workspace
                </h2>
                <p className="mt-4 text-zinc-400 text-sm leading-relaxed max-w-sm">
                  Select a project directory to grant the agent autonomous workspace access. It will
                  read, write, edit, search, and run scripts in this folder natively.
                </p>

                <button
                  onClick={() => handleLoadWorkspace()}
                  disabled={isInitializing}
                  className="mt-8 flex items-center justify-center gap-2 px-8 py-4 bg-white hover:bg-zinc-200 text-black rounded-2xl font-bold transition-all hover:shadow-xl active:scale-[0.98] cursor-pointer"
                >
                  {isInitializing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Initializing Agent...</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen size={18} />
                      <span>Choose Workspace Folder</span>
                    </>
                  )}
                </button>

                {initError && (
                  <div className="mt-6 flex items-start gap-3 p-4 rounded-xl border border-red-500/20 bg-red-950/20 text-red-300 text-xs leading-relaxed max-w-sm text-left">
                    <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
                    <span>{initError}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 space-y-6 z-10 relative">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 max-w-4xl ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  {/* Sender Avatar */}
                  <div
                    className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center shadow-lg relative ${
                      msg.sender === 'user'
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                        : 'bg-black text-zinc-200 border border-zinc-800/80'
                    }`}
                  >
                    {msg.sender === 'user' ? <User size={18} /> : <Bot size={18} />}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`flex flex-col gap-2 max-w-[85%] rounded-3xl px-6 py-4 shadow-xl border leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-zinc-900/50 text-zinc-100 border-zinc-800/80 rounded-tr-none'
                        : 'bg-[#08080a] text-zinc-100 border-zinc-800/80 rounded-tl-none'
                    }`}
                  >
                    <div
                      className={`prose prose-invert max-w-none text-[14px] sm:text-[15px] space-y-2 ${msg.sender === 'user' ? 'text-zinc-100' : 'text-zinc-100'}`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers}>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                    {msg.timestamp && (
                      <span className="text-[10px] text-zinc-500 mt-2 block self-end select-none font-mono">
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming Assistant message */}
              {streamingText && (
                <div className="flex gap-4 max-w-4xl animate-pulse">
                  <div className="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center bg-black text-zinc-200 border border-zinc-800/80 shadow-lg">
                    <Bot size={18} />
                  </div>
                  <div className="flex flex-col gap-2 max-w-[85%] rounded-3xl rounded-tl-none px-6 py-4 bg-[#08080a] text-zinc-100 border border-zinc-800/80 shadow-xl leading-relaxed">
                    <div className="prose prose-invert max-w-none text-zinc-100 text-[14px] sm:text-[15px]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers}>
                        {streamingText}
                      </ReactMarkdown>
                      {/* Streaming cursor blink */}
                      <span className="inline-block w-1.5 h-4 ml-1 bg-zinc-400 animate-pulse align-middle" />
                    </div>
                  </div>
                </div>
              )}

              {/* Active Tool Executing Banner */}
              {activeTool && (
                <div className="flex gap-4 max-w-4xl">
                  <div className="w-10 h-10 shrink-0 opacity-0" /> {/* Spacer */}
                  <div className="flex items-center gap-3.5 px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs font-semibold font-mono animate-pulse w-full max-w-lg shadow-xl">
                    {activeTool === 'web_search' ? (
                      <Globe size={18} className="animate-spin text-zinc-400 shrink-0" />
                    ) : (
                      <Loader2 size={18} className="animate-spin text-zinc-400 shrink-0" />
                    )}
                    <div className="truncate flex-1">
                      <span className="text-zinc-500">Executing autonomous tool:</span>
                      <span className="text-zinc-200 ml-1.5 font-bold uppercase">{activeTool}</span>
                      {activeToolArgs && activeToolArgs.command && (
                        <span className="text-zinc-400 font-normal ml-2 block truncate mt-1 bg-black px-2 py-1 rounded border border-zinc-850 font-mono">
                          $ {activeToolArgs.command}
                        </span>
                      )}
                      {activeToolArgs && activeToolArgs.query && (
                        <span className="text-zinc-400 font-normal ml-2 block truncate mt-1 bg-black px-2 py-1 rounded border border-zinc-850 font-mono">
                          🔍 {activeToolArgs.query}
                        </span>
                      )}
                      {activeToolArgs && activeToolArgs.url && (
                        <span className="text-zinc-400 font-normal ml-2 block truncate mt-1 bg-black px-2 py-1 rounded border border-zinc-850 font-mono">
                          🔗 {activeToolArgs.url}
                        </span>
                      )}
                      {activeToolArgs && activeToolArgs.path && (
                        <span className="text-zinc-500 font-normal ml-2 block truncate mt-1 font-mono">
                          path: {activeToolArgs.path}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}

          {/* Prompt bar command center */}
          <footer className="p-6 border-t border-zinc-900 bg-black z-10 relative">
            {/* Quick Actions Scroll Bar */}
            {!isAgentWorking && workspace && messages.length > 0 && (
              <div className="max-w-3xl mx-auto mb-4 flex gap-2 overflow-x-auto py-1.5 custom-scroll scrollbar-none whitespace-nowrap">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInputPrompt(qp.text)}
                    className="px-3.5 py-1.5 bg-black hover:bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-full text-[11px] font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap active:scale-[0.98] shadow-sm hover:shadow-zinc-950/20"
                  >
                    <Zap size={11} className="text-zinc-400 animate-pulse" />
                    {qp.label}
                  </button>
                ))}
              </div>
            )}

            {/* Slash commands autocomplete popup */}
            {showSlashCommands &&
              slashCommands.filter((c) => c.name.toLowerCase().includes(slashCommandFilter))
                .length > 0 && (
                <div className="max-w-3xl mx-auto mb-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                  {slashCommands
                    .filter((c) => c.name.toLowerCase().includes(slashCommandFilter))
                    .map((cmd, idx) => (
                      <div
                        key={cmd.name}
                        className={`px-4 py-2 flex flex-col cursor-pointer transition-colors ${idx === selectedSlashCommandIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'}`}
                        onClick={() => {
                          setInputPrompt(`/${cmd.name} `)
                          setShowSlashCommands(false)
                        }}
                      >
                        <span className="text-zinc-200 text-sm font-bold font-mono">
                          /{cmd.name}
                        </span>
                        <span className="text-zinc-500 text-xs">{cmd.description}</span>
                      </div>
                    ))}
                </div>
              )}

            {/* Floating Prompt Input Capsule */}
            {workspace && (
              <form
                onSubmit={handleSendPrompt}
                className="relative max-w-3xl mx-auto flex items-end gap-3 bg-[#08080a] border border-zinc-800 focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-800 rounded-2xl p-2.5 transition-all shadow-2xl backdrop-blur-md"
              >
                <textarea
                  value={inputPrompt}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isAgentWorking
                      ? 'Autonomous copilot execution in progress... please wait...'
                      : 'Request Copilot to search the web, install skills, write features, or edit files...'
                  }
                  disabled={isAgentWorking}
                  rows={2}
                  className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-zinc-200 text-sm placeholder-zinc-500 resize-none px-3 py-1.5 leading-relaxed max-h-40 min-h-[40px] focus:outline-offset-0 disabled:opacity-40 disabled:cursor-not-allowed font-sans"
                />

                {isAgentWorking ? (
                  <button
                    type="button"
                    onClick={handleAbortAgent}
                    className="p-3 rounded-xl bg-red-950/30 hover:bg-red-900/20 text-white transition-all shrink-0 active:scale-[0.96] flex items-center justify-center cursor-pointer"
                    title="Stop Agent Execution"
                  >
                    <span className="w-3.5 h-3.5 bg-white rounded-sm shrink-0" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputPrompt.trim()}
                    className="p-3 rounded-xl bg-white hover:bg-zinc-200 text-black disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 active:scale-[0.96] cursor-pointer"
                    title="Send autonomous prompt"
                  >
                    <Send size={16} />
                  </button>
                )}
              </form>
            )}
          </footer>
        </main>
      </div>

      {/* Settings Modal overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all duration-300">
          <div className="relative w-full max-w-md p-8 rounded-3xl bg-[#08080a] border border-zinc-800 shadow-2xl flex flex-col animate-float">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-900">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings size={20} className="text-zinc-400 animate-spin-slow" />
                Settings
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
              >
                <Plus className="rotate-45" size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono">
                  AI Model
                </label>
                <div className="relative flex items-center mb-4">
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="w-full px-4 py-3 bg-black rounded-xl text-zinc-200 focus:outline-none border border-zinc-800 focus:border-zinc-500 font-mono text-sm shadow-inner cursor-pointer"
                  >
                    <option value="">Default (GPT-4o-mini)</option>
                    {availableModels.map((m) => (
                      <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                        {m.name} ({m.provider})
                      </option>
                    ))}
                  </select>
                </div>

                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono">
                  Provider API Key
                </label>
                <div className="relative flex items-center mb-4">
                  <Key size={16} className="absolute left-3.5 text-zinc-500" />
                  <input
                    type="password"
                    placeholder={apiKey ? '••••••••••••••••' : 'sk-proj-...'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-black rounded-xl text-zinc-200 placeholder-zinc-700 focus:outline-none border border-zinc-800 focus:border-zinc-500 font-mono text-sm shadow-inner"
                  />
                </div>

                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono">
                  MCP Server
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Command (e.g. npx)"
                    value={mcpCommand}
                    onChange={(e) => setMcpCommand(e.target.value)}
                    className="w-1/3 px-4 py-3 bg-black rounded-xl text-zinc-200 placeholder-zinc-700 focus:outline-none border border-zinc-800 focus:border-zinc-500 font-mono text-sm shadow-inner"
                  />
                  <input
                    type="text"
                    placeholder="Args (e.g. -y @modelcontextprotocol/server-sqlite)"
                    value={mcpArgs}
                    onChange={(e) => setMcpArgs(e.target.value)}
                    className="w-2/3 px-4 py-3 bg-black rounded-xl text-zinc-200 placeholder-zinc-700 focus:outline-none border border-zinc-800 focus:border-zinc-500 font-mono text-sm shadow-inner"
                  />
                </div>
                <p className="mt-2 text-[10px] text-zinc-500 leading-normal">
                  Configure your Model, API key and optional MCP server.
                </p>
              </div>

              {workspace && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono">
                    Connected Project
                  </label>
                  <div className="p-3.5 bg-black rounded-xl border border-zinc-900 text-xs font-mono text-zinc-400 break-all select-all leading-normal">
                    {workspace}
                  </div>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 font-bold rounded-xl text-sm border border-zinc-800 transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  localStorage.setItem('openai_api_key', apiKey.trim())
                  localStorage.setItem('selected_model_id', modelId)
                  localStorage.setItem('mcp_command', mcpCommand.trim())
                  localStorage.setItem('mcp_args', mcpArgs.trim())
                  setShowSettings(false)
                  // Re-initialize agent with new key
                  if (workspace) {
                    setIsInitializing(true)
                    try {
                      const res = await window.copilot.initAgent({
                        workspace,
                        apiKey: apiKey.trim(),
                        modelId,
                        mcpCommand: mcpCommand.trim(),
                        mcpArgs: mcpArgs.trim()
                      })
                      if (res.success) {
                        console.log('Agent successfully re-initialized with new settings!')
                        // Refresh installed skills
                        refreshSkillsList(workspace)
                      }
                    } catch (err) {
                      console.error('Failed to re-initialize agent:', err)
                    } finally {
                      setIsInitializing(false)
                    }
                  }
                }}
                className="flex-1 py-3 bg-white hover:bg-zinc-200 text-black font-bold rounded-xl text-sm transition-all cursor-pointer"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduler Modal overlay */}
      {showScheduler && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all duration-300">
          <div className="relative w-full max-w-2xl p-8 rounded-3xl bg-[#08080a] border border-zinc-800 shadow-2xl flex flex-col max-h-[90vh] animate-float">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-900">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-zinc-400 animate-pulse" />
                <div>
                  <h3 className="text-lg font-bold text-white leading-none">
                    Scheduled Tasks (Crons)
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-1.5 font-sans">
                    Automate background agent executions on recurring schedules.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowScheduler(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
              >
                <Plus className="rotate-45" size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scroll">
              {/* Create Task Form */}
              <form
                onSubmit={handleCreateScheduledTask}
                className="p-5 bg-black rounded-2xl border border-zinc-900 space-y-4"
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                  <Plus size={12} />
                  Schedule New Prompt
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1.5 font-mono">
                      Prompt Message
                    </label>
                    <textarea
                      placeholder="e.g. Audit files for syntax bugs and surgically resolve them."
                      value={newCronPrompt}
                      onChange={(e) => setNewCronPrompt(e.target.value)}
                      rows={2}
                      required
                      className="w-full px-4 py-3 bg-[#08080a] rounded-xl text-zinc-200 placeholder-zinc-700 focus:outline-none border border-zinc-800 focus:border-zinc-500 font-sans text-sm resize-none"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1.5 font-mono">
                        Recurring Interval
                      </label>
                      <select
                        value={newCronInterval}
                        onChange={(e) => setNewCronInterval(e.target.value)}
                        className="w-full px-4 py-3 bg-[#08080a] rounded-xl text-zinc-200 focus:outline-none border border-zinc-800 focus:border-zinc-500 font-sans text-sm cursor-pointer"
                      >
                        <option value="Every Minute">Every Minute</option>
                        <option value="Every 5 Minutes">Every 5 Minutes</option>
                        <option value="Every Hour">Every Hour</option>
                        <option value="Every Day">Every Day</option>
                        <option value="Every Week">Every Week</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={!newCronPrompt.trim()}
                        className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-zinc-200 text-black font-bold rounded-xl text-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus size={16} />
                        Add Cron Task
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Active Workspace Crons List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                  <Calendar size={12} />
                  Active Workspace Crons ({scheduledTasks.length})
                </h4>

                {scheduledTasks.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-zinc-900 rounded-2xl bg-black">
                    <Clock size={24} className="text-zinc-850 mx-auto mb-2" />
                    <p className="text-xs text-zinc-650 font-sans">
                      No recurring crons scheduled for this workspace.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scheduledTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-4 bg-black rounded-2xl border border-zinc-900 hover:border-zinc-800 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-semibold text-zinc-100 font-sans line-clamp-2"
                            title={task.prompt}
                          >
                            {task.prompt}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] font-mono text-zinc-500">
                            <span className="flex items-center gap-1 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900 text-zinc-400">
                              <Clock size={10} />
                              {task.cron_expression}
                            </span>
                            <span>
                              Last run:{' '}
                              {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleToggleTaskStatus(task.id, task.status)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                              task.status === 'active'
                                ? 'bg-zinc-900 text-white border-zinc-700 hover:bg-zinc-800'
                                : 'bg-black text-zinc-500 border-zinc-900 hover:border-zinc-800'
                            }`}
                            title={
                              task.status === 'active' ? 'Pause Cron Task' : 'Activate Cron Task'
                            }
                          >
                            {task.status === 'active' ? (
                              <>
                                <Play size={12} className="text-green-400 fill-green-400" />
                                <span>Active</span>
                              </>
                            ) : (
                              <>
                                <Pause size={12} className="text-zinc-650" />
                                <span>Paused</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteScheduledTask(task.id)}
                            className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 text-zinc-500 hover:text-red-400 transition-all cursor-pointer"
                            title="Delete Cron Task"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-zinc-900 flex justify-end">
              <button
                onClick={() => setShowScheduler(false)}
                className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 font-bold rounded-xl text-xs border border-zinc-800 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
