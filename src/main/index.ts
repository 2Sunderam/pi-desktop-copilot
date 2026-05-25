import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  SettingsManager,
  DefaultResourceLoader,
  getAgentDir,
  type AgentSession
} from '@earendil-works/pi-coding-agent'
import { getModel, registerBuiltInApiProviders } from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import * as fs from 'fs'
import { exec } from 'child_process'

import { DatabaseSync } from 'node:sqlite'

// Register built-in LLM providers
registerBuiltInApiProviders()

let db: DatabaseSync | null = null
let currentSession: AgentSession | null = null
let currentLoader: DefaultResourceLoader | null = null
let workspaceCwd: string = ''
let userApiKey: string = ''

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

function initDatabase(): void {
  try {
    const dbPath = join(app.getPath('userData'), 'pi_copilot_chats.db')
    db = new DatabaseSync(dbPath)
    
    // Create tables if they do not exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        workspace TEXT,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        sender TEXT,
        text TEXT,
        timestamp INTEGER,
        FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        workspace TEXT,
        prompt TEXT,
        cron_expression TEXT,
        last_run INTEGER,
        status TEXT
      );
    `)
    console.log('SQLite database initialized successfully at:', dbPath)
  } catch (err) {
    console.error('Failed to initialize SQLite database:', err)
  }
}

let schedulerInterval: NodeJS.Timeout | null = null

function startScheduler(): void {
  if (schedulerInterval) return

  schedulerInterval = setInterval(async () => {
    if (!db) return
    try {
      const activeTasks = db.prepare("SELECT * FROM scheduled_tasks WHERE status = 'active'").all() as any[]
      for (const task of activeTasks) {
        const now = Date.now()
        const lastRun = task.last_run || 0
        let isDue = false

        if (task.cron_expression === 'Every Minute') {
          isDue = now - lastRun >= 60 * 1000
        } else if (task.cron_expression === 'Every 5 Minutes') {
          isDue = now - lastRun >= 5 * 60 * 1000
        } else if (task.cron_expression === 'Every Hour') {
          isDue = now - lastRun >= 60 * 60 * 1000
        } else if (task.cron_expression === 'Every Day') {
          isDue = now - lastRun >= 24 * 60 * 60 * 1000
        } else if (task.cron_expression === 'Every Week') {
          isDue = now - lastRun >= 7 * 24 * 60 * 60 * 1000
        }

        if (isDue) {
          console.log(`Scheduler: Task ${task.id} is due. Executing prompt: "${task.prompt}"`)
          db.prepare('UPDATE scheduled_tasks SET last_run = ? WHERE id = ?').run(now, task.id)
          executeScheduledTask(task)
        }
      }
    } catch (err) {
      console.error('Scheduler interval error:', err)
    }
  }, 10 * 1000)
}

async function executeScheduledTask(task: any): Promise<void> {
  try {
    if (!db) return

    if (!currentSession || workspaceCwd !== task.workspace) {
      console.log(`Scheduler: Session not active for workspace: ${task.workspace}. Skipping task.`)
      return
    }

    const chatId = 'chat-scheduled-' + Date.now()
    const title = `Cron: ${task.prompt.slice(0, 20)}${task.prompt.length > 20 ? '...' : ''}`

    db.prepare('INSERT INTO chats (id, title, workspace, created_at) VALUES (?, ?, ?, ?)').run(
      chatId,
      title,
      task.workspace,
      Date.now()
    )

    const userMsgId = 'user-' + Date.now()
    db.prepare('INSERT INTO messages (id, chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?, ?)').run(
      userMsgId,
      chatId,
      'user',
      `[Scheduled Cron Task]\n${task.prompt}`,
      Date.now()
    )

    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.webContents.send('scheduled-task-triggered', { chatId, workspace: task.workspace })
    }

    currentSession.prompt(task.prompt).then(() => {
      if (!currentSession || !db) return

      const sessionMessages = currentSession.messages
      const lastMsg = sessionMessages[sessionMessages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        const assistantMsgId = 'assistant-' + Date.now()
        const text = getTextFromMessage(lastMsg)
        db.prepare('INSERT INTO messages (id, chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?, ?)').run(
          assistantMsgId,
          chatId,
          'assistant',
          text,
          Date.now()
        )
      }

      if (mainWindow) {
        mainWindow.webContents.send('scheduled-task-completed', { chatId, workspace: task.workspace })
      }
    }).catch((err) => {
      console.error('Scheduler: Task execution prompt failed:', err)
      if (!db) return
      const errMsgId = 'error-' + Date.now()
      db.prepare('INSERT INTO messages (id, chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?, ?)').run(
        errMsgId,
        chatId,
        'assistant',
        `⚠️ **Scheduled execution failed**: ${err.message}`,
        Date.now()
      )
      if (mainWindow) {
        mainWindow.webContents.send('scheduled-task-completed', { chatId, workspace: task.workspace })
      }
    })
  } catch (err) {
    console.error('Scheduler: executeScheduledTask failed:', err)
  }
}

// Tool: web_search
const webSearchTool = {
  name: 'web_search',
  label: 'Web Search',
  description: 'Searches the web for the given query and returns top results with titles, snippets, and links. Useful to find recent info or answers to questions.',
  parameters: Type.Object({
    query: Type.String({ description: 'The search query to look up' })
  }),
  execute: async (_toolCallId: string, params: any) => {
    try {
      const query = params.query
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const html = await response.text()
      const results: { title: string; url: string; snippet: string }[] = []
      const blocks = html.split('<div class="result results_links')
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i]
        const titleMatch = block.match(/<a\s+[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/)
        const snippetMatch = block.match(/<a\s+[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
        
        if (titleMatch) {
          let rawUrl = titleMatch[1]
          let title = titleMatch[2].replace(/<[^>]*>/g, '').trim()
          let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : ''

          let actualUrl = rawUrl
          if (rawUrl.includes('uddg=')) {
            const parts = rawUrl.split('uddg=')
            if (parts[1]) {
              const encodedUrl = parts[1].split('&')[0]
              actualUrl = decodeURIComponent(encodedUrl)
            }
          } else if (rawUrl.startsWith('//')) {
            actualUrl = 'https:' + rawUrl
          }

          results.push({ title, url: actualUrl, snippet })
        }
      }

      if (results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No search results found.' }],
          details: { query, count: 0, success: true }
        }
      }

      const formattedResults = results.slice(0, 8).map((res, idx) => {
        return `[${idx + 1}] ${res.title}\nURL: ${res.url}\nSnippet: ${res.snippet}\n`
      }).join('\n')

      return {
        content: [{ type: 'text' as const, text: `Search results for "${query}":\n\n${formattedResults}` }],
        details: { query, count: results.length, success: true }
      }
    } catch (err: any) {
      throw new Error(`Search failed: ${err.message}`)
    }
  }
}

// Tool: install_skill
const installSkillTool = {
  name: 'install_skill',
  label: 'Install Skill',
  description: 'Installs a new skill into the workspace from a Git repository URL (e.g. "https://github.com/username/skill-name").',
  parameters: Type.Object({
    url: Type.String({ description: 'The Git repository URL of the skill to install' })
  }),
  execute: async (_toolCallId: string, params: any) => {
    try {
      const url = params.url.trim()
      if (!url) {
        throw new Error('URL is required')
      }
      
      let skillName = 'downloaded-skill'
      const urlParts = url.replace(/\/$/, '').split('/')
      const lastPart = urlParts[urlParts.length - 1]
      if (lastPart) {
        skillName = lastPart.replace(/\.git$/, '')
      }
      
      const targetDir = resolve(workspaceCwd, '.agents', 'skills', skillName)
      const skillsDir = resolve(workspaceCwd, '.agents', 'skills')
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true })
      }
      
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true })
      }
      
      await new Promise<void>((resolveClone, rejectClone) => {
        exec(`git clone "${url}" "${targetDir}"`, (error, stdout, stderr) => {
          if (error) {
            rejectClone(new Error(stderr || stdout || error.message))
          } else {
            resolveClone()
          }
        })
      })
      
      if (currentLoader) {
        await currentLoader.reload()
      }
      
      return {
        content: [{ type: 'text' as const, text: `Successfully installed skill "${skillName}" into '.agents/skills/${skillName}'` }],
        details: { url, name: skillName, success: true }
      }
    } catch (err: any) {
      throw new Error(`Failed to install skill: ${err.message}`)
    }
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Initialize SQLite database
  initDatabase()
  startScheduler()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC: select-workspace
  ipcMain.handle('select-workspace', async () => {
    const window = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // IPC: init-agent
  ipcMain.handle('init-agent', async (_event, config: { workspace: string; apiKey: string }) => {
    try {
      workspaceCwd = config.workspace
      userApiKey = config.apiKey

      // Dispose existing session if any
      if (currentSession) {
        currentSession.dispose()
        currentSession = null
        currentLoader = null
      }

      // Initialize auth storage and set the API key overrides
      const authStorage = AuthStorage.create()
      if (userApiKey) {
        authStorage.setRuntimeApiKey('openai', userApiKey)
        authStorage.setRuntimeApiKey('anthropic', userApiKey)
      }

      const modelRegistry = ModelRegistry.create(authStorage)

      // Get the GPT-4o-Mini model
      const model = getModel('openai', 'gpt-4o-mini')
      if (!model) {
        throw new Error('GPT-4o-mini model not found')
      }

      // Load settings with overrides suited for desktop copilot TUI
      const settingsManager = SettingsManager.inMemory({
        compaction: { enabled: false }
      })

      // Create a DefaultResourceLoader bound to workspaceCwd
      const loader = new DefaultResourceLoader({
        cwd: workspaceCwd,
        agentDir: getAgentDir(),
        settingsManager
      })
      await loader.reload()
      currentLoader = loader

      // Create agent session with all standard built-in coding tools plus custom web_search and install_skill
      const { session } = await createAgentSession({
        cwd: workspaceCwd,
        agentDir: getAgentDir(),
        model,
        authStorage,
        modelRegistry,
        customTools: [webSearchTool, installSkillTool],
        tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls', 'web_search', 'install_skill'],
        sessionManager: SessionManager.inMemory(),
        settingsManager,
        resourceLoader: loader
      })

      currentSession = session

      // Subscribe and forward events to renderer
      currentSession.subscribe((event) => {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          mainWindow.webContents.send('agent-event', event)
        }
      })

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // IPC: send-prompt
  ipcMain.handle('send-prompt', async (_event, prompt: string) => {
    if (!currentSession) {
      throw new Error('Agent session not initialized')
    }
    await currentSession.prompt(prompt)
  })

  // IPC: abort-agent
  ipcMain.handle('abort-agent', async () => {
    if (currentSession) {
      await currentSession.abort()
      return { success: true }
    }
    return { success: false, error: 'No active session' }
  })

  // IPC: install-skill
  ipcMain.handle('install-skill', async (_event, url: string) => {
    try {
      if (!workspaceCwd) {
        throw new Error('Workspace not initialized')
      }
      const trimmedUrl = url.trim()
      let skillName = 'downloaded-skill'
      const urlParts = trimmedUrl.replace(/\/$/, '').split('/')
      const lastPart = urlParts[urlParts.length - 1]
      if (lastPart) {
        skillName = lastPart.replace(/\.git$/, '')
      }
      
      const targetDir = resolve(workspaceCwd, '.agents', 'skills', skillName)
      const skillsDir = resolve(workspaceCwd, '.agents', 'skills')
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true })
      }
      
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true })
      }
      
      await new Promise<void>((resolveClone, rejectClone) => {
        exec(`git clone "${trimmedUrl}" "${targetDir}"`, (error, stdout, stderr) => {
          if (error) {
            rejectClone(new Error(stderr || stdout || error.message))
          } else {
            resolveClone()
          }
        })
      })

      // Reload resource loader so newly cloned skills are discovered on-the-fly
      if (currentLoader) {
        await currentLoader.reload()
      }
      
      return { success: true, name: skillName }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // IPC: list-skills
  ipcMain.handle('list-skills', async () => {
    try {
      if (!workspaceCwd) {
        return []
      }
      const skillsDir = resolve(workspaceCwd, '.agents', 'skills')
      if (!fs.existsSync(skillsDir)) {
        return []
      }
      const files = fs.readdirSync(skillsDir)
      const skills = files.filter(file => {
        const fullPath = join(skillsDir, file)
        return fs.statSync(fullPath).isDirectory()
      })
      return skills
    } catch (err) {
      console.error('Failed to list skills:', err)
      return []
    }
  })

  // IPC: SQLite Chats API
  ipcMain.handle('get-chats', async (_event, workspace: string) => {
    if (!db) return []
    try {
      const stmt = db.prepare('SELECT * FROM chats WHERE workspace = ? ORDER BY created_at DESC')
      return stmt.all(workspace)
    } catch (err) {
      console.error('Failed to get chats:', err)
      return []
    }
  })

  ipcMain.handle('create-chat', async (_event, chat: { id: string; title: string; workspace: string }) => {
    if (!db) return { success: false, error: 'Database not initialized' }
    try {
      const stmt = db.prepare('INSERT OR REPLACE INTO chats (id, title, workspace, created_at) VALUES (?, ?, ?, ?)')
      stmt.run(chat.id, chat.title, chat.workspace, Date.now())
      return { success: true }
    } catch (err: any) {
      console.error('Failed to create chat:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('add-message', async (_event, msg: { id: string; chatId: string; sender: string; text: string }) => {
    if (!db) return { success: false, error: 'Database not initialized' }
    try {
      const stmt = db.prepare('INSERT INTO messages (id, chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?, ?)')
      stmt.run(msg.id, msg.chatId, msg.sender, msg.text, Date.now())
      return { success: true }
    } catch (err: any) {
      console.error('Failed to add message:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('load-messages', async (_event, chatId: string) => {
    if (!db) return []
    try {
      const stmt = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC')
      return stmt.all(chatId)
    } catch (err) {
      console.error('Failed to load messages:', err)
      return []
    }
  })

  ipcMain.handle('delete-chat', async (_event, chatId: string) => {
    if (!db) return { success: false, error: 'Database not initialized' }
    try {
      const stmt1 = db.prepare('DELETE FROM messages WHERE chat_id = ?')
      stmt1.run(chatId)
      const stmt2 = db.prepare('DELETE FROM chats WHERE id = ?')
      stmt2.run(chatId)
      return { success: true }
    } catch (err: any) {
      console.error('Failed to delete chat:', err)
      return { success: false, error: err.message }
    }
  })

  // IPC: Scheduled Tasks API
  ipcMain.handle('get-scheduled-tasks', async (_event, workspace: string) => {
    if (!db) return []
    try {
      const stmt = db.prepare('SELECT * FROM scheduled_tasks WHERE workspace = ? ORDER BY id DESC')
      return stmt.all(workspace)
    } catch (err) {
      console.error('Failed to get scheduled tasks:', err)
      return []
    }
  })

  ipcMain.handle('create-scheduled-task', async (_event, task: { id: string; workspace: string; prompt: string; cronExpression: string; status: string }) => {
    if (!db) return { success: false, error: 'Database not initialized' }
    try {
      const stmt = db.prepare('INSERT INTO scheduled_tasks (id, workspace, prompt, cron_expression, last_run, status) VALUES (?, ?, ?, ?, 0, ?)')
      stmt.run(task.id, task.workspace, task.prompt, task.cronExpression, task.status)
      return { success: true }
    } catch (err: any) {
      console.error('Failed to create scheduled task:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('update-scheduled-task-status', async (_event, update: { id: string; status: string }) => {
    if (!db) return { success: false, error: 'Database not initialized' }
    try {
      const stmt = db.prepare('UPDATE scheduled_tasks SET status = ? WHERE id = ?')
      stmt.run(update.status, update.id)
      return { success: true }
    } catch (err: any) {
      console.error('Failed to update scheduled task status:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('delete-scheduled-task', async (_event, id: string) => {
    if (!db) return { success: false, error: 'Database not initialized' }
    try {
      const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?')
      stmt.run(id)
      return { success: true }
    } catch (err: any) {
      console.error('Failed to delete scheduled task:', err)
      return { success: false, error: err.message }
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
