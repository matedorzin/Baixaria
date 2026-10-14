function formatBytes(bytes) {
  if (!bytes) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDuration(seconds) {
  if (!seconds) {
    return '-'
  }

  const total = Math.round(Number(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':')
  }

  return [m, s].map((part) => String(part).padStart(2, '0')).join(':')
}

function formatBitrate(bitrate) {
  if (!bitrate) {
    return '-'
  }

  const kbps = Number(bitrate) / 1000
  return `${Math.round(kbps)} kbps`
}

function formatFps(fps) {
  if (!fps) {
    return '-'
  }

  return `${Number(fps).toFixed(2)} fps`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderMediaInfoCard(mediaInfo) {
  if (!mediaInfo) {
    return ''
  }

  return `
    <div class="card">
      <div class="section-title">Informacoes detectadas</div>
      <div class="inline-actions" style="margin-bottom:12px;">
        <span class="pill">Tipo: ${mediaInfo.type === 'video' ? 'Video' : 'Audio'}</span>
        <span class="pill">Container: ${escapeHtml(mediaInfo.container || '-')}</span>
        ${mediaInfo.videoCodec ? `<span class="pill">Codec video: ${escapeHtml(mediaInfo.videoCodec)}</span>` : ''}
        ${mediaInfo.audioCodec ? `<span class="pill">Codec audio: ${escapeHtml(mediaInfo.audioCodec)}</span>` : ''}
      </div>
      <div class="info-grid three">
        <div class="info-card">
          <div class="info-label">Arquivo</div>
          <div class="info-value">${escapeHtml(mediaInfo.fileName)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Duracao</div>
          <div class="info-value">${formatDuration(mediaInfo.duration)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Tamanho</div>
          <div class="info-value">${formatBytes(mediaInfo.size)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Bitrate</div>
          <div class="info-value">${formatBitrate(mediaInfo.bitrate)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Resolucao</div>
          <div class="info-value">${mediaInfo.hasVideo ? escapeHtml(mediaInfo.resolution || '-') : '-'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">FPS</div>
          <div class="info-value">${mediaInfo.hasVideo ? formatFps(mediaInfo.fps) : '-'}</div>
        </div>
      </div>
    </div>
  `
}
