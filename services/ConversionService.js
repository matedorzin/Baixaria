const fs = require('fs')
const path = require('path')
const os = require('os')
const { getCapabilities, getFfmpegPath, runConversion } = require('./FfmpegService')
const { getMediaThumbnail, probeMedia } = require('./FfprobeService')
const { buildHdrToSdrFilter } = require('./ColorFilter')

function fileExists(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath)
}

function sanitizeOutputName(name, fallbackName) {
  const base = String(name || '').trim() || fallbackName
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || fallbackName
}

function ensureOutputDirectory(dirPath) {
  if (!fileExists(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '')
}

function mapVideoCodec(codec) {
  const mapping = {
    'H.264': 'libx264',
    'H.265': 'libx265',
    VP9: 'libvpx-vp9',
    AV1: 'libaom-av1'
  }

  return mapping[codec] || 'libx264'
}

function mapAudioCodec(format) {
  const mapping = {
    MP3: 'libmp3lame',
    WAV: 'pcm_s16le',
    AAC: 'aac',
    FLAC: 'flac',
    OGG: 'libvorbis',
    M4A: 'aac'
  }

  return mapping[format] || 'aac'
}

function getContainerExtension(format) {
  const mapping = {
    MP4: 'mp4',
    MOV: 'mov',
    MKV: 'mkv',
    WEBM: 'webm',
    AVI: 'avi',
    MP3: 'mp3',
    WAV: 'wav',
    AAC: 'aac',
    FLAC: 'flac',
    OGG: 'ogg',
    M4A: 'm4a',
    GIF: 'gif'
  }

  return mapping[String(format || '').toUpperCase()] || String(format || '').toLowerCase()
}

function buildScaleFilter(resolution) {
  const mapping = {
    '4K': 'scale=3840:-2',
    '1080p': 'scale=1920:-2',
    '720p': 'scale=1280:-2',
    '480p': 'scale=854:-2'
  }

  return mapping[resolution] || ''
}

function buildGifFilter(options) {
  const fps = Number(options.gifFps || 15)
  const width = options.gifWidth && options.gifWidth !== 'original'
    ? `scale=${options.gifWidth}:-1:flags=lanczos`
    : 'scale=iw:-1:flags=lanczos'

  return `fps=${fps},${width},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer`
}

function getQualityCrf(qualityPreset, customCrf) {
  if (qualityPreset === 'custom') {
    return String(customCrf || '23')
  }

  const mapping = {
    high: '20',
    medium: '25',
    low: '30'
  }

  return mapping[qualityPreset] || '23'
}

function getOptimizedCrf(payload) {
  const level = Math.max(0, Math.min(4, Number(payload.optimizationLevel) || 0))
  const values = ['29', '27', '25', '22', '19']
  const offset = payload.videoCodec === 'H.265' ? 2 : payload.videoCodec === 'VP9' || payload.videoCodec === 'AV1' ? 8 : 0
  return String(Number(values[level]) + offset)
}

function buildVideoArgs(payload) {
  const filters = []
  const args = ['-map_metadata', '0']

  if (payload.hdrToSdr) {
    filters.push(buildHdrToSdrFilter(payload.sourceColorTransfer))
  }

  const scaleFilter = buildScaleFilter(payload.videoResolution)
  if (scaleFilter) {
    filters.push(scaleFilter)
  }

  if (payload.hdrToSdr) {
    // iPhone HLG/Dolby Vision frame metadata can survive tone mapping. Players
    // may then interpret the BT.709 output as HDR and blow out its colors.
    filters.push('sidedata=mode=delete')
  }

  if (payload.videoFps && payload.videoFps !== 'original') {
    args.push('-r', String(payload.videoFps))
  }

  args.push('-c:v', mapVideoCodec(payload.videoCodec))
  if (payload.optimizeEnabled && ['H.264', 'H.265'].includes(payload.videoCodec)) args.push('-preset', 'slow')
  args.push('-crf', payload.optimizeEnabled ? getOptimizedCrf(payload) : getQualityCrf(payload.videoQualityPreset, payload.videoCrf))
  if (payload.optimizeEnabled && ['VP9', 'AV1'].includes(payload.videoCodec)) args.push('-b:v', '0')

  if (payload.videoCodec === 'H.264') {
    args.push('-pix_fmt', 'yuv420p', '-profile:v', 'high')
  }

  if (payload.hdrToSdr) {
    args.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709')
  }

  if (payload.outputFormat === 'MP4') {
    args.push('-movflags', '+faststart')
  }

  if (payload.outputFormat === 'WEBM') {
    args.push('-c:a', 'libopus')
  } else {
    args.push('-c:a', 'aac')
    args.push('-b:a', '192k')
  }

  if (filters.length > 0) {
    args.push('-vf', filters.join(','))
  }

  return args
}

function buildAudioOnlyArgs(payload) {
  const format = payload.audioExtractFormat || 'MP3'
  const args = ['-vn', '-c:a', mapAudioCodec(format)]

  if (format !== 'WAV' && format !== 'FLAC') {
    args.push('-b:a', payload.audioBitrate || '192k')
  }

  if (payload.audioSampleRate && payload.audioSampleRate !== 'original') {
    args.push('-ar', String(payload.audioSampleRate))
  }

  if (payload.audioChannels && payload.audioChannels !== 'original') {
    args.push('-ac', payload.audioChannels === 'mono' ? '1' : '2')
  }

  return args
}

function buildAudioArgs(payload) {
  const format = payload.audioFormat || 'MP3'
  const args = ['-c:a', mapAudioCodec(format)]

  if (format !== 'WAV' && format !== 'FLAC') {
    args.push('-b:a', payload.audioBitrate || '192k')
  }

  if (payload.audioSampleRate && payload.audioSampleRate !== 'original') {
    args.push('-ar', String(payload.audioSampleRate))
  }

  if (payload.audioChannels && payload.audioChannels !== 'original') {
    args.push('-ac', payload.audioChannels === 'mono' ? '1' : '2')
  }

  return args
}

function buildGifArgs(payload) {
  const args = ['-y', '-hide_banner']

  if (payload.gifStart) {
    args.push('-ss', String(payload.gifStart))
  }

  args.push('-i', payload.inputPath)

  if (payload.gifDuration) {
    args.push('-t', String(payload.gifDuration))
  }

  args.push('-an')
  args.push('-filter_complex', buildGifFilter(payload))
  args.push('-loop', payload.gifLoop ? '0' : '-1')
  args.push('-progress', 'pipe:1', '-nostats')

  return args
}

function buildOutputPath(payload, defaultBaseName) {
  const outputFolder = payload.outputFolder || path.dirname(payload.inputPath)
  ensureOutputDirectory(outputFolder)

  const desiredName = sanitizeOutputName(payload.outputName, defaultBaseName)
  const extension = payload.convertToGif
    ? getContainerExtension('GIF')
    : payload.extractAudioOnly
      ? getContainerExtension(payload.audioExtractFormat || 'MP3')
      : payload.mediaType === 'audio'
        ? getContainerExtension(payload.audioFormat || 'MP3')
        : getContainerExtension(payload.outputFormat || 'MP4')

  return availableOutputPath(path.join(outputFolder, `${desiredName}.${extension}`), payload.inputPath)
}

function availableOutputPath(candidate, inputPath) {
  const parsed = path.parse(candidate)
  let output = candidate
  let suffix = 2
  while (fs.existsSync(output) || path.resolve(output).toLowerCase() === path.resolve(inputPath).toLowerCase()) {
    output = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`)
    suffix += 1
  }
  return output
}

function buildCommand(payload) {
  const defaultBaseName = stripExtension(path.basename(payload.inputPath))
  const outputPath = buildOutputPath(payload, defaultBaseName)

  if (payload.convertToGif) {
    const args = buildGifArgs(payload)
    args.push(outputPath)
    return { args, outputPath }
  }

  const args = ['-y', '-hide_banner']
  args.push('-i', payload.inputPath)

  if (payload.extractAudioOnly) {
    args.push(...buildAudioOnlyArgs(payload))
  } else if (payload.mediaType === 'audio') {
    args.push(...buildAudioArgs(payload))
  } else {
    args.push(...buildVideoArgs(payload))
  }

  args.push('-progress', 'pipe:1', '-nostats')
  args.push(outputPath)
  return { args, outputPath }
}

function buildSplitOutput(payload, index, total) {
  const outputFolder = payload.outputFolder || path.dirname(payload.inputPath)
  ensureOutputDirectory(outputFolder)
  const fallbackName = stripExtension(path.basename(payload.inputPath))
  const baseName = sanitizeOutputName(payload.outputName, fallbackName)
  const extension = getContainerExtension(payload.outputFormat || 'MP4')
  const partNumber = String(index + 1).padStart(String(total).length, '0')
  return availableOutputPath(path.join(outputFolder, `${baseName}-${partNumber}.${extension}`), payload.inputPath)
}

async function previewConversion(payload, context) {
  if (!fileExists(payload.inputPath) || payload.mediaType !== 'video') throw new Error('Selecione um vídeo válido para gerar a prévia.')
  const ffmpegPath = getFfmpegPath(context)
  if (!ffmpegPath) throw new Error('FFmpeg não está disponível para gerar a prévia.')
  const duration = Number(payload.duration) || 0
  if (duration <= 0) throw new Error('A duração do vídeo não foi reconhecida.')
  const sampleDuration = Math.min(5, duration)
  const start = Math.max(0, Math.min(duration - sampleDuration, duration * .25))
  const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'baixaria-convert-preview-'))
  const extension = getContainerExtension(payload.outputFormat || 'MP4')
  const outputPath = path.join(tempFolder, `amostra.${extension}`)
  try {
    const args = ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-i', payload.inputPath,
      '-t', String(sampleDuration), ...buildVideoArgs(payload), outputPath]
    await runConversion({ ffmpegPath, args, durationSeconds: sampleDuration })
    const outputSize = fs.statSync(outputPath).size
    const sampledInfo = await probeMedia(outputPath, context)
    const [before, after] = await Promise.all([
      getMediaThumbnail(payload.inputPath, context, { colorTransfer: payload.sourceColorTransfer }, start),
      getMediaThumbnail(outputPath, context, sampledInfo, 0)
    ])
    return {
      before, after, sampleDuration,
      estimatedSize: Math.round(outputSize / sampleDuration * duration)
    }
  } finally {
    try { fs.rmSync(tempFolder, { recursive: true, force: true }) } catch {}
  }
}

async function splitMedia(payload, context, onProgress, durationSeconds) {
  const total = Number(payload.splitParts)
  if (!Number.isInteger(total) || total < 2 || total > 30) {
    throw new Error('Escolha entre 2 e 30 partes.')
  }
  if (payload.mediaType !== 'video' || payload.convertToGif || payload.extractAudioOnly || !durationSeconds) {
    throw new Error('A divisão em partes precisa de um vídeo com duração reconhecida.')
  }

  const ffmpegPath = getFfmpegPath(context)
  if (!ffmpegPath) {
    throw new Error('ffmpeg.exe não foi encontrado em bin/ ou DownloadsYT/.')
  }

  const segmentDuration = durationSeconds / total
  const outputPaths = []
  for (let index = 0; index < total; index += 1) {
    const start = segmentDuration * index
    const length = index === total - 1 ? durationSeconds - start : segmentDuration
    const outputPath = buildSplitOutput(payload, index, total)
    const args = [
      '-y',
      '-hide_banner',
      '-ss', String(start.toFixed(3)),
      '-i', payload.inputPath,
      '-t', String(length.toFixed(3)),
      ...buildVideoArgs(payload),
      '-progress', 'pipe:1',
      '-nostats',
      outputPath
    ]

    onProgress?.({
      percent: Math.round((index / total) * 100),
      line: `Preparando parte ${index + 1} de ${total}...`
    })
    await runConversion({
      ffmpegPath,
      args,
      durationSeconds: length,
      onProgress: (progress) => onProgress?.({
        percent: Math.round(((index + (Number(progress.percent) || 0) / 100) / total) * 100),
        line: `Parte ${index + 1}/${total} — ${Math.round(Number(progress.percent) || 0)}%`
      })
    })
    outputPaths.push(outputPath)
  }

  return {
    outputPaths,
    outputFolder: path.dirname(outputPaths[0]),
    commandPreview: `Dividido em ${total} partes com ffmpeg.`
  }
}

async function detectCapabilities(context) {
  return getCapabilities(context)
}

async function convert(payload, context, onProgress) {
  const ffmpegPath = getFfmpegPath(context)
  if (!ffmpegPath) {
    throw new Error('ffmpeg.exe nao foi encontrado em bin/ ou DownloadsYT/.')
  }

  if (!fileExists(payload.inputPath)) {
    throw new Error('Arquivo de origem nao encontrado.')
  }

  const durationSeconds = Number(payload.duration) || 0
  if (Number(payload.splitParts) > 0) {
    return splitMedia(payload, context, onProgress, durationSeconds)
  }

  const { args, outputPath } = buildCommand(payload)
  await runConversion({
    ffmpegPath,
    args,
    durationSeconds,
    onProgress
  })

  return {
    outputPath,
    outputFolder: path.dirname(outputPath),
    commandPreview: `${ffmpegPath} ${args.join(' ')}`
  }
}

module.exports = {
  convert,
  detectCapabilities,
  previewConversion
}
