// Present the native RGSS frame. The virtual subpixel grid is sampled only at
// visible output pixels, including when a 32x image would exceed texture limits.
(function (VX) {
  'use strict';
  const bend = 0.052;
  const pixelBudget = 2800000;

  function screenContext(output, alpha, allowSoftware = false) {
    const gl = output.getContext('webgl', {alpha, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: !allowSoftware});
    if (!gl || gl.isContextLost()) throw Error('เบราว์เซอร์ไม่เปิด WebGL ที่เร่งด้วยฮาร์ดแวร์');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const device = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const software = /swiftshader|llvmpipe|softpipe|software rasterizer|basic render driver|lavapipe/i.test(device);
    if (software && !allowSoftware) throw Error('เบราว์เซอร์ให้ใช้ได้เฉพาะตัววาดแบบซอฟต์แวร์');
    return {gl, device, software};
  }

  function linkProgram(gl, vertex, fragment, attributes) {
    const program = gl.createProgram();
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      attributes.forEach((name, index) => gl.bindAttribLocation(program, index, name));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) || 'WebGL shader link failed');
      return program;
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    }
  }

  const pixelFilter = `
    vec4 texel(vec2 cell) { return texture2D(picture, (cell + 0.5) / size); }
    float difference(vec4 a, vec4 b) {
      vec4 d = abs(a - b);
      return max(max(d.r, d.g), max(d.b, d.a));
    }
    vec4 upscaleAt(vec2 point) {
      vec2 cell = floor(point);
      vec2 offset = fract(point) - 0.5;
      vec2 side = sign(offset) * step(vec2(0.00005), abs(offset));
      vec2 subcell = min(floor(abs(offset) * factor), vec2(factor * 0.5 - 1.0));
      vec2 local = side * (subcell + 0.5) / factor;
      vec4 center = texel(cell);
      vec4 x = texel(cell + vec2(side.x, 0.0)), y = texel(cell + vec2(0.0, side.y));
      float contrast = min(difference(center, x), difference(center, y));
      if (contrast < 0.03) return center;
      // Round a corner only if the neighbours agree and both opposite edges continue.
      float matchWeight = 1.0 - smoothstep(0.15, 0.60, difference(x, y) / contrast);
      if (matchWeight <= 0.0) return center;
      vec4 oppositeX = texel(cell - vec2(side.x, 0.0)), oppositeY = texel(cell - vec2(0.0, side.y));
      float separation = min(difference(x, oppositeX), difference(y, oppositeY)) / contrast;
      float footprint = clamp(0.5 * (size.x / raster.x + size.y / raster.y), 0.04, 0.45);
      float coverage = smoothstep(0.55 - footprint, 0.55 + footprint, abs(local.x) + abs(local.y));
      return mix(center, (x + y) * 0.5, matchWeight * smoothstep(0.10, 0.60, separation) * coverage);
    }`;
  const crtFilter = `
    vec3 line(vec2 cell, float t) {
      vec2 at = (cell + 0.5) / size;
      vec3 a = texture2D(picture, at).rgb, b = texture2D(picture, at + vec2(1.0 / size.x, 0.0)).rgb;
      return mix(a*a, b*b, smoothstep(0.0, 1.0, t));
    }
    vec3 beam(vec3 light, float distanceY) {
      float width = 0.29 + 0.15 * sqrt(dot(light, vec3(0.213, 0.715, 0.072)));
      float resolved = smoothstep(1.3, 2.7, raster.y / size.y);
      float gaussian = exp(-0.5 * distanceY * distanceY / (width*width)) / (2.5066 * width);
      return light * mix(1.0 - distanceY, gaussian, resolved);
    }`;
  function fragment(crt, upscale, precision) {
    const header = `precision ${precision} float; varying ${precision} vec2 uv;
      uniform sampler2D picture; uniform vec2 size, raster; uniform float maskAmount, factor;`;
    if (!crt && !upscale) return header + 'void main() { gl_FragColor = texture2D(picture, uv); }';
    if (!crt) return header + pixelFilter + 'void main() { gl_FragColor = upscaleAt(uv * size); }';
    const light = upscale ? `
      vec3 color = upscaleAt(point).rgb; vec3 light = color * color;
      vec3 emission = beam(light, t.y) + beam(light, 1.0 - t.y);` : `
      vec2 cell = floor(point - 0.5);
      vec3 emission = beam(line(cell, t.x), t.y) + beam(line(cell + vec2(0, 1), t.x), 1.0 - t.y);`;
    return header + (upscale ? pixelFilter : '') + crtFilter + `
      void main() {
        vec2 edge = uv * 2.0 - 1.0;
        vec2 glass = edge * (1.0 + ${bend} * edge.yx * edge.yx * (1.0 - edge*edge));
        vec2 point = (glass * 0.5 + 0.5) * size, t = fract(point - 0.5);
        ${light}
        float column = mod(floor(gl_FragCoord.x), 3.0);
        vec3 phosphor = 1.0 - step(vec3(0.5), abs(vec3(0., 1., 2.) - column));
        emission *= mix(vec3(1.0), vec3(0.89) + 0.33 * phosphor, maskAmount);
        emission *= 1.0 - 0.07 * dot(edge*edge, edge*edge);
        gl_FragColor = vec4(sqrt(max(emission, vec3(0.0))), 1.0);
      }`;
  }

  class ScreenFilter {
    static sourcePoint(u, v) {
      const x = u * 2 - 1, y = v * 2 - 1;
      return [(1 + x * (1 + bend*y*y*(1-x*x))) / 2, (1 + y * (1 + bend*x*x*(1-y*y))) / 2];
    }
    static raster(w, h, factor, crt, cssW, cssH, dpr, limit) {
      if (!crt && factor === 1) return {w, h, scale: 1};
      const pw = Math.max(1, Math.round((cssW || w) * dpr)), ph = Math.max(1, Math.round((cssH || h) * dpr));
      let targetW = pw, targetH = ph;
      if (!crt) {
        const zoom = Math.min(factor, pw / w, ph / h);
        targetW = Math.max(1, Math.round(w * zoom)); targetH = Math.max(1, Math.round(h * zoom));
      }
      const scale = Math.min(1, Math.sqrt(pixelBudget / (targetW*targetH)), limit / targetW, limit / targetH);
      return {w: Math.max(1, Math.floor(targetW * scale)), h: Math.max(1, Math.floor(targetH * scale)), scale};
    }
    constructor(gl, output) {
      this.gl = gl; this.output = output; this.programs = new Map();
      this.limit = Math.min(...gl.getParameter(gl.MAX_VIEWPORT_DIMS), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      this.precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ? 'highp' : 'mediump';
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      this.configure(false, 1, 0, 0, 1);
    }
    configure(crt, factor, cssW, cssH, dpr) {
      if (this.crt === crt && this.factor === factor && this.cssW === cssW && this.cssH === cssH && this.dpr === dpr) return false;
      const key = (crt ? 2 : 0) + (factor > 1 ? 1 : 0);
      if (!this.programs.has(key)) {
        const vertex = `attribute vec2 p; varying ${this.precision} vec2 uv;
          void main() { uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;
        const gl = this.gl, program = linkProgram(gl, vertex, fragment(crt, factor > 1, this.precision), ['p']);
        const locations = {program};
        for (const name of ['size', 'raster', 'maskAmount', 'factor']) locations[name] = gl.getUniformLocation(program, name);
        this.programs.set(key, locations);
      }
      this.active = this.programs.get(key);
      Object.assign(this, {crt, factor, cssW, cssH, dpr, dirty: true});
      return true;
    }
    draw(texture, width, height, version) {
      const changed = this.dirty || this.width !== width || this.height !== height;
      if (!changed && this.version === version) return;
      if (changed) {
        this.target = ScreenFilter.raster(width, height, this.factor, this.crt, this.cssW, this.cssH, this.dpr, this.limit);
        if (this.output.width !== this.target.w) this.output.width = this.target.w;
        if (this.output.height !== this.target.h) this.output.height = this.target.h;
      }
      const gl = this.gl, p = this.active, {w, h, scale} = this.target;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND); gl.useProgram(p.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (changed && (this.crt || this.factor > 1)) {
        gl.uniform2f(p.size, width, height); gl.uniform2f(p.raster, w, h);
        if (this.factor > 1) gl.uniform1f(p.factor, this.factor);
        if (this.crt) gl.uniform1f(p.maskAmount, Math.max(0, Math.min(1, (w / width - 1.4) / 1.4)) * Math.max(0, (scale - 0.8) * 5));
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.width = width; this.height = height; this.version = version; this.dirty = false;
    }
    dispose() {
      for (const {program} of this.programs.values()) this.gl.deleteProgram(program);
      this.gl.deleteBuffer(this.buffer); this.programs.clear();
    }
  }
  VX.screenContext = screenContext;
  VX.linkGlProgram = linkProgram;
  VX.ScreenFilter = ScreenFilter;
})(globalThis.VX);
