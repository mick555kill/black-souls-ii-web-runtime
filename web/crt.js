// Optional post-process. The game and touch controls keep their native coordinates.
const crt=(()=>{
  const screen=document.getElementById('screen');
  const output=document.getElementById('crt-screen');
  const toggle=document.getElementById('crt-toggle');
  let gl,textureSize,ready=false;
  const vertex='attribute vec2 p; varying vec2 uv; void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const fragment=`precision mediump float;
    varying vec2 uv;
    uniform sampler2D picture;
    uniform vec2 size;
    void main(){
      vec3 color=texture2D(picture,uv).rgb;
      float scan=0.91+0.09*sin(6.2831853*uv.y*size.y);
      vec2 edge=2.0*uv-1.0;
      float vignette=1.0-0.12*dot(edge*edge,edge*edge);
      gl_FragColor=vec4(color*scan*vignette,1.0);
    }`;
  function initialize(){
    gl=output.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false});
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
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,'p');
    gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.NEAREST);
    ready=true;
  }
  function draw(){
    if(!toggle.checked||!ready)return;
    const w=screen.width,h=screen.height;
    if(output.width!==2*w||output.height!==2*h){
      output.width=2*w;output.height=2*h;gl.viewport(0,0,output.width,output.height);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.uniform2f(textureSize,w,h);
    }
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,screen);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  function apply(){
    if(toggle.checked&&!ready){
      try{initialize();}catch(error){
        console.warn('CRT:',error);toggle.checked=false;toggle.disabled=true;
        toggle.parentElement.append(' (WebGL ใช้งานไม่ได้)');
      }
    }
    output.hidden=!toggle.checked;draw();
  }
  output.addEventListener('webglcontextlost',event=>{
    event.preventDefault();ready=false;output.hidden=true;
  });
  output.addEventListener('webglcontextrestored',()=>{output.width=1;apply();});
  try{toggle.checked=localStorage.getItem('bs2.crt')==='1';}catch{}
  toggle.addEventListener('change',()=>{
    apply();try{localStorage.setItem('bs2.crt',toggle.checked?'1':'0');}catch{}
  });
  apply();return {draw};
})();
