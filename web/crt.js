// Optional post-process. The game and touch controls keep their native coordinates.
const crt=(()=>{
  const screen=document.getElementById('screen');
  const output=document.getElementById('crt-screen');
  const toggle=document.getElementById('crt-toggle');
  let gl,textureSize,outputSize,maskStrength,ready=false;
  let glLimit,lastVersion=null;
  let inputWidth=0,inputHeight=0,cssWidth=0,cssHeight=0;
  const bend=0.052;
  const measure=()=>{
    const rect=screen.getBoundingClientRect();
    cssWidth=rect.width;cssHeight=rect.height;
    if(globalThis.display?.gpu || (ready && toggle.checked))draw();
  };
  if(typeof ResizeObserver==='function')new ResizeObserver(measure).observe(screen);
  window.addEventListener('resize',measure);
  function sourcePoint(u,v){
    if(!toggle.checked||(!ready && !globalThis.display?.gpu))return [u,v];
    const x=u*2-1,y=v*2-1;
    return [(1+x*(1+bend*y*y*(1-x*x)))/2,(1+y*(1+bend*x*x*(1-y*y)))/2];
  }
  const vertex='attribute vec2 p; varying vec2 uv; void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const fragment=`precision highp float;
    varying vec2 uv;
    uniform sampler2D picture;
    uniform vec2 size, raster;
    uniform float maskAmount;
    // Reconstruct one horizontal beam in linear light from two adjacent texels.
    vec3 line(vec2 cell,float t){
      vec2 at=(cell+0.5)/size;
      vec3 a=texture2D(picture,at).rgb,b=texture2D(picture,at+vec2(1.0/size.x,0.0)).rgb;
      return mix(a*a,b*b,smoothstep(0.0,1.0,t));
    }
    vec3 beam(vec3 light,float distanceY){
      float luminance=dot(light,vec3(0.213,0.715,0.072));
      float width=0.29+0.15*sqrt(luminance);
      float resolved=smoothstep(1.3,2.7,raster.y/size.y);
      float gaussian=exp(-0.5*distanceY*distanceY/(width*width))/(2.5066*width);
      return light*mix(1.0-distanceY,gaussian,resolved);
    }
    void main(){
      vec2 edge=uv*2.0-1.0;
      vec2 glass=edge*(1.0+${bend}*edge.yx*edge.yx*(1.0-edge*edge));
      vec2 pixel=(glass*0.5+0.5)*size-0.5, cell=floor(pixel), t=fract(pixel);
      vec3 emission=beam(line(cell,t.x),t.y)+beam(line(cell+vec2(0,1),t.x),1.0-t.y);
      // A stationary RGB aperture grille aligned to output columns.
      float column=mod(floor(gl_FragCoord.x),3.0);
      vec3 phosphor=1.0-step(vec3(0.5),abs(vec3(0.,1.,2.)-column));
      emission*=mix(vec3(1.0),vec3(0.89)+0.33*phosphor,maskAmount);
      emission*=1.0-0.07*dot(edge*edge,edge*edge);
      gl_FragColor=vec4(sqrt(max(emission,vec3(0.0))),1.0);
    }`;
  function initialize(){
    gl=output.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',failIfMajorPerformanceCaveat:true});
    if(!gl)throw Error('WebGL unavailable');
    const program=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=gl.createShader(type);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);textureSize=gl.getUniformLocation(program,'size');
    outputSize=gl.getUniformLocation(program,'raster');maskStrength=gl.getUniformLocation(program,'maskAmount');
    inputWidth=inputHeight=0;lastVersion=null;
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,'p');
    gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.NEAREST);
    glLimit=Math.min(...gl.getParameter(gl.MAX_VIEWPORT_DIMS),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    ready=true;
  }
  function draw(){
    const gpu=globalThis.display?.gpu;
    if(gpu){
      output.hidden=true;
      try{gpu.configure(toggle.checked?fragment:null,cssWidth,cssHeight,window.devicePixelRatio||1);}
      catch(e){console.warn('CRT:',e);toggle.checked=false;gpu.configure(null,cssWidth,cssHeight,window.devicePixelRatio||1);}
      return;
    }
    if(!toggle.checked||!ready)return;
    const w=screen.width,h=screen.height;
    const dpr=window.devicePixelRatio||1;
    const physicalW=Math.max(1,Math.round(cssWidth*dpr)),physicalH=Math.max(1,Math.round(cssHeight*dpr));
    const scale=Math.min(1,Math.sqrt(2800000/(physicalW*physicalH)),glLimit/physicalW,glLimit/physicalH);
    const rw=Math.max(1,Math.round(physicalW*scale)),rh=Math.max(1,Math.round(physicalH*scale));
    const version=globalThis.display?.presentationVersion;
    const resized=output.width!==rw||output.height!==rh;
    if(!resized && inputWidth===w && inputHeight===h && version!==undefined && version===lastVersion)return;
    if(resized){output.width=rw;output.height=rh;}
    if(inputWidth!==w||inputHeight!==h){
      inputWidth=w;inputHeight=h;
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.uniform2f(textureSize,w,h);
    }
    gl.viewport(0,0,rw,rh);gl.uniform2f(outputSize,rw,rh);
    gl.uniform1f(maskStrength,Math.max(0,Math.min(1,(rw/w-1.4)/1.4))*Math.max(0,(scale-0.8)*5));
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,screen);
    gl.drawArrays(gl.TRIANGLES,0,3);lastVersion=version;
  }
  function apply(){
    if(!globalThis.display?.enabled){output.hidden=true;return;}
    if(globalThis.display.gpu){toggle.disabled=false;toggle.title='';measure();return;}
    if(toggle.checked&&!ready){
      try{initialize();}catch(error){
        console.warn('CRT:',error);toggle.checked=false;toggle.disabled=true;
        toggle.title='เบราว์เซอร์ไม่เปิด WebGL ที่เร่งด้วยฮาร์ดแวร์';
      }
    }
    output.hidden=!toggle.checked;lastVersion=null;if(toggle.checked)measure();
  }
  output.addEventListener('webglcontextlost',event=>{
    event.preventDefault();ready=false;output.hidden=true;
  });
  output.addEventListener('webglcontextrestored',()=>{output.width=1;apply();});
  try{toggle.checked=localStorage.getItem('bs2.crt')==='1';}catch{}
  toggle.addEventListener('change',()=>{
    apply();try{localStorage.setItem('bs2.crt',toggle.checked?'1':'0');}catch{}
  });
  apply();return {draw,sourcePoint,apply};
})();
