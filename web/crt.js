// Presentation settings never change the game's logical resolution or input areas.
const crt = (() => {
  const screen = document.getElementById('screen');
  const output = document.getElementById('crt-screen');
  const scaled = document.getElementById('scale-screen');
  const toggle = document.getElementById('crt-toggle');
  const selector = document.getElementById('upscale');
  const status = document.getElementById('filter-status');
  let factor = 1, cssW = 0, cssH = 0, dpr = 1, activeCrt = false;
  let mode = 'native', unavailable = false, post = null;
  let fallbackCtx, fallbackVersion, fallbackW, fallbackH;
  let notice = '', reportedW, reportedH, reportedNotice;

  function reportOutput(w, h) {
    if (factor === 1 && !activeCrt) { w = 0; h = 0; }
    if (reportedW === w && reportedH === h && reportedNotice === notice) return;
    reportedW = w; reportedH = h; reportedNotice = notice;
    const size = w && h ? 'ภาพที่แสดง ' + w + ' × ' + h + ' พิกเซล' : '';
    status.textContent = [size, notice].filter(Boolean).join(' · ');
    status.hidden = !status.textContent;
  }

  function openPost() {
    const {gl} = VX.screenContext(output, false);
    const presenter = new VX.ScreenFilter(gl, output), texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    return {gl, presenter, texture, width: 0, height: 0};
  }
  function closePost() {
    if (!post) return;
    if (!post.gl.isContextLost()) { post.presenter.dispose(); post.gl.deleteTexture(post.texture); }
    post = null; output.width = output.height = 1;
  }
  function draw() {
    const display = globalThis.display;
    if (!display?.enabled) return;
    if (dpr !== (window.devicePixelRatio || 1)) { apply(); return; }
    const version = display.presentationVersion, w = screen.width, h = screen.height;
    if (mode === 'post') {
      const {gl, texture, presenter} = post;
      const resized = post.width !== w || post.height !== h;
      if (resized || post.version !== version) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (resized) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen);
        else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, screen);
        post.width = w; post.height = h; post.version = version;
      }
      presenter.draw(texture, w, h, version);
      reportOutput(presenter.target.w, presenter.target.h);
    } else if (mode === 'canvas') {
      if (fallbackVersion === version && fallbackW === w && fallbackH === h) return;
      const target = VX.ScreenFilter.raster(w, h, factor, false, cssW, cssH, dpr, 4096);
      if (scaled.width !== target.w) scaled.width = target.w;
      if (scaled.height !== target.h) scaled.height = target.h;
      fallbackCtx ||= scaled.getContext('2d', {alpha: false});
      fallbackCtx.globalCompositeOperation = 'copy';
      fallbackCtx.imageSmoothingEnabled = true;
      fallbackCtx.imageSmoothingQuality = 'high';
      fallbackCtx.drawImage(screen, 0, 0, target.w, target.h);
      fallbackVersion = version; fallbackW = w; fallbackH = h;
      reportOutput(target.w, target.h);
    } else {
      const target = display.gpu?.presenter.target;
      reportOutput(target?.w || 0, target?.h || 0);
    }
  }
  function apply() {
    const display = globalThis.display;
    if (!display?.enabled) return;
    const gpu = display.gpu;
    notice = '';
    dpr = window.devicePixelRatio || 1;
    activeCrt = false; mode = 'native';
    if (gpu) {
      closePost();
      try {
        gpu.configure(toggle.checked, factor, cssW, cssH, dpr);
        activeCrt = toggle.checked;
      } catch (error) {
        console.warn('Screen filter:', error);
        gpu.configure(false, 1, cssW, cssH, dpr);
        notice = 'อุปกรณ์นี้ใช้ฟิลเตอร์ที่เลือกไม่ได้ กำลังแสดงภาพต้นฉบับ';
      }
    } else if (factor > 1 || toggle.checked) {
      if (!unavailable) {
        try {
          post ||= openPost();
          post.presenter.configure(toggle.checked, factor, cssW, cssH, dpr);
          mode = 'post'; activeCrt = toggle.checked;
        } catch (error) { console.warn('Screen filter:', error); unavailable = true; closePost(); }
      }
      if (unavailable) {
        if (factor > 1) { mode = 'canvas'; notice = 'ใช้การปรับขนาดแบบ Canvas 2D'; }
        if (toggle.checked) notice += (notice ? ' · ' : '') + 'CRT ใช้ไม่ได้บนอุปกรณ์นี้';
      }
    } else closePost();
    toggle.disabled = !gpu && unavailable && !toggle.checked;
    toggle.title = toggle.disabled ? 'อุปกรณ์นี้เปิด WebGL ไม่ได้' : '';
    output.hidden = mode !== 'post';
    scaled.hidden = mode !== 'canvas';
    if (scaled.hidden && (scaled.width !== 1 || scaled.height !== 1)) scaled.width = scaled.height = 1;
    fallbackVersion = undefined;
    draw();
  }
  function measure() {
    const rect = screen.getBoundingClientRect();
    if (cssW === rect.width && cssH === rect.height && dpr === (window.devicePixelRatio || 1)) return;
    cssW = rect.width; cssH = rect.height; apply();
  }
  output.addEventListener('webglcontextlost', event => {
    event.preventDefault(); unavailable = true; closePost(); apply();
  });
  output.addEventListener('webglcontextrestored', () => { unavailable = false; apply(); });
  try {
    toggle.checked = localStorage.getItem('bs2.crt') === '1';
    const saved = localStorage.getItem('bs2.upscale');
    if ([...selector.options].some(option => option.value === saved)) selector.value = saved;
  } catch { /* Settings last for the current session. */ }
  factor = Number(selector.value);
  selector.addEventListener('change', () => {
    factor = Number(selector.value);
    try { localStorage.setItem('bs2.upscale', selector.value); } catch {}
    apply();
  });
  toggle.addEventListener('change', () => {
    try { localStorage.setItem('bs2.crt', toggle.checked ? '1' : '0'); } catch {}
    apply();
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(screen);
  window.addEventListener('resize', measure);
  measure();
  return {draw, apply, sourcePoint: (u, v) => activeCrt ? VX.ScreenFilter.sourcePoint(u, v) : [u, v]};
})();
