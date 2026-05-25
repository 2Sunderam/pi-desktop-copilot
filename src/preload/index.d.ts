import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    copilot: {
      selectWorkspace: () => Promise<string | null>
      initAgent: (config: {
        workspace: string
        apiKey: string
        modelId?: string
        mcpCommand?: string
        mcpArgs?: string
      }) => Promise<{ success: boolean; error?: string }>
      sendPrompt: (prompt: string) => Promise<void>
      listModels: () => Promise<{ provider: string; id: string; name: string }[]>
      getCommands: () => Promise<{ name: string; description: string }[]>
      createProjectPlan: (data: {
        workspace: string
        framework: string
        details: string
      }) => Promise<{ success: boolean; error?: string }>
      listSkills: () => Promise<string[]>
      installSkill: (url: string) => Promise<{ success: boolean; name?: string; error?: string }>
      abortAgent: () => Promise<{ success: boolean; error?: string }>
      onAgentEvent: (callback: (event: any) => void) => void
      getChats: (workspace: string) => Promise<any[]>
      createChat: (chat: {
        id: string
        title: string
        workspace: string
      }) => Promise<{ success: boolean; error?: string }>
      addMessage: (msg: {
        id: string
        chatId: string
        sender: string
        text: string
      }) => Promise<{ success: boolean; error?: string }>
      loadMessages: (chatId: string) => Promise<any[]>
      deleteChat: (chatId: string) => Promise<{ success: boolean; error?: string }>
      getScheduledTasks: (workspace: string) => Promise<any[]>
      createScheduledTask: (task: {
        id: string
        workspace: string
        prompt: string
        cronExpression: string
        status: string
      }) => Promise<{ success: boolean; error?: string }>
      updateScheduledTaskStatus: (update: {
        id: string
        status: string
      }) => Promise<{ success: boolean; error?: string }>
      deleteScheduledTask: (id: string) => Promise<{ success: boolean; error?: string }>
      onScheduledTaskTriggered: (callback: (payload: any) => void) => void
      onScheduledTaskCompleted: (callback: (payload: any) => void) => void
    }
  }
}

export {}
