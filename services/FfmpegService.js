const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

let cachedCapabilities = null

function firstExistingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null
}

function getFfmpegPath({ isPackaged, resourcesPath, appDir }) {
  const candidates = isPackaged
    ? [
        path.join(resourcesPath, 'bin', 'ffmpeg.exe'),
        path.join(resourcesPath, 'ffmpeg.exe')
      ]
    : [
        path.join(appDir, 'bin', 'ffmpeg.exe'),
        path.join(appDir, 'DownloadsYT', 'ffmpeg.exe')
      ]

  return firstExistingPath(candidates)
}

async function getCapabilities(context) {
  if (cachedCapabilities) {
    return cachedCapabilities
  }

  const ffmpegPath = getFfmpegPath(context)
  if (!ffmpegPath) {
    throw new Error('ffmpeg.exe nao foi encontrado em bin/ ou DownloadsYT/.')
  }

  cachedCapabilities = await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-encoders'], {
      windowsHide: true
    })

    let output = ''
    let errorOutput = ''

    proc.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    proc.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error((errorOutput || output || 'Falha ao ler encoders.').trim()))
        return
      }

      const text = `${output}\n${errorOutput}`
      resolve({
        av1: /libaom-av1|libsvtav1|av1_nvenc/i.test(text)
      })
    })

    proc.on('error', (error) => {
      reject(new Error(`Falha ao iniciar ffmpeg: ${error.message}`))
    })
  })

  return cachedCapabilities
}

function parseProgressLine(line) {
  const [key, value] = line.split('=')
  if (!key) {
    return null
  }

  return {
    key: key.trim(),
    value: String(value || '').trim()
  }
}

function toPercent(outTimeMs, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) {
    return 0
  }

  const seconds = Number(outTimeMs) / 1000000
  if (!Number.isFinite(seconds)) {
    return 0
  }

  return Math.max(0, Math.min(100, (seconds / durationSeconds) * 100))
}

function runConversion({ ffmpegPath, args, durationSeconds, onProgress }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, {
      windowsHide: true
    })

    let stderr = ''
    let progressState = {
      out_time_ms: 0,
      speed: '',
      progress: ''
    }

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      for (const line of lines) {
        const parsed = parseProgressLine(line)
        if (!parsed) {
          continue
        }

        progressState[parsed.key] = parsed.value
        if (parsed.key === 'out_time_ms') {
          onProgress?.({
            percent: toPercent(parsed.value, durationSeconds),
            line: `Processando... ${Math.round(toPercent(parsed.value, durationSeconds))}%`
          })
        }

        if (parsed.key === 'progress' && parsed.value === 'end') {
          onProgress?.({
            percent: 100,
            line: 'Conversao concluida.'
          })
        }
      }
    })

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text

      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      for (const line of lines) {
        if (/^frame=|^size=|^time=|^video:/i.test(line)) {
          onProgress?.({ line })
        }
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error((stderr || `ffmpeg saiu com codigo ${code}.`).trim()))
    })

    proc.on('error', (error) => {
      reject(new Error(`Falha ao iniciar ffmpeg: ${error.message}`))
    })
  })
}

module.exports = {
  getCapabilities,
  getFfmpegPath,
  runConversion
}
