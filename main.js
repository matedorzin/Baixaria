const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const fs = require('fs')
const { fileURLToPath } = require('url')
const { probeMedia } = require('./services/FfprobeService')
const { convert, detectCapabilities } = require('./services/ConversionService')
const { autoUpdater } = require('electron-updater')

let mainWindow

const activeDownload = {
  proc: null,
  state: 'idle',
  action: null
}

const activeConversion = {
  state: 'idle'
}

function getRuntimeContext() {
  return {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appDir: __dirname
  }
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null
}

function getYtDlpPath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'bin', 'yt-dlp.exe'),
        path.join(process.resourcesPath, 'yt-dlp.exe')
      ]
    : [
        path.join(__dirname, 'bin', 'yt-dlp.exe'),
        path.join(__dirname, 'yt-dlp.exe'),
        path.join(__dirname, 'DownloadsYT', 'yt-dlp.exe')
      ]

  return firstExistingPath(candidates)
}

function getFfmpegPath(ytdlpPath) {
  const ytdlpDir = ytdlpPath ? path.dirname(ytdlpPath) : null
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'bin', 'ffmpeg.exe'),
        ytdlpDir && path.join(ytdlpDir, 'ffmpeg.exe')
      ]
    : [
        path.join(__dirname, 'bin', 'ffmpeg.exe'),
        path.join(__dirname, 'DownloadsYT', 'ffmpeg.exe'),
        ytdlpDir && path.join(ytdlpDir, 'ffmpeg.exe')
      ]

  return firstExistingPath(candidates)
}

function getDenoPath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'bin', 'deno.exe'),
        path.join(process.resourcesPath, 'deno.exe')
      ]
    : [
        path.join(__dirname, 'bin', 'deno.exe'),
        path.join(__dirname, 'DownloadsYT', 'deno.exe')
      ]

  return firstExistingPath(candidates)
}

function getYtDlpSpawnOptions(denoPath) {
  const runtimeDirectory = denoPath ? path.dirname(denoPath) : null
  const currentPath = process.env.PATH || process.env.Path || ''

  return {
    windowsHide: true,
    env: {
      ...process.env,
      PATH: runtimeDirectory ? [runtimeDirectory, currentPath].filter(Boolean).join(path.delimiter) : currentPath
    }
  }
}

function getCookiesPath() {
  if (app.isPackaged) {
    return null
  }

  const candidates = [
    path.join(__dirname, 'bin', 'cookies.txt'),
    path.join(__dirname, 'cookies.txt'),
    path.join(__dirname, 'DownloadsYT', 'cookies.txt')
  ]

  return firstExistingPath(candidates)
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()
}

function buildOutputTemplate(outputFolder, safeFilename, playlistMode) {
  if (!playlistMode) {
    const baseName = safeFilename || '%(title)s'
    return path.join(outputFolder, `${baseName}.%(ext)s`)
  }

  if (safeFilename) {
    return path.join(outputFolder, safeFilename, '%(playlist_index,autonumber)s - %(title)s.%(ext)s')
  }

  return path.join(outputFolder, '%(playlist_title,playlist)s', '%(playlist_index,autonumber)s - %(title)s.%(ext)s')
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return ''
  }

  const seconds = Math.floor(totalSeconds % 60)
  const minutes = Math.floor((totalSeconds / 60) % 60)
  const hours = Math.floor(totalSeconds / 3600)

  if (hours > 0) {
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
  }

  return [minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

function compactIndices(indices) {
  const sorted = [...new Set(indices.map(Number).filter(Number.isInteger).filter((value) => value > 0))].sort((a, b) => a - b)
  if (sorted.length === 0) {
    return ''
  }

  const ranges = []
  let start = sorted[0]
  let end = sorted[0]

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    if (current === end + 1) {
      end = current
      continue
    }

    ranges.push(start === end ? `${start}` : `${start}-${end}`)
    start = current
    end = current
  }

  ranges.push(start === end ? `${start}` : `${start}-${end}`)
  return ranges.join(',')
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(channel, payload)
}

function isTrustedRenderer(event) {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    return false
  }

  try {
    const senderPath = path.resolve(fileURLToPath(event.senderFrame.url)).toLowerCase()
    const trustedPath = path.resolve(__dirname, 'index.html').toLowerCase()
    return senderPath === trustedPath
  } catch {
    return false
  }
}

function registerTrustedHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedRenderer(event)) {
      throw new Error('Chamada IPC de uma janela não confiável.')
    }

    return handler(event, ...args)
  })
}

function registerTrustedOn(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedRenderer(event)) {
      return
    }

    handler(event, ...args)
  })
}

function normalizeReleaseNotes(notes) {
  if (typeof notes === 'string') {
    return notes.trim()
  }

  if (Array.isArray(notes)) {
    return notes
      .map((entry) => typeof entry === 'string' ? entry : entry?.note)
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  return ''
}

function isUpdaterAvailable() {
  return app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR
}

function checkForUpdates() {
  if (!isUpdaterAvailable()) {
    return { available: false, message: 'A atualização automática funciona na versão instalada.' }
  }

  try {
    autoUpdater.checkForUpdates().catch(() => {})
    return { success: true }
  } catch {
    return { error: 'Não foi possível iniciar a verificação de atualizações.' }
  }
}

function configureAutoUpdater() {
  if (!isUpdaterAvailable()) {
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('updater-state', { state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('updater-state', {
      state: 'available',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  })

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('updater-state', { state: 'up-to-date', version: app.getVersion() })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater-state', {
      state: 'downloading',
      percent: Math.round(progress.percent || 0)
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('updater-state', {
      state: 'downloaded',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  })

  autoUpdater.on('error', () => {
    sendToRenderer('updater-state', {
      state: 'error',
      message: 'Não foi possível verificar atualizações. Tente novamente quando estiver online.'
    })
  })
}

function sendDownloadProgress(payload) {
  sendToRenderer('download-progress', payload)
}

function sendDownloadState(state, details = {}) {
  activeDownload.state = state
  sendToRenderer('download-state', { state, ...details })
}

function sendConversionProgress(payload) {
  sendToRenderer('conversion-progress', payload)
}

function sendConversionState(state, details = {}) {
  activeConversion.state = state
  sendToRenderer('conversion-state', { state, ...details })
}

function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve()
      return
    }

    const proc = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true
    })

    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}

function ensureDownloadEnvironment(options) {
  const ytdlpPath = getYtDlpPath()
  if (!ytdlpPath) {
    return { error: 'yt-dlp.exe nao foi encontrado em bin/, na raiz do app ou em DownloadsYT/.' }
  }

  const trimmedUrl = String(options.url || '').trim()
  if (!isValidHttpUrl(trimmedUrl)) {
    return { error: 'Informe uma URL valida com http:// ou https://.' }
  }

  const outputFolder = options.folder || path.join(os.homedir(), 'Downloads')
  if (!fs.existsSync(outputFolder)) {
    try {
      fs.mkdirSync(outputFolder, { recursive: true })
    } catch {
      return { error: `Nao foi possivel criar a pasta de destino: ${outputFolder}` }
    }
  }

  const safeFilename = options.filename ? sanitizeFilename(options.filename) : ''
  if (options.filename && !safeFilename) {
    return { error: 'O nome do arquivo ficou vazio apos remover caracteres invalidos.' }
  }

  return {
    ytdlpPath,
    ffmpegPath: getFfmpegPath(ytdlpPath),
    denoPath: getDenoPath(),
    cookiesPath: options.cookiesPath && fs.existsSync(options.cookiesPath) ? options.cookiesPath : getCookiesPath(),
    trimmedUrl,
    outputFolder,
    safeFilename
  }
}

function buildDownloadArgs(options, env) {
  const playlistMode = Boolean(options.playlistMode)
  const outputTemplate = buildOutputTemplate(env.outputFolder, env.safeFilename, playlistMode)
  const commonArgs = ['--newline', playlistMode ? '--yes-playlist' : '--no-playlist']

  if (env.ffmpegPath) {
    commonArgs.push('--ffmpeg-location', env.ffmpegPath)
  }

  if (env.denoPath) {
    commonArgs.push('--js-runtimes', 'deno')
  }

  if (env.cookiesPath) {
    commonArgs.push('--cookies', env.cookiesPath)
  }

  const playlistItems = playlistMode ? compactIndices(options.selectedIndices || []) : ''
  if (playlistItems) {
    commonArgs.push('--playlist-items', playlistItems)
  }

  if (options.format === 'audio') {
    return [
      ...commonArgs,
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      `${options.audioQuality}k`,
      '-o',
      outputTemplate,
      env.trimmedUrl
    ]
  }

  // Prefer the H.264/AAC profile Premiere reads natively. Other streams fall back to ffmpeg recoding below.
  const formatSelector = options.quality === 'best'
    ? 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[acodec^=mp4a][ext=m4a]/best[ext=mp4][vcodec^=avc1][acodec^=mp4a]/bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/bestvideo+bestaudio/best'
    : `bestvideo[height<=${options.quality}][vcodec^=avc1][ext=mp4]+bestaudio[acodec^=mp4a][ext=m4a]/best[height<=${options.quality}][ext=mp4][vcodec^=avc1][acodec^=mp4a]/bestvideo[height<=${options.quality}][ext=webm]+bestaudio[ext=webm]/best[height<=${options.quality}][ext=webm]/bestvideo[height<=${options.quality}]+bestaudio/best[height<=${options.quality}]/best`

  return [
    ...commonArgs,
    '-f',
    formatSelector,
    '--merge-output-format',
    'mp4',
    '--recode-video',
    'mp4',
    '--postprocessor-args',
    'VideoConvertor:-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -fps_mode cfr -c:a aac -b:a 192k -movflags +faststart',
    '-o',
    outputTemplate,
    env.trimmedUrl
  ]
}

async function beginDownload(options, source = 'start') {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return { error: 'As opções de download são inválidas.' }
  }

  if (activeDownload.proc) {
    return { error: 'Ja existe um download em andamento.' }
  }

  const env = ensureDownloadEnvironment(options)
  if (env.error) {
    return { error: env.error }
  }

  if (options.playlistMode && Array.isArray(options.selectedIndices) && options.selectedIndices.length === 0) {
    return { error: 'Selecione pelo menos um item da playlist antes de baixar.' }
  }

  const args = buildDownloadArgs(options, env)
  const proc = spawn(env.ytdlpPath, args, getYtDlpSpawnOptions(env.denoPath))

  activeDownload.proc = proc
  activeDownload.action = null

  sendDownloadState('downloading', {
    source,
    playlistMode: Boolean(options.playlistMode)
  })

  sendDownloadProgress({ line: `Usando yt-dlp em: ${env.ytdlpPath}` })
  if (env.ffmpegPath) {
    sendDownloadProgress({ line: `Usando ffmpeg em: ${env.ffmpegPath}` })
  }
  if (env.denoPath) {
    sendDownloadProgress({ line: `Usando runtime JavaScript em: ${env.denoPath}` })
  }
  if (env.cookiesPath) {
    sendDownloadProgress({ line: `Usando cookies em: ${env.cookiesPath}` })
  }

  return new Promise((resolve) => {
    let output = ''

    const handleChunk = (chunk) => {
      const text = chunk.toString()
      output += text

      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      for (const line of lines) {
        const progressMatch = line.match(/(\d+(?:\.\d+)?)%/)
        if (progressMatch) {
          sendDownloadProgress({
            percent: Number.parseFloat(progressMatch[1]),
            line
          })
          continue
        }

        const destinationMatch = line.match(/Destination:\s*(.+)/i)
        if (destinationMatch) {
          sendDownloadProgress({
            line: `Arquivo: ${destinationMatch[1].trim()}`
          })
          continue
        }

        if (/Merging formats into/i.test(line)) {
          sendDownloadProgress({
            percent: 99,
            line: 'Juntando video e audio...'
          })
          continue
        }

        sendDownloadProgress({ line })
      }
    }

    proc.stdout.on('data', handleChunk)
    proc.stderr.on('data', handleChunk)

    proc.on('close', (code) => {
      const action = activeDownload.action
      activeDownload.proc = null
      activeDownload.action = null

      if (action === 'stop') {
        sendDownloadState('idle')
        resolve({
          stopped: true,
          folder: env.outputFolder
        })
        return
      }

      if (code === 0) {
        sendDownloadState('completed')
        resolve({
          success: true,
          folder: env.outputFolder
        })
        return
      }

      sendDownloadState('idle')
      resolve({
        error: `Erro ao baixar. Codigo: ${code}\n${output.slice(-500)}`
      })
    })

    proc.on('error', (error) => {
      activeDownload.proc = null
      activeDownload.action = null
      sendDownloadState('idle')
      resolve({
        error: `Falha ao iniciar o processo: ${error.message}`
      })
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 920,
    minWidth: 820,
    minHeight: 760,
    frame: false,
    backgroundColor: '#0e0e0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let targetPath = ''
    try {
      targetPath = path.resolve(fileURLToPath(url)).toLowerCase()
    } catch {}

    if (targetPath !== path.resolve(__dirname, 'index.html').toLowerCase()) {
      event.preventDefault()
    }
  })
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
}

app.whenReady().then(() => {
  createWindow()
  configureAutoUpdater()
  setTimeout(checkForUpdates, 4000)
})

app.on('window-all-closed', () => {
  app.quit()
})

registerTrustedOn('window-minimize', () => mainWindow?.minimize())
registerTrustedOn('window-close', () => mainWindow?.close())

registerTrustedHandle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecionar pasta de destino'
  })

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }

  return null
})

registerTrustedHandle('select-cookies-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Selecionar arquivo cookies.txt',
    filters: [
      { name: 'Arquivo de cookies', extensions: ['txt'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  })

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }

  return null
})

registerTrustedHandle('select-media-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Selecionar arquivo de video ou audio',
    filters: [
      {
        name: 'Midia',
        extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a']
      },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  })

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }

  return null
})

registerTrustedOn('open-folder', (event, folderPath) => {
  if (typeof folderPath === 'string' && path.isAbsolute(folderPath) && fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
    shell.openPath(folderPath)
  }
})

registerTrustedHandle('check-ytdlp', async () => {
  const ytdlpPath = getYtDlpPath()
  const ffmpegPath = getFfmpegPath(ytdlpPath)
  const denoPath = getDenoPath()
  let ffmpegCapabilities = { av1: false }

  try {
    ffmpegCapabilities = await detectCapabilities(getRuntimeContext())
  } catch {
    ffmpegCapabilities = { av1: false }
  }

  return {
    ok: Boolean(ytdlpPath),
    ytdlpPath,
    ffmpegPath,
    denoPath,
    cookiesPath: getCookiesPath(),
    ffmpegCapabilities,
    downloadState: activeDownload.state,
    conversionState: activeConversion.state,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    updaterAvailable: isUpdaterAvailable()
  }
})

registerTrustedHandle('fetch-playlist', async (event, url, selectedCookiesPath) => {
  const ytdlpPath = getYtDlpPath()
  const denoPath = getDenoPath()
  const cookiesPath = typeof selectedCookiesPath === 'string' && path.isAbsolute(selectedCookiesPath) && fs.existsSync(selectedCookiesPath)
    ? selectedCookiesPath
    : getCookiesPath()
  if (!ytdlpPath) {
    return { error: 'yt-dlp.exe nao foi encontrado.' }
  }

  const trimmedUrl = String(url || '').trim()
  if (!isValidHttpUrl(trimmedUrl)) {
    return { error: 'Informe uma URL valida com http:// ou https://.' }
  }

  const args = [
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    ...(denoPath ? ['--js-runtimes', 'deno'] : []),
    ...(cookiesPath ? ['--cookies', cookiesPath] : []),
    trimmedUrl
  ]

  return new Promise((resolve) => {
    const proc = spawn(ytdlpPath, args, getYtDlpSpawnOptions(denoPath))

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({
          error: `Nao foi possivel ler a playlist.\n${(stderr || stdout).slice(-500)}`
        })
        return
      }

      try {
        const raw = JSON.parse(stdout)
        const entries = Array.isArray(raw.entries)
          ? raw.entries.map((entry, index) => ({
              index: index + 1,
              id: entry.id || '',
              title: entry.title || `Item ${index + 1}`,
              duration: formatDuration(Number(entry.duration)),
              url: entry.url || ''
            }))
          : []

        resolve({
          success: true,
          title: raw.title || raw.playlist_title || 'Playlist',
          count: entries.length,
          entries
        })
      } catch (error) {
        resolve({
          error: `Falha ao interpretar a playlist: ${error.message}`
        })
      }
    })

    proc.on('error', (error) => {
      resolve({
        error: `Falha ao iniciar a leitura da playlist: ${error.message}`
      })
    })
  })
})

registerTrustedHandle('probe-media', async (event, filePath) => {
  try {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      throw new Error('Selecione um arquivo de mídia válido.')
    }
    const mediaInfo = await probeMedia(filePath, getRuntimeContext())
    const ffmpegCapabilities = await detectCapabilities(getRuntimeContext())
    return {
      success: true,
      mediaInfo,
      ffmpegCapabilities
    }
  } catch (error) {
    return {
      error: error.message
    }
  }
})

registerTrustedHandle('convert-media', async (event, payload) => {
  if (activeConversion.state === 'converting') {
    return { error: 'Ja existe uma conversao em andamento.' }
  }

  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.inputPath !== 'string' || !path.isAbsolute(payload.inputPath)) {
      throw new Error('Selecione um arquivo de mídia válido.')
    }
    activeConversion.state = 'converting'
    sendConversionState('converting')

    const result = await convert(payload, getRuntimeContext(), (progress) => {
      sendConversionProgress(progress)
    })

    activeConversion.state = 'idle'
    sendConversionState('completed', {
      outputFolder: result.outputFolder
    })

    return {
      success: true,
      ...result
    }
  } catch (error) {
    activeConversion.state = 'idle'
    sendConversionState('idle')
    return {
      error: error.message
    }
  }
})

registerTrustedHandle('start-download', async (event, options) => beginDownload(options, 'start'))

registerTrustedHandle('stop-download', async () => {
  if (!activeDownload.proc) {
    return { error: 'Nao existe download ativo para parar.' }
  }

  activeDownload.action = 'stop'
  const pid = activeDownload.proc.pid
  await killProcessTree(pid)
  return { success: true }
})

registerTrustedHandle('check-for-updates', async () => checkForUpdates())

registerTrustedHandle('download-update', async () => {
  if (!isUpdaterAvailable()) {
    return { error: 'A atualização automática funciona na versão instalada.' }
  }

  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch {
    return { error: 'Não foi possível baixar a atualização.' }
  }
})

registerTrustedHandle('install-update', async () => {
  if (!isUpdaterAvailable()) {
    return { error: 'A atualização automática funciona na versão instalada.' }
  }

  autoUpdater.quitAndInstall(false, true)
  return { success: true }
})
