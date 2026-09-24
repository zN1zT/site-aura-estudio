/* shader-bg.js — fundo WebGL2 animado, sem dependência, sem build.
   Uso:
     <canvas id="bg"></canvas>
     <script src="shader-bg.js"></script>
     <script>shaderBG('#bg',{preset:'liquid',colors:['#2B1B12','#C2764A','#14120F','#E9B58C'],speed:.06})</script>
   Presets: 'liquid' | 'aurora' | 'mesh' | 'grain'
   Cai para um gradiente CSS se não houver WebGL2 ou se o usuário pedir menos movimento. */
function shaderBG(sel, opt) {
  opt = opt || {};
  var cv = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!cv) return null;
  var colors = opt.colors || ['#0B1020', '#3B5BDB', '#0B1020', '#8AB4FF'];
  var speed = opt.speed == null ? 0.06 : opt.speed;
  var preset = opt.preset || 'liquid';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) {
    cv.style.background = 'linear-gradient(140deg,' + colors[1] + ',' + colors[0] + ')';
    return null;
  }

  var FIELD = {
    liquid: [
      'vec2 w=vec2(fbm(q+vec2(0.,t)),fbm(q+vec2(5.2,1.3-t)));',
      'vec2 r=vec2(fbm(q+4.*w+vec2(1.7,9.2)+t*.5),fbm(q+4.*w+vec2(8.3,2.8)-t*.5));',
      'float f=fbm(q+4.*r);',
      'vec3 col=mix(c1,c2,clamp(f*2.4+.4,0.,1.));',
      'col=mix(col,c3,clamp(length(r)*1.1,0.,1.));',
      'col=mix(col,c4,clamp(w.x*1.6,0.,1.));'
    ].join('\n'),
    aurora: [
      'float band=fbm(vec2(q.x*.8,q.y*2.2+t*1.2));',
      'float m=smoothstep(.0,.9,1.-abs(uv.y-.52+band*.30)*3.4);',
      'float m2=smoothstep(.0,.9,1.-abs(uv.y-.34+band*.44)*4.6);',
      'vec3 col=mix(c1,c2,m);',
      'col=mix(col,c4,m2*.75);',
      'col=mix(col,c3,clamp(uv.y*1.15-.18,0.,1.));'
    ].join('\n'),
    mesh: [
      'float a=fbm(q*.85+vec2(t*.8,0.));',
      'float b=fbm(q*.95+vec2(-t*.6,3.1));',
      'float d=fbm(q*.75+vec2(2.3,-t*.45));',
      'vec3 col=c1;',
      'col=mix(col,c2,smoothstep(.10,.75,a*1.7+.5));',
      'col=mix(col,c3,smoothstep(.20,.85,b*1.7+.5));',
      'col=mix(col,c4,smoothstep(.35,.95,d*1.7+.5));'
    ].join('\n'),
    grain: [
      'float f=fbm(q*1.1+vec2(t*.35,-t*.2));',
      'vec3 col=mix(c1,c2,smoothstep(.15,.9,f*1.5+.5));',
      'col=mix(col,c3,smoothstep(.55,1.,length(uv-.5)*1.5));',
      'col=mix(col,c4,smoothstep(.62,.88,f*1.5+.5)*.35);'
    ].join('\n')
  };

  var VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FS = '#version 300 es\n' +
    'precision highp float;out vec4 o;uniform vec2 u_res;uniform float u_t;uniform vec3 c1,c2,c3,c4;\n' +
    'vec2 h(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453123);}\n' +
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);\n' +
    ' return mix(mix(dot(h(i),f),dot(h(i+vec2(1,0)),f-vec2(1,0)),u.x),\n' +
    '            mix(dot(h(i+vec2(0,1)),f-vec2(0,1)),dot(h(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}\n' +
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.02;a*=.5;}return v;}\n' +
    'void main(){vec2 uv=gl_FragCoord.xy/u_res.xy;vec2 q=uv*1.6;float t=u_t;\n' +
    (FIELD[preset] || FIELD.liquid) + '\n' +
    ' col*=1.-.38*length(uv-.5);\n' +
    ' float g=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);\n' +
    ' col+=(g-.5)*.035;o=vec4(col,1.);}';

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('shaderBG:', gl.getShaderInfoLog(s));
    return s;
  }
  var pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr); gl.useProgram(pr);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = function (n) { return gl.getUniformLocation(pr, n); };
  var uRes = U('u_res'), uT = U('u_t');
  var hex = function (s) { return [1, 3, 5].map(function (i) { return parseInt(s.substr(i, 2), 16) / 255; }); };
  ['c1', 'c2', 'c3', 'c4'].forEach(function (k, i) { gl.uniform3fv(U(k), hex(colors[i] || colors[0])); });

  function size() {
    var d = Math.min(devicePixelRatio || 1, 1.6);
    cv.width = (cv.clientWidth || innerWidth) * d | 0;
    cv.height = (cv.clientHeight || innerHeight) * d | 0;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(uRes, cv.width, cv.height);
  }
  addEventListener('resize', size); size();

  var t0 = performance.now(), raf = null, running = true;
  function frame(now) {
    gl.uniform1f(uT, (now - t0) / 1000 * speed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (running && !reduce) raf = requestAnimationFrame(frame);
  }
  frame(t0);

  // pausa fora da tela e com a aba escondida — não esquenta o celular
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!reduce) { running = true; t0 = performance.now() - 1; requestAnimationFrame(frame); }
  });

  return { stop: function () { running = false; cancelAnimationFrame(raf); } };
}
