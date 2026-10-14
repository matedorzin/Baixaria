export function renderFileDropZone({ selectedFileName = '' } = {}) {
  return `
    <div class="card">
      <div class="section-title">Arquivo de origem</div>
      <div class="drop-zone" id="convert-drop-zone">
        <div class="drop-copy">
          <div class="drop-icon">↻</div>
          <div class="drop-title">Arraste um video ou audio aqui</div>
          <div class="drop-sub">
            Solte o arquivo dentro desta area ou use o botao abaixo para abrir o explorador.
          </div>
          <div class="inline-actions" style="margin-top:16px;">
            <button class="secondary-btn" id="pick-media-btn" type="button">Escolher arquivo</button>
          </div>
          ${selectedFileName ? `<div class="selected-file">${selectedFileName}</div>` : ''}
        </div>
      </div>
    </div>
  `
}
