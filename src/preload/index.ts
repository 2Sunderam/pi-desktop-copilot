import { contextBridge, ipcRenderer } from 'electron'

// Define the secure bridge object conforming to the specification
const copilotBridge = {
  selectWorkspace: () => ipcRenderer.invoke('select-workspace'),
  initAgent: (config: { workspace: string; apiKey: string }) => ipcRenderer.invoke('init-agent', config),
  sendPrompt: (prompt: string) => ipcRenderer.invoke('send-prompt', prompt),
  listSkills: () => ipcRenderer.invoke('list-skills'),
  installSkill: (url: string) => ipcRenderer.invoke('install-skill', url),
  abortAgent: () => ipcRenderer.invoke('abort-agent'),
  onAgentEvent: (callback: (event: any) => void) => {
    // Remove all existing listeners first to prevent duplicates on React hot reloads
    ipcRenderer.removeAllListeners('agent-event')
    ipcRenderer.on('agent-event', (_event, payload) => callback(payload))
  },
  getChats: (workspace: string) => ipcRenderer.invoke('get-chats', workspace),
  createChat: (chat: { id: string; title: string; workspace: string }) => ipcRenderer.invoke('create-chat', chat),
  addMessage: (msg: { id: string; chatId: string; sender: string; text: string }) => ipcRenderer.invoke('add-message', msg),
  loadMessages: (chatId: string) => ipcRenderer.invoke('load-messages', chatId),
  deleteChat: (chatId: string) => ipcRenderer.invoke('delete-chat', chatId),
  getScheduledTasks: (workspace: string) => ipcRenderer.invoke('get-scheduled-tasks', workspace),
  createScheduledTask: (task: { id: string; workspace: string; prompt: string; cronExpression: string; status: string }) => ipcRenderer.invoke('create-scheduled-task', task),
  updateScheduledTaskStatus: (update: { id: string; status: string }) => ipcRenderer.invoke('update-scheduled-task-status', update),
  deleteScheduledTask: (id: string) => ipcRenderer.invoke('delete-scheduled-task', id),
  onScheduledTaskTriggered: (callback: (payload: any) => void) => {
    ipcRenderer.removeAllListeners('scheduled-task-triggered')
    ipcRenderer.on('scheduled-task-triggered', (_event, payload) => callback(payload))
  },
  onScheduledTaskCompleted: (callback: (payload: any) => void) => {
    ipcRenderer.removeAllListeners('scheduled-task-completed')
    ipcRenderer.on('scheduled-task-completed', (_event, payload) => callback(payload))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('copilot', copilotBridge)
  } catch (error) {
    console.error('Failed to expose copilot bridge:', error)
  }
} else {
  // Fallback for non-isolated context (just in case)
  // @ts-ignore (define in global window type)
  window.copilot = copilotBridge
}
