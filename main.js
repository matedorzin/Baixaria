const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const fs = require('fs')
const { randomUUID } = require('crypto')
const { fileURLToPath } = require('url')
const { probeMedia, getMediaThumbnail } = require('./services/FfprobeService')
const { convert, detectCapabilities } = require('./services/ConversionService')
const { cookieArgs, describeYtDlpError, isYoutubeAuthError, normalizeCookieBrowser } = require('./services/YtDlpOptions')
const { autoUpdater } = require('electron-updater')

let mainWindow
const previewMedia = new Map()

protocol.registerSchemesAsPrivileged([
  { scheme: 'baixaria-media', privileges: { standard: true, secure: true, stream: true } }
])

function registerPreviewMedia(format) {
  if (!format?.url || !isTrustedMediaUrl(format.url)) return ''
  const token = randomUUID()
  previewMedia.set(token, { url: format.url, headers: format.http_headers || {}, expires: Date.now() + 60 * 60 * 1000 })
  return `baixaria-media://preview/${token}`
}

function handlePreviewMedia(request) {
  const parsed = new URL(request.url)
  const token = parsed.hostname === 'preview' ? parsed.pathname.slice(1) : ''
  const media = previewMedia.get(token)
  if (!media || media.expires < Date.now() || !isTrustedMediaUrl(media.url) || !['GET', 'HEAD'].includes(request.method)) {
    return new Response('', { status: 404 })
  }
  const headers = new Headers()
  for (const name of ['user-agent', 'accept-language', 'referer', 'origin']) {
    const value = media.headers[name] || media.headers[Object.keys(media.headers).find((key) => key.toLowerCase() === name)]
    if (typeof value === 'string') headers.set(name, value)
  }
  const range = request.headers.get('range')
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.set('range', range)
  return net.fetch(media.url, { method: request.method, headers })
}

const activeDownload = {
  proc: null,
  state: 'idle',
  action: null,
  retryTimer: null,
  retryResolve: null
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

function defaultAppSettings() {
  return {
    downloadFolder: app.getPath('downloads')
  }
}

function readAppSettings() {
  const defaults = defaultAppSettings()
  try {
    const settingsFile = path.join(app.getPath('userData'), 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
    const folder = typeof stored.downloadFolder === 'string' && path.isAbsolute(stored.downloadFolder)
      ? path.resolve(stored.downloadFolder)
      : defaults.downloadFolder
    return {
      downloadFolder: fs.existsSync(folder) && fs.statSync(folder).isDirectory() ? folder : defaults.downloadFolder
    }
  } catch {
    return defaults
  }
}

function writeAppSettings(settings) {
  const settingsFile = path.join(app.getPath('userData'), 'settings.json')
  const temporaryFile = `${settingsFile}.tmp`
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true })
  fs.writeFileSync(temporaryFile, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryFile, settingsFile)
}

function automaticCookieDirectory() {
  return path.join(app.getPath('userData'), 'browser-cookie-cache')
}

function removeStaleAutomaticCookieFiles() {
  const directory = automaticCookieDirectory()
  try {
    for (const name of fs.readdirSync(directory)) {
      if (/^cookies-session-[a-f0-9-]+\.txt$/i.test(name)) {
        try { fs.unlinkSync(path.join(directory, name)) } catch {}
      }
    }
  } catch {}
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

function runYtDlpProcess(ytdlpPath, args, denoPath, { timeoutMs = 60000, maxOutput = 12 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(ytdlpPath, args, getYtDlpSpawnOptions(denoPath))
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }
    const timeout = setTimeout(() => {
      proc.kill()
      finish({ error: 'A leitura demorou demais. Tente novamente.' })
    }, timeoutMs)

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      if (stdout.length > maxOutput) {
        proc.kill()
        finish({ error: 'O site retornou dados demais para ler.' })
      }
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 1024 * 1024) stderr = stderr.slice(-1024 * 1024)
    })
    proc.on('close', (code) => finish({ code, stdout, stderr }))
    proc.on('error', (error) => finish({ error: `Falha ao iniciar a leitura: ${error.message}` }))
  })
}

function recordYoutubeAttempt(operation, url, mode, result) {
  if (!isYoutubeUrl(url)) return
  try {
    const file = path.join(app.getPath('appData'), 'baixaria-desktop', 'download-diagnostics.json')
    let previous = []
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (Array.isArray(parsed)) previous = parsed
    } catch {}
    const output = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`
    const next = [...previous.slice(-39), {
      at: new Date().toISOString(),
      operation,
      mode,
      success: result.code === 0,
      exitCode: Number.isInteger(result.code) ? result.code : null,
      blocked: isYoutubeAuthError(output),
      rateLimited: /http error 429|too many requests/i.test(output),
      runtimeMissing: /no supported javascript runtime/i.test(output)
    }]
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, file)
  } catch {}
}

async function readYtDlpWithFallback(operation, ytdlpPath, commonArgs, url, denoPath, cookiesPath, cookiesFromBrowser) {
  let currentCookiesPath = cookiesPath || (isYoutubeUrl(url) && !cookiesFromBrowser ? getCookiesPath() : null)
  let currentBrowser = cookiesFromBrowser
  const run = async () => {
    const result = await runYtDlpProcess(ytdlpPath, [...commonArgs, ...cookieArgs(currentCookiesPath, currentBrowser), url], denoPath)
    recordYoutubeAttempt(operation, url, currentCookiesPath ? 'cookies' : currentBrowser ? 'browser' : 'direct', result)
    return result
  }

  let result = await run()
  const blocked = () => result.code !== 0 && isYoutubeAuthError(`${result.stderr || ''}\n${result.stdout || ''}\n${result.error || ''}`)
  if (isYoutubeUrl(url) && blocked() && !currentCookiesPath && !currentBrowser) {
    const localCookiesPath = getCookiesPath()
    if (localCookiesPath) {
      currentCookiesPath = localCookiesPath
      result = await run()
    }
  }
  if (isYoutubeUrl(url) && blocked() && currentCookiesPath) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    result = await run()
  }
  return { ...result, usedLocalCookies: Boolean(currentCookiesPath) }
}

function getCookiesPath() {
  if (app.isPackaged) {
    // Personal cookies stay in their original local file. The packaged app only
    // reads a private pointer configured on this PC; no cookies enter the build.
    const pointers = [
      path.join(path.dirname(process.execPath), 'local-auth.json'),
      path.join(app.getPath('appData'), 'baixaria-desktop', 'local-auth.json'),
      path.join(app.getPath('userData'), 'local-auth.json')
    ]
    for (const pointer of new Set(pointers)) {
      try {
        const { cookiesPath } = JSON.parse(fs.readFileSync(pointer, 'utf8'))
        if (typeof cookiesPath === 'string' && path.isAbsolute(cookiesPath) && path.extname(cookiesPath).toLowerCase() === '.txt' && fs.statSync(cookiesPath).isFile()) {
          return cookiesPath
        }
      } catch {}
    }
    return null
  }

  const candidates = [
    path.join(__dirname, 'DownloadsYT', 'cookies.txt'),
    path.join(__dirname, 'bin', 'cookies.txt'),
    path.join(__dirname, 'cookies.txt')
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

function isYoutubeUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com')
  } catch {
    return false
  }
}

function isSupportedClipUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    const hostname = parsed.hostname.toLowerCase()
    const supportedHosts = ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'twitch.tv']
    return parsed.protocol === 'https:' && supportedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

function isTrustedMediaUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    const hostname = parsed.hostname.toLowerCase()
    const allowedHosts = ['googlevideo.com', 'youtube.com', 'ttvnw.net', 'jtvnw.net']
    return parsed.protocol === 'https:' && allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

function isTrustedThumbnailUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    const hostname = parsed.hostname.toLowerCase()
    const allowedHosts = ['ytimg.com', 'jtvnw.net']
    return parsed.protocol === 'https:' && allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
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

function formatSectionTime(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
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

function waitForDownloadRetry(milliseconds) {
  sendDownloadState('retrying')
  return new Promise((resolve) => {
    let finished = false
    const finish = (proceed) => {
      if (finished) return
      finished = true
      clearTimeout(activeDownload.retryTimer)
      activeDownload.retryTimer = null
      activeDownload.retryResolve = null
      resolve(proceed)
    }
    activeDownload.retryResolve = finish
    activeDownload.retryTimer = setTimeout(() => finish(true), milliseconds)
  })
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

  const selectedCookiesPath = options.cookiesPath && fs.existsSync(options.cookiesPath) ? options.cookiesPath : ''
  const cookiesPath = selectedCookiesPath || (options.cookiesFromBrowser || !isYoutubeUrl(trimmedUrl) ? null : getCookiesPath())

  return {
    ytdlpPath,
    ffmpegPath: getFfmpegPath(ytdlpPath),
    denoPath: getDenoPath(),
    cookiesPath,
    cookiesFromBrowser: normalizeCookieBrowser(options.cookiesFromBrowser),
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
    commonArgs.push('--js-runtimes', `deno:${env.denoPath}`)
  }

  commonArgs.push(...cookieArgs(env.cookiesPath, env.cookiesFromBrowser))

  const playlistItems = playlistMode ? compactIndices(options.selectedIndices || []) : ''
  if (playlistItems) {
    commonArgs.push('--playlist-items', playlistItems)
  }

  if (options.section) {
    commonArgs.push(
      '--download-sections',
      `*${formatSectionTime(options.section.start)}-${formatSectionTime(options.section.end)}`,
      '--force-keyframes-at-cuts'
    )
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

  if (activeDownload.proc || activeDownload.retryTimer) {
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

    proc.on('close', async (code) => {
      const action = activeDownload.action
      activeDownload.proc = null
      activeDownload.action = null
      recordYoutubeAttempt(source, env.trimmedUrl, env.cookiesPath ? 'cookies' : env.cookiesFromBrowser ? 'browser' : 'direct', { code, stdout: output })

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

      const details = output.slice(-500)
      if (!options._localAuthRetry && !env.cookiesPath && !env.cookiesFromBrowser && isYoutubeUrl(env.trimmedUrl) && isYoutubeAuthError(output)) {
        const localCookiesPath = getCookiesPath()
        if (localCookiesPath) {
          sendDownloadProgress({ line: 'O YouTube recusou a tentativa direta. Repetindo com os cookies locais deste PC…' })
          beginDownload({ ...options, cookiesPath: localCookiesPath, _localAuthRetry: true }, source).then(resolve)
          return
        }
      }
      if (!options._youtubeFinalRetry && env.cookiesPath && isYoutubeUrl(env.trimmedUrl) && isYoutubeAuthError(output)) {
        sendDownloadProgress({ line: 'O YouTube limitou esta tentativa. Aguardando 5 segundos para tentar de novo automaticamente…' })
        const proceed = await waitForDownloadRetry(5000)
        if (!proceed) {
          sendDownloadState('idle')
          resolve({ stopped: true, folder: env.outputFolder })
          return
        }
        beginDownload({ ...options, cookiesPath: env.cookiesPath, _localAuthRetry: true, _youtubeFinalRetry: true }, source).then(resolve)
        return
      }
      if (options._localAuthRetry && isYoutubeAuthError(output)) {
        sendDownloadState('idle')
        resolve({ error: 'O YouTube bloqueou este vídeo mesmo após a tentativa com os cookies locais deste PC.' })
        return
      }
      sendDownloadState('idle')
      resolve({ error: describeYtDlpError(details) || `Erro ao baixar. Codigo: ${code}\n${details}` })
    })

    proc.on('error', (error) => {
      activeDownload.proc = null
      activeDownload.action = null
      recordYoutubeAttempt(source, env.trimmedUrl, env.cookiesPath ? 'cookies' : env.cookiesFromBrowser ? 'browser' : 'direct', { error: error.message })
      sendDownloadState('idle')
      resolve({
        error: `Falha ao iniciar o processo: ${error.message}`
      })
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
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
  protocol.handle('baixaria-media', handlePreviewMedia)
  removeStaleAutomaticCookieFiles()
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

registerTrustedHandle('get-app-settings', async () => readAppSettings())

registerTrustedHandle('set-download-folder', async (event, folderPath) => {
  if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) {
    return { error: 'Escolha uma pasta válida.' }
  }

  const resolvedFolder = path.resolve(folderPath)
  try {
    if (!fs.statSync(resolvedFolder).isDirectory()) {
      return { error: 'O destino escolhido não é uma pasta.' }
    }
    const settings = { ...readAppSettings(), downloadFolder: resolvedFolder }
    writeAppSettings(settings)
    return { success: true, settings }
  } catch {
    return { error: 'Não foi possível salvar a pasta padrão.' }
  }
})

registerTrustedHandle('open-uninstall-settings', async () => {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return { error: 'A desinstalação fica disponível na versão instalada do Windows.' }
  }

  try {
    await shell.openExternal('ms-settings:appsfeatures')
    return { success: true }
  } catch {
    return { error: 'Não foi possível abrir os aplicativos instalados do Windows.' }
  }
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
    updaterAvailable: isUpdaterAvailable(),
    settings: readAppSettings()
  }
})

registerTrustedHandle('fetch-playlist', async (event, url, selectedCookiesPath, selectedBrowser) => {
  const ytdlpPath = getYtDlpPath()
  const denoPath = getDenoPath()
  const cookiesPath = typeof selectedCookiesPath === 'string' && path.isAbsolute(selectedCookiesPath) && fs.existsSync(selectedCookiesPath)
    ? selectedCookiesPath
    : selectedBrowser || !isYoutubeUrl(trimmedUrl) ? null : getCookiesPath()
  const cookiesFromBrowser = cookiesPath ? '' : normalizeCookieBrowser(selectedBrowser)
  if (!ytdlpPath) {
    return { error: 'yt-dlp.exe nao foi encontrado.' }
  }

  const trimmedUrl = String(url || '').trim()
  if (!isValidHttpUrl(trimmedUrl)) {
    return { error: 'Informe uma URL valida com http:// ou https://.' }
  }

  const commonArgs = [
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    ...(denoPath ? ['--js-runtimes', `deno:${denoPath}`] : [])
  ]
  const result = await readYtDlpWithFallback('playlist', ytdlpPath, commonArgs, trimmedUrl, denoPath, cookiesPath, cookiesFromBrowser)
  if (result.error || result.code !== 0) {
    const details = (result.stderr || result.stdout || result.error || '').slice(-500)
    return { error: describeYtDlpError(details) || `Não foi possível ler a playlist.\n${details}` }
  }

  try {
    const raw = JSON.parse(result.stdout)
    const entries = Array.isArray(raw.entries)
      ? raw.entries.map((entry, index) => ({
          index: index + 1,
          id: entry.id || '',
          title: entry.title || `Item ${index + 1}`,
          duration: formatDuration(Number(entry.duration)),
          url: entry.url || ''
        }))
      : []

    return { success: true, title: raw.title || raw.playlist_title || 'Playlist', count: entries.length, entries }
  } catch (error) {
    return { error: `Falha ao interpretar a playlist: ${error.message}` }
  }
})

registerTrustedHandle('fetch-clip-info', async (event, url, selectedCookiesPath, selectedBrowser) => {
  const trimmedUrl = String(url || '').trim()
  if (!isSupportedClipUrl(trimmedUrl)) {
    return { error: 'Use um link HTTPS de um vídeo ou VOD do YouTube ou Twitch.' }
  }

  const ytdlpPath = getYtDlpPath()
  if (!ytdlpPath) {
    return { error: 'yt-dlp.exe não foi encontrado.' }
  }

  const denoPath = getDenoPath()
  let cookiesPath = null
  if (typeof selectedCookiesPath === 'string' && path.isAbsolute(selectedCookiesPath) && fs.existsSync(selectedCookiesPath)) {
    try {
      if (fs.statSync(selectedCookiesPath).isFile() && path.extname(selectedCookiesPath).toLowerCase() === '.txt') {
        cookiesPath = selectedCookiesPath
      }
    } catch {}
  }
  if (!cookiesPath && !selectedBrowser && isYoutubeUrl(trimmedUrl)) cookiesPath = getCookiesPath()
  const cookiesFromBrowser = cookiesPath ? '' : normalizeCookieBrowser(selectedBrowser)

  const commonArgs = [
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    '--no-playlist',
    ...(denoPath ? ['--js-runtimes', `deno:${denoPath}`] : [])
  ]
  const result = await readYtDlpWithFallback('clips', ytdlpPath, commonArgs, trimmedUrl, denoPath, cookiesPath, cookiesFromBrowser)
  if (result.error || result.code !== 0) {
    const details = (result.stderr || result.stdout || result.error || '').trim().slice(-400)
    const blocked = isYoutubeUrl(trimmedUrl) && isYoutubeAuthError(`${result.stderr || ''}\n${result.stdout || ''}\n${result.error || ''}`)
    if (blocked) {
      return { error: result.usedLocalCookies
        ? 'O YouTube recusou este vídeo mesmo após duas tentativas com a sessão local.'
        : 'O YouTube pediu autenticação para este vídeo, mas esta cópia do Baixaria não encontrou a sessão local.' }
    }
    return { error: describeYtDlpError(details) || `Não foi possível ler esse vídeo. ${details}`.trim() }
  }

  try {
    const raw = JSON.parse(result.stdout)
    const formats = (Array.isArray(raw.formats) ? raw.formats : [])
      .filter((format) => format.protocol === 'https' && isTrustedMediaUrl(format.url))
    const combinedFormats = formats
      .filter((format) => format.ext === 'mp4' && format.vcodec && format.vcodec !== 'none' && format.acodec && format.acodec !== 'none')
      .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0))
    const videoFormats = formats
      .filter((format) => format.ext === 'mp4' && String(format.vcodec || '').startsWith('avc1') && format.acodec === 'none')
      .sort((a, b) => Math.abs((Number(a.height) || 0) - 480) - Math.abs((Number(b.height) || 0) - 480))
    const audioFormats = formats
      .filter((format) => format.ext === 'm4a' && format.vcodec === 'none' && String(format.acodec || '').startsWith('mp4a'))
      .sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0))
    const thumbnail = isTrustedThumbnailUrl(raw.thumbnail) ? raw.thumbnail : ''
    const preview = combinedFormats.find((format) => Number(format.height) <= 720) || combinedFormats[0]
    const previewVideo = preview || videoFormats[0]
    const previewAudio = preview ? null : audioFormats[0]
    previewMedia.clear()
    return {
      success: true,
      video: {
        title: String(raw.title || 'Vídeo sem título').slice(0, 300),
        duration: Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : 0,
        width: Number(raw.width) || Number(previewVideo?.width) || 0,
        height: Number(raw.height) || Number(previewVideo?.height) || 0,
        thumbnail,
        previewUrl: registerPreviewMedia(previewVideo),
        previewAudioUrl: registerPreviewMedia(previewAudio),
        isLive: Boolean(raw.is_live)
      }
    }
  } catch {
    return { error: 'O site retornou informações que o Baixaria não conseguiu interpretar.' }
  }
})

registerTrustedHandle('download-clips', async (event, options) => {
  if (!options || typeof options !== 'object' || Array.isArray(options) || !isSupportedClipUrl(options.url)) {
    return { error: 'Informe um link HTTPS válido do YouTube ou Twitch.' }
  }

  const clips = Array.isArray(options.clips) ? options.clips.slice(0, 12) : []
  if (clips.length === 0) {
    return { error: 'Adicione ao menos um trecho.' }
  }

  const duration = Number(options.duration) || 0
  for (const clip of clips) {
    const start = Number(clip.start)
    const end = Number(clip.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 1 || end > 86400 || (duration > 0 && end > duration + 1)) {
      return { error: 'Confira o início e o fim de cada trecho. Cada trecho precisa ter ao menos 1 segundo.' }
    }
  }

  const folder = typeof options.folder === 'string' && path.isAbsolute(options.folder)
    ? path.resolve(options.folder)
    : readAppSettings().downloadFolder
  const baseName = sanitizeFilename(String(options.filename || 'clipe')) || 'clipe'
  const completed = []

  for (let index = 0; index < clips.length; index += 1) {
    const clipNumber = String(index + 1).padStart(2, '0')
    sendDownloadProgress({ line: `Baixando trecho ${index + 1} de ${clips.length}...` })
    const result = await beginDownload({
      url: options.url,
      format: options.format === 'audio' ? 'audio' : 'video',
      audioQuality: 192,
      quality: ['best', '1080', '720', '480', '360'].includes(options.quality) ? options.quality : 'best',
      filename: `${baseName}-${clipNumber}`,
      folder,
      cookiesPath: options.cookiesPath,
      cookiesFromBrowser: options.cookiesFromBrowser,
      playlistMode: false,
      selectedIndices: [],
      section: { start: Number(clips[index].start), end: Number(clips[index].end) }
    }, 'clip')

    if (!result.success) {
      return { error: result.error || 'Um dos trechos não foi baixado.', completed, folder }
    }
    completed.push({ index: index + 1, folder })
  }

  return { success: true, completed, folder }
})

registerTrustedHandle('probe-media', async (event, filePath) => {
  try {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      throw new Error('Selecione um arquivo de mídia válido.')
    }
    const mediaInfo = await probeMedia(filePath, getRuntimeContext())
    if (mediaInfo.hasVideo) {
      mediaInfo.thumbnail = await getMediaThumbnail(filePath, getRuntimeContext(), mediaInfo)
    }
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
  if (activeDownload.retryResolve) {
    activeDownload.retryResolve(false)
    sendDownloadState('idle')
    return { success: true }
  }
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
