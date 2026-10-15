const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { getFfmpegPath } = require('./FfmpegService')
const { isHdrTransfer, buildHdrToSdrFilter } = require('./ColorFilter')

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
  const width = videoStream ? toNumber(videoStream.width) : 0
  const height = videoStream ? toNumber(videoStream.height) : 0
  const rotation = Number(videoStream?.side_data_list?.find((item) => Number.isFinite(Number(item.rotation)))?.rotation ?? videoStream?.tags?.rotate ?? 0)
  const sideways = Math.abs(rotation) % 180 === 90
  const displayWidth = sideways ? height : width
  const displayHeight = sideways ? width : height

  return {
    filePath,
    fileName: path.basename(filePath),
    type,
    container: normalizeFormatName(format.format_name),
    videoCodec: videoStream ? String(videoStream.codec_name || '').toUpperCase() : '',
    audioCodec: audioStream ? String(audioStream.codec_name || '').toUpperCase() : '',
    width,
    height,
    displayWidth,
    displayHeight,
    displayAspect: displayWidth && displayHeight ? (displayWidth / displayHeight < 0.8 ? 'portrait' : displayWidth / displayHeight > 1.3 ? 'landscape' : 'square') : 'landscape',
    resolution: videoStream ? `${displayWidth}x${displayHeight}` : '',
    fps: videoStream ? parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate) : 0,
    bitrate: toNumber(format.bit_rate || videoStream?.bit_rate || audioStream?.bit_rate),
    duration: toNumber(format.duration),
    size: toNumber(format.size),
    hasVideo: Boolean(videoStream),
    hasAudio: Boolean(audioStream),
    colorTransfer: videoStream ? String(videoStream.color_transfer || '') : ''
  }
}

async function getMediaThumbnail(filePath, context, mediaInfo = {}) {
  const ffmpegPath = getFfmpegPath(context)
  if (!ffmpegPath) return ''
  const isHdr = isHdrTransfer(mediaInfo.colorTransfer)
  const previewFilter = isHdr
    ? `${buildHdrToSdrFilter(mediaInfo.colorTransfer)},scale=480:-2`
    : 'scale=480:-2'

  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', filePath,
      '-frames:v', '1', '-vf', previewFilter,
      '-q:v', '4', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'
    ], { windowsHide: true })
    const chunks = []
    let size = 0
    const timer = setTimeout(() => proc.kill(), 15000)
    proc.stdout.on('data', (chunk) => {
      size += chunk.length
      if (size > 3 * 1024 * 1024) proc.kill()
      else chunks.push(chunk)
    })
    proc.on('error', () => { clearTimeout(timer); resolve('') })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 && size > 0 && size <= 3 * 1024 * 1024
        ? `data:image/jpeg;base64,${Buffer.concat(chunks).toString('base64')}`
        : '')
    })
  })
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
  probeMedia,
  getMediaThumbnail
}
