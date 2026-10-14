const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

function firstExistingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null
}

function getFfprobePath({ isPackaged, resourcesPath, appDir }) {
  const candidates = isPackaged
    ? [
        path.join(resourcesPath, 'bin', 'ffprobe.exe'),
        path.join(resourcesPath, 'ffprobe.exe')
      ]
    : [
        path.join(appDir, 'bin', 'ffprobe.exe'),
        path.join(appDir, 'DownloadsYT', 'ffprobe.exe')
      ]

  return firstExistingPath(candidates)
}

function normalizeFormatName(formatName) {
  if (!formatName) {
    return ''
  }

  const first = String(formatName).split(',')[0].trim().toLowerCase()
  if (first === 'mov') {
    return 'MOV'
  }

  return first.toUpperCase()
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseFrameRate(rate) {
  if (!rate || !String(rate).includes('/')) {
    return 0
  }

  const [numerator, denominator] = String(rate).split('/').map(Number)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0
  }

  return numerator / denominator
}

function buildMediaInfo(filePath, raw) {
  const streams = Array.isArray(raw.streams) ? raw.streams : []
  const format = raw.format || {}
  const videoStream = streams.find((stream) => stream.codec_type === 'video')
  const audioStream = streams.find((stream) => stream.codec_type === 'audio')
  const type = videoStream ? 'video' : 'audio'

  return {
    filePath,
    fileName: path.basename(filePath),
    type,
    container: normalizeFormatName(format.format_name),
    videoCodec: videoStream ? String(videoStream.codec_name || '').toUpperCase() : '',
    audioCodec: audioStream ? String(audioStream.codec_name || '').toUpperCase() : '',
    width: videoStream ? toNumber(videoStream.width) : 0,
    height: videoStream ? toNumber(videoStream.height) : 0,
    resolution: videoStream ? `${toNumber(videoStream.width)}x${toNumber(videoStream.height)}` : '',
    fps: videoStream ? parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate) : 0,
    bitrate: toNumber(format.bit_rate || videoStream?.bit_rate || audioStream?.bit_rate),
    duration: toNumber(format.duration),
    size: toNumber(format.size),
    hasVideo: Boolean(videoStream),
    hasAudio: Boolean(audioStream)
  }
}

async function probeMedia(filePath, context) {
  const ffprobePath = getFfprobePath(context)
  if (!ffprobePath) {
    throw new Error('ffprobe.exe nao foi encontrado em bin/ ou DownloadsYT/.')
  }

  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo selecionado nao existe.')
  }

  const args = [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, args, {
      windowsHide: true
    })

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
        reject(new Error((stderr || stdout || 'Falha ao ler metadados.').trim()))
        return
      }

      try {
        const raw = JSON.parse(stdout)
        resolve(buildMediaInfo(filePath, raw))
      } catch (error) {
        reject(new Error(`Falha ao interpretar metadados: ${error.message}`))
      }
    })

    proc.on('error', (error) => {
      reject(new Error(`Falha ao iniciar ffprobe: ${error.message}`))
    })
  })
}

module.exports = {
  getFfprobePath,
  probeMedia
}
