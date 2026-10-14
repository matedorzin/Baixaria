export function renderGifOptions(state) {
  return `
    <div class="card">
      <div class="section-title">Opcoes de GIF</div>
      <div class="row two">
        <div class="field">
          <label>FPS do GIF</label>
          <select id="gif-fps">
            <option value="10" ${state.gifFps === '10' ? 'selected' : ''}>10</option>
            <option value="15" ${state.gifFps === '15' ? 'selected' : ''}>15</option>
            <option value="24" ${state.gifFps === '24' ? 'selected' : ''}>24</option>
          </select>
        </div>
        <div class="field">
          <label>Largura</label>
          <select id="gif-width">
            <option value="original" ${state.gifWidth === 'original' ? 'selected' : ''}>Manter</option>
            <option value="720" ${state.gifWidth === '720' ? 'selected' : ''}>720</option>
            <option value="480" ${state.gifWidth === '480' ? 'selected' : ''}>480</option>
            <option value="320" ${state.gifWidth === '320' ? 'selected' : ''}>320</option>
          </select>
        </div>
      </div>

      <div class="row two">
        <div class="field">
          <label>Inicio do corte</label>
          <input type="text" id="gif-start" value="${state.gifStart}" placeholder="Ex.: 00:00:03 ou 3">
        </div>
        <div class="field">
          <label>Duracao do GIF</label>
          <input type="text" id="gif-duration" value="${state.gifDuration}" placeholder="Ex.: 4 ou 00:00:04">
        </div>
      </div>

      <label class="toggle-row" for="gif-loop">
        <input type="checkbox" id="gif-loop" ${state.gifLoop ? 'checked' : ''}>
        <span class="toggle-copy">
          <span class="toggle-title">Loop infinito</span>
          <span class="toggle-sub">Mantem o GIF repetindo para sempre.</span>
        </span>
      </label>
    </div>
  `
}
