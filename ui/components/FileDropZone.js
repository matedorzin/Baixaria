function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderFileDropZone({ selectedFileName = '', thumbnail = '', aspect = 'landscape' } = {}) {
  return `
    <div class="card">
      <div class="section-title">Arquivo de origem</div>
      <div class="drop-zone ${selectedFileName ? 'has-file' : ''}" id="convert-drop-zone" role="button" tabindex="0" aria-label="Arraste um vídeo ou áudio aqui ou clique para escolher arquivo">
        <div class="drop-copy">
          ${thumbnail ? `<img class="drop-thumbnail ${aspect === 'portrait' ? 'portrait' : aspect === 'square' ? 'square' : 'landscape'}" src="${thumbnail}" alt="Prévia do vídeo escolhido">` : `<div class="drop-icon"><img class="raster-icon" src="./assets/ui/video.png" alt=""></div>`}
          <div class="drop-title">Arraste um vídeo ou áudio aqui ou clique para escolher arquivo</div>
          ${selectedFileName ? `<div class="selected-file" title="${escapeHtml(selectedFileName)}">${escapeHtml(selectedFileName)}</div>` : ''}
        </div>
      </div>
    </div>
  `
}
