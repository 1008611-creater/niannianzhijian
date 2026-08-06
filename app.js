const fluidCanvas = document.querySelector("#fluidCanvas");
const fluidPreviewEnabled = new URLSearchParams(window.location.search).get("fluidPreview") === "1";
const sparseGoldPreviewEnabled = new URLSearchParams(window.location.search).get("sparseGoldPreview") === "1";
const layeredGoldPreviewEnabled = new URLSearchParams(window.location.search).get("layeredGoldPreview") === "1";
const balancedGoldPreviewEnabled = new URLSearchParams(window.location.search).get("balancedGoldPreview") === "1";
const distributedGoldPreviewEnabled = new URLSearchParams(window.location.search).get("distributedGoldPreview") === "1";
const pureBlackGoldPreviewEnabled = new URLSearchParams(window.location.search).get("pureBlackGoldPreview") === "1";
const mixedGoldFlowPreviewEnabled = new URLSearchParams(window.location.search).get("mixedGoldFlowPreview") === "1";
const leanBrightGoldPreviewEnabled = new URLSearchParams(window.location.search).get("leanBrightGoldPreview") === "1";
const refinedGoldFlowPreviewEnabled = new URLSearchParams(window.location.search).get("refinedGoldFlowPreview") === "1";
const layeredDepthGoldPreviewEnabled = new URLSearchParams(window.location.search).get("layeredDepthGoldPreview") === "1";
const heroPanel = document.querySelector('.hero[data-view-panel="home"]');
const navigationItems = [...document.querySelectorAll("[data-view]")];
const navigationTabs = [...document.querySelectorAll(".nav-item")];
const viewPanels = [...document.querySelectorAll("[data-view-panel]")];
const modalBackdrop = document.querySelector("#modalBackdrop");
const modalClose = document.querySelector("#modalClose");
const modalTitle = document.querySelector("#modalTitle");
const modalCopy = document.querySelector("#modalCopy");
const modalKicker = document.querySelector("#modalKicker");
const modalInput = document.querySelector("#modalInput");
const modalPasswordField = document.querySelector("#modalPasswordField");
const modalPassword = document.querySelector("#modalPassword");
const modalStatus = document.querySelector("#modalStatus");
const modalSubmit = document.querySelector("#modalSubmit");
const fieldLabel = document.querySelector("#fieldLabel");
const modalForm = document.querySelector("#modalForm");
const heroVerb = document.querySelector("#heroVerb");
const mobileMenuToggle = document.querySelector("#mobileMenuToggle");
const primaryNavigation = document.querySelector("#primaryNavigation");
const connectionStatus = document.querySelector("#connectionStatus");

let currentView = "home";
let showcaseFilmIndex = 0;
const serviceWorkerRelease = "20260807-local-auth-r1";
let fluidRenderer = null;

function updateConnectionStatus() {
  const offline = navigator.onLine === false;
  document.body.classList.toggle("is-offline", offline);
  if (!connectionStatus) return;
  connectionStatus.hidden = !offline;
  connectionStatus.textContent = offline
    ? "网络已中断。本地草稿仍会保留；项目状态将在恢复连接后更新。"
    : "";
}

function registerOfflineShell() {
  if (!("serviceWorker" in navigator)) return;
  const hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
  let controllerChangeHandled = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controllerChangeHandled) return;
    controllerChangeHandled = true;
    if (!hadServiceWorkerController) return;
    const reloadKey = "niannian:service-worker-controller:" + serviceWorkerRelease;
    try {
      if (window.sessionStorage.getItem(reloadKey) === "1") return;
      window.sessionStorage.setItem(reloadKey, "1");
    } catch {
      // Browsers that deny session storage still receive the fresh active worker once.
    }
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js?v=" + serviceWorkerRelease, { scope: "/" }).catch(() => {
      // The site remains fully usable online when a browser declines PWA installation.
    });
  }, { once: true });
}

const modalContent = {
  login: {
    kicker: "WELCOME BACK",
    title: "登录念念 AI",
    copy: "继续你的故事。",
    label: "邮箱",
    placeholder: "name@example.com",
    submit: "登录"
  },
  register: {
    kicker: "CREATE ACCOUNT",
    title: "注册念念 AI",
    copy: "把灵感变成第一支作品。",
    label: "邮箱",
    placeholder: "name@example.com",
    submit: "创建账户"
  },
  demo: {
    kicker: "BOOK A DEMO",
    title: "演示预约",
    copy: "留下联系方式，我们会尽快与你沟通。",
    label: "手机号",
    placeholder: "请输入手机号",
    submit: "提交预约"
  },
  enterprise: {
    kicker: "ENTERPRISE",
    title: "企业方案",
    copy: "为团队定制稳定的 AI 影像生产流程。",
    label: "公司与联系方式",
    placeholder: "公司名称 / 手机号",
    submit: "提交申请"
  },
  "new-project": {
    kicker: "NEW PROJECT",
    title: "创建项目",
    copy: "给你的新故事一个名字。",
    label: "项目名称",
    placeholder: "例如：月光便利店",
    submit: "进入创作空间"
  }
};

function setView(viewName, { syncHash = true, scroll = "preserve" } = {}) {
  if (viewName.startsWith("canvas")) {
    const legacyCanvasProject = String(viewName).match(/^canvas\/redraw\/([^/?#]+)/i);
    const projectId = legacyCanvasProject ? decodeURIComponent(legacyCanvasProject[1]) : "";
    window.location.replace(projectId ? "/studio/#/studio?projectId=" + encodeURIComponent(projectId) : "/studio/");
    return;
  }
  if (["showcase", "guide", "team"].includes(viewName)) {
    viewName = "workbench";
  }
  const panelName = viewName.startsWith("script/")
    ? "script-studio"
    : ((viewName.startsWith("redraw/") || viewName.startsWith("redraw-ledger/") || viewName.startsWith("redraw-story/") || viewName.startsWith("redraw-source-truth/")) ? "redraw-studio" : (viewName.startsWith("workbench") ? "workbench" : viewName));
  if (!viewPanels.some((panel) => panel.dataset.viewPanel === panelName)) return;

  const previousPanel = currentView.startsWith("script/")
    ? "script-studio"
    : ((currentView.startsWith("redraw/") || currentView.startsWith("redraw-ledger/") || currentView.startsWith("redraw-story/") || currentView.startsWith("redraw-source-truth/")) ? "redraw-studio" : currentView);
  currentView = viewName;
  viewPanels.forEach((panel) => {
    panel.classList.toggle("is-visible", panel.dataset.viewPanel === panelName);
  });
  document.body.classList.toggle("is-showcase-view", panelName === "showcase");
  navigationTabs.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === panelName);
  });
  closeMobileNavigation();

  if (syncHash && window.location.hash !== "#" + viewName) window.location.hash = viewName;
  if (scroll === "top" && previousPanel !== panelName) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    animateTopLevelView(panelName);
  }
  syncHeroRenderer();
}

function canPlayTopLevelMotion() {
  return Boolean(window.gsap) && !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateTopLevelView(panelName) {
  if (!canPlayTopLevelMotion()) return;
  const panel = viewPanels.find((item) => item.dataset.viewPanel === panelName);
  if (!panel) return;
  const targets = Array.from(panel.querySelectorAll(".hero-copy, .product-heading, .project-summary, .project-toolbar, .project-grid, .workbench-header, .workbench-deck, .page-heading, .showcase-grid, .guide-header, .guide-layout, .team-shell > *")).slice(0, 5);
  if (!targets.length) return;
  window.gsap.killTweensOf(targets);
  panel.classList.add("view-motion-active");
  window.gsap.set(targets, { autoAlpha: 0, y: 12 });
  window.gsap.timeline({ defaults: { ease: "power2.out" }, onComplete: () => panel.classList.remove("view-motion-active") })
    .to(targets, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.045 });
}

function canPlayHeroMotion() {
  return currentView === "home" && !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createFluidRenderer(canvas, palette = "default") {
  if (!canvas) return null;

  let frame = null;
  let running = false;
  let frames = 0;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, window.innerWidth <= 760 ? 1.2 : 1.6);
  const setState = state => {
    canvas.dataset.rendererState = state;
    canvas.dataset.rendererFrames = String(frames);
  };
  const resizeCanvas = () => {
    const bounds = canvas.getBoundingClientRect();
    const ratio = pixelRatio();
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };
  const createFallback = () => {
    const context = canvas.getContext("2d");
    if (!context) return null;
    return {
      renderer: "2d",
      resize: resizeCanvas,
      render(milliseconds) {
        const width = canvas.width;
        const height = canvas.height;
        if (palette === "distributed-gold") {
          const phase = milliseconds * 0.00042;
          context.fillStyle = "#070503";
          context.fillRect(0, 0, width, height);
          context.globalCompositeOperation = "screen";
          [[0.16, 0.28, 22], [0.48, 0.56, 30], [0.80, 0.76, 18]].forEach(([offset, yBase, lineWidth], index) => {
            context.beginPath();
            context.moveTo(-width * 0.08, height * (yBase + Math.sin(phase + offset) * 0.10));
            context.bezierCurveTo(width * 0.28, height * (0.12 + index * 0.24 + Math.cos(phase * 0.71 + offset) * 0.12), width * 0.64, height * (0.82 - index * 0.18 + Math.sin(phase * 0.83 + offset) * 0.10), width * 1.08, height * (yBase + Math.cos(phase + offset) * 0.11));
            context.strokeStyle = index === 1 ? "rgba(126,82,22,.20)" : "rgba(76,49,16,.15)";
            context.lineWidth = lineWidth * pixelRatio();
            context.stroke();
          });
          [[.08,.20,.20,.25],[.17,.73,.30,.68],[.37,.18,.46,.23],[.58,.78,.66,.72],[.72,.24,.83,.20],[.84,.72,.96,.66]].forEach(([x0,y0,x1,y1], index) => {
            const driftX = Math.sin(phase * .91 + index * 1.21) * width * .012;
            const driftY = Math.cos(phase * .83 + index * 1.37) * height * .016;
            context.beginPath();
            context.moveTo(width * x0 + driftX, height * y0 + driftY);
            context.quadraticCurveTo(width * ((x0 + x1) * .5), height * ((y0 + y1) * .5 + Math.sin(phase + index) * .025), width * x1 + driftX, height * y1 + driftY);
            context.strokeStyle = "rgba(105,54,3,.90)";
            context.lineWidth = 5 * pixelRatio();
            context.stroke();
            context.strokeStyle = "rgba(255,196,42,.96)";
            context.lineWidth = 2.2 * pixelRatio();
            context.stroke();
            context.strokeStyle = "rgba(255,246,186,.98)";
            context.lineWidth = .7 * pixelRatio();
            context.stroke();
          });
          context.globalCompositeOperation = "source-over";
          return;
        }
        if (palette === "balanced-gold") {
          const phase = milliseconds * 0.00042;
          context.fillStyle = "#050505";
          context.fillRect(0, 0, width, height);
          context.globalCompositeOperation = "screen";
          [[-0.07, 0.25, 20, "rgba(100,64,14,.20)"], [0.34, 0.67, 15, "rgba(89,55,11,.17)"]].forEach(([offset, yBase, lineWidth, color], index) => {
            context.beginPath();
            context.moveTo(index ? width * .58 : -width * .06, height * (yBase + Math.sin(phase + offset) * .05));
            context.bezierCurveTo(index ? width * .72 : width * .12, height * (yBase - .16), index ? width * .88 : width * .34, height * (yBase + .15), index ? width * 1.06 : width * .48, height * (yBase + Math.cos(phase + offset) * .05));
            context.strokeStyle = color;
            context.lineWidth = lineWidth * pixelRatio();
            context.stroke();
            context.strokeStyle = index ? "rgba(255,214,91,.74)" : "rgba(255,220,104,.82)";
            context.lineWidth = 2.4 * pixelRatio();
            context.stroke();
          });
          [[.12,.17],[.25,.34],[.31,.72],[.73,.20],[.85,.43],[.94,.77]].forEach(([baseX, baseY], index) => {
            const x = width * (baseX + Math.sin(phase * 1.08 + index * 1.37) * .012);
            const y = height * (baseY + Math.cos(phase * .93 + index * 1.11) * .016);
            context.fillStyle = "#7b3e03";
            context.beginPath(); context.ellipse(x, y, 3.5 * pixelRatio(), 2.1 * pixelRatio(), phase + index, 0, Math.PI * 2); context.fill();
            context.fillStyle = "#ffd65a";
            context.beginPath(); context.ellipse(x, y, 2.3 * pixelRatio(), 1.3 * pixelRatio(), phase + index, 0, Math.PI * 2); context.fill();
            context.fillStyle = "#fff3bd";
            context.beginPath(); context.ellipse(x, y, .9 * pixelRatio(), .55 * pixelRatio(), phase + index, 0, Math.PI * 2); context.fill();
          });
          context.globalCompositeOperation = "source-over";
          return;
        }
        if (palette === "layered-gold" || palette === "pure-black-gold" || palette === "layered-depth-gold") {
          const phase = milliseconds * 0.00042;
          context.fillStyle = "#070503";
          context.fillRect(0, 0, width, height);
          context.globalCompositeOperation = "screen";
          [[0.18, 0.34, 26], [0.48, 0.58, 38], [0.78, 0.76, 22]].forEach(([offset, yBase, lineWidth], index) => {
            context.beginPath();
            context.moveTo(-width * 0.08, height * (yBase + Math.sin(phase + offset) * 0.10));
            context.bezierCurveTo(
              width * 0.28, height * (0.12 + index * 0.24 + Math.cos(phase * 0.71 + offset) * 0.12),
              width * 0.64, height * (0.82 - index * 0.18 + Math.sin(phase * 0.83 + offset) * 0.10),
              width * 1.08, height * (yBase + Math.cos(phase + offset) * 0.11)
            );
            context.strokeStyle = index === 1 ? "rgba(153,101,28,.24)" : "rgba(91,60,20,.18)";
            context.lineWidth = lineWidth * pixelRatio();
            context.stroke();
          });
          if (palette === "pure-black-gold" || palette === "layered-depth-gold") {
            context.globalCompositeOperation = "source-over";
            return;
          }
          [[.82,.18],[.89,.34],[.94,.53],[.86,.71],[.96,.82]].forEach(([baseX, baseY], index) => {
            const x = width * (baseX + Math.sin(phase * 1.07 + index * 1.31) * .018);
            const y = height * (baseY + Math.cos(phase * .91 + index * 1.17) * .024);
            context.fillStyle = "#8b4c05";
            context.beginPath(); context.ellipse(x, y, 4.6 * pixelRatio(), 2.8 * pixelRatio(), phase + index, 0, Math.PI * 2); context.fill();
            context.fillStyle = "#ffd85f";
            context.beginPath(); context.ellipse(x, y, 3.1 * pixelRatio(), 1.8 * pixelRatio(), phase + index, 0, Math.PI * 2); context.fill();
            context.fillStyle = "#fff4bd";
            context.beginPath(); context.ellipse(x, y, 1.2 * pixelRatio(), .7 * pixelRatio(), phase + index, 0, Math.PI * 2); context.fill();
          });
          context.globalCompositeOperation = "source-over";
          return;
        }
        context.fillStyle = palette === "sparse-gold" ? "#030302" : "#050716";
        context.fillRect(0, 0, width, height);
        const colors = palette === "sparse-gold"
          ? [["#f9dc87", 0.91, 0.28], ["#6b3906", 0.84, 0.76]]
          : [["#f11975", 0.08, 0.25], ["#193bcc", 0.58, 0.46], ["#fa176f", 0.94, 0.3], ["#7f166f", 0.72, 0.84]];
        colors.forEach(([color, baseX, baseY], index) => {
          const wave = milliseconds * 0.00018 + index * 1.7;
          const x = width * (baseX + Math.sin(wave) * 0.15);
          const y = height * (baseY + Math.cos(wave * 0.8) * 0.18);
          const gradient = context.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.58);
          gradient.addColorStop(0, color);
          gradient.addColorStop(0.56, `${color}66`);
          gradient.addColorStop(1, `${color}00`);
          context.globalCompositeOperation = "screen";
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
        });
        context.globalCompositeOperation = "source-over";
      }
    };
  };
  const createWebGl = () => {
    const gl = canvas.getContext("webgl", { alpha:false, antialias:false, preserveDrawingBuffer:false });
    if (!gl) return null;
    gl.getExtension("OES_standard_derivatives");
    const vertexSource = "attribute vec2 a_position; void main(){ gl_Position=vec4(a_position,0.0,1.0); }";
    const defaultFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);} 
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);} 
      float f(vec2 p){float v=0.,a=.54;mat2 r=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=r*p*1.96+.13;a*=.5;}return v;}
      mat2 r(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);} 
      void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;float t=u_time*.055,d=length(p);vec2 s=r(-.62+d*1.15+sin(t*.6)*.04)*p;vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));float z=f(s*1.62+3.85*a);float bands=.5+.5*sin((s.x*1.35-s.y*.62+d*4.25+z*4.+a.x*1.65-a.y*.82)*3.14159);float ridge=pow(smoothstep(.66,.97,bands),3.2);float fine=pow(smoothstep(.72,.985,.5+.5*sin((z+a.x-a.y)*17.)),5.);float blue=smoothstep(.96,.13,length(s-vec2(.15,.02+a.y*.1)));float pink=clamp(smoothstep(.72,-.72,p.x+z*.34-a.y*.2)*(.48+ridge*.52)+smoothstep(.38,.92,d+a.x*.18)*(.36+.64*ridge)*.34,0.,1.);vec3 c=mix(vec3(.01,.012,.06),vec3(.035,.045,.18),.48+z*.42);c=mix(c,vec3(.025,.16,.68),blue*(.52+.3*a.y));c=mix(c,vec3(.22,.025,.27),pink*.34);c=mix(c,vec3(.92,.018,.34),pink*ridge*.66);c=mix(c,vec3(1.,.055,.48),pink*fine*.34);c+=fine*blue*vec3(.18,.28,.55);c+=ridge*pink*vec3(.16,.03,.12);c*=.72+smoothstep(.36,.02,abs(bands-.48))*.32;c*=.54+smoothstep(1.04,.3,length(p*vec2(.78,.94)))*.58;gl_FragColor=vec4(pow(c,vec3(.9)),1.);}`;
    const sparseGoldFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 m=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=m*p*1.96+.13;a*=.5;}return v;}
      void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;float phase=u_time*.5235988;float flow=f(p*1.55+vec2(phase*.11,-phase*.07));float centerX=.68+.075*sin(phase);float localX=p.x-centerX;float gate=1.-smoothstep(.20,.27,abs(localX));float path=.18+.075*sin(localX*5.4+phase*.72)+.035*sin(phase*1.13)+.014*(flow-.5);float d=abs(p.y-path);float amber=(1.-smoothstep(.014,.020,d))*gate;float body=(1.-smoothstep(.005,.014,d))*gate;float core=(1.-smoothstep(.0015,.0045,d))*gate;vec3 c=vec3(.0038,.0037,.0034);c=mix(c,vec3(.085,.027,.001),amber);c=mix(c,vec3(.97,.64,.065),body);c=mix(c,vec3(1.,.955,.69),core);gl_FragColor=vec4(c,1.);}`;
    const layeredGoldFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 r=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=r*p*1.96+.13;a*=.5;}return v;}
      mat2 r(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
      float sdGlint(vec2 p,vec2 c,vec2 scale){return length((p-c)*scale);}
      void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;float t=u_time*.055,d=length(p);vec2 s=r(-.62+d*1.15+sin(t*.6)*.04)*p;vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));float z=f(s*1.62+3.85*a);float bands=.5+.5*sin((s.x*1.35-s.y*.62+d*4.25+z*4.+a.x*1.65-a.y*.82)*3.14159);float ridge=pow(smoothstep(.52,.94,bands),2.35);float fine=pow(smoothstep(.70,.985,.5+.5*sin((z+a.x-a.y)*17.)),4.8);float gold=clamp(smoothstep(.84,-.84,p.x+z*.34-a.y*.2)*(.54+ridge*.46)+smoothstep(.30,.96,d+a.x*.18)*(.42+.58*ridge)*.45,0.,1.);vec3 c=mix(vec3(.024,.020,.012),vec3(.085,.062,.026),.50+z*.34);c=mix(c,vec3(.28,.19,.065),gold*.42);c=mix(c,vec3(.70,.50,.19),gold*ridge*.62);c=mix(c,vec3(.94,.76,.40),gold*fine*.30);c+=ridge*gold*vec3(.11,.07,.018);c*=.64+smoothstep(.36,.02,abs(bands-.48))*.33;c*=.50+smoothstep(1.04,.3,length(p*vec2(.78,.94)))*.56;float mt=u_time*.42;vec2 gp=uv+vec2((q.x-.5)*.020,(a.y-.5)*.018);float g1=sdGlint(gp,vec2(.82+.014*sin(mt),.17+.020*cos(mt*.83)),vec2(1.0,2.3));float g2=sdGlint(gp,vec2(.89+.012*sin(mt*.91+1.4),.33+.018*cos(mt+1.1)),vec2(1.8,1.0));float g3=sdGlint(gp,vec2(.95+.010*sin(mt*1.07+2.2),.51+.022*cos(mt*.87+2.7)),vec2(1.1,2.5));float g4=sdGlint(gp,vec2(.86+.013*sin(mt*.78+3.4),.71+.017*cos(mt*1.04+3.8)),vec2(2.2,1.0));float g5=sdGlint(gp,vec2(.965+.008*sin(mt+4.6),.83+.015*cos(mt*.92+4.2)),vec2(1.0,2.0));float gd=min(min(g1,g2),min(g3,min(g4,g5)));float edge=1.-smoothstep(.0050,.0070,gd);float body=1.-smoothstep(.0022,.0055,gd);float core=1.-smoothstep(.0005,.0042,gd);c=mix(c,vec3(.12,.052,.002),edge);c=mix(c,vec3(1.35,.92,.09),body);c=mix(c,vec3(1.55,1.34,.78),core);gl_FragColor=vec4(pow(c,vec3(.94)),1.);}`;
    const balancedGoldFragmentSource = `#extension GL_OES_standard_derivatives : enable
      precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 r=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=r*p*1.96+.13;a*=.5;}return v;}
      mat2 r(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
      float sdGlint(vec2 p,vec2 c,vec2 scale){return length((p-c)*scale);}
      void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;float t=u_time*.055,d=length(p);vec2 s=r(-.62+d*1.15+sin(t*.6)*.04)*p;vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));float z=f(s*1.62+3.85*a);float bands=.5+.5*sin((s.x*1.35-s.y*.62+d*4.25+z*4.+a.x*1.65-a.y*.82)*3.14159);float ridge=pow(smoothstep(.55,.94,bands),2.5);float lowFlow=pow(smoothstep(.30,.86,bands),1.65);vec3 c=mix(vec3(.0035,.0038,.0037),vec3(.031,.022,.008),lowFlow*.28+z*.08);c+=ridge*vec3(.048,.030,.005);float leftSide=1.-smoothstep(-.12,-.01,p.x);float rightSide=smoothstep(.14,.28,p.x);float leftPath=-.23+.085*sin(p.x*2.8+t*4.7+q.y*2.25);float rightPath=.18+.074*sin(p.x*3.15-t*4.15+a.x*2.55);float leftGate=leftSide*(1.-smoothstep(.058,.138,abs(p.y-leftPath)));float rightGate=rightSide*(1.-smoothstep(.052,.124,abs(p.y-rightPath)));float leftBody=leftGate*pow(smoothstep(.50,.88,bands),1.75);float rightBody=rightGate*pow(smoothstep(.46,.84,bands),1.62);float transition=max(leftGate*.84,rightGate*.92)*smoothstep(.36,.64,bands);float leftMetal=leftBody*.58;float rightMetal=rightBody*.72;float body=max(leftMetal,rightMetal);float surface=bands*.72+z*.28;vec2 grad=vec2(dFdx(surface),dFdy(surface));vec3 normal=normalize(vec3(-grad*34.,1.));vec3 lightDir=normalize(vec3(.48*cos(t*4.2+.5),-.24+.20*sin(t*3.6),.84));vec3 halfDir=normalize(lightDir+vec3(0.,0.,1.));float spec=pow(max(dot(normal,halfDir),0.),28.);float edge=pow(smoothstep(.64,.95,bands),4.8);float specMask=max(leftMetal,rightMetal*1.18)*edge*(.28+1.14*spec);c=mix(c,vec3(.12,.052,.003),transition*.80);c=mix(c,vec3(1.24,.75,.055),body);c=mix(c,vec3(1.72,1.43,.84),specMask);float mt=u_time*.42;vec2 gp=uv+vec2((q.x-.5)*.018,(a.y-.5)*.016);float g1=sdGlint(gp,vec2(.12+.010*sin(mt),.17+.014*cos(mt*.87)),vec2(1.0,2.0));float g2=sdGlint(gp,vec2(.25+.011*sin(mt*.91+1.3),.34+.013*cos(mt+1.1)),vec2(1.8,1.0));float g3=sdGlint(gp,vec2(.31+.009*sin(mt*1.04+2.5),.72+.014*cos(mt*.82+2.2)),vec2(1.0,2.2));float g4=sdGlint(gp,vec2(.73+.010*sin(mt*.86+3.3),.20+.013*cos(mt+3.0)),vec2(2.0,1.0));float g5=sdGlint(gp,vec2(.85+.009*sin(mt+4.1),.43+.014*cos(mt*.93+4.4)),vec2(1.0,2.1));float g6=sdGlint(gp,vec2(.94+.008*sin(mt*.89+5.2),.77+.012*cos(mt+5.0)),vec2(1.7,1.0));float gd=min(min(min(g1,g2),g3),min(min(g4,g5),g6));float ge=1.-smoothstep(.0040,.0058,gd);float gb=1.-smoothstep(.0022,.0040,gd);float gc=1.-smoothstep(.0005,.0022,gd);c=mix(c,vec3(.10,.041,.002),ge);c=mix(c,vec3(1.48,.92,.085),gb);c=mix(c,vec3(1.78,1.56,.98),gc);float vignette=.64+smoothstep(1.00,.28,length(p*vec2(.72,.94)))*.40;c*=vignette;gl_FragColor=vec4(pow(c,vec3(.92)),1.);}`;
    const balancedGoldFragmentSourceBright = balancedGoldFragmentSource
      .replace("vec3(1.72,1.43,.84)", "vec3(2.58,2.22,1.46)")
      .replace("rightMetal*1.18", "rightMetal*1.80")
      .replace("vec3(1.24,.75,.055)", "vec3(1.52,.96,.10)")
      .replace("vec3(1.48,.92,.085)", "vec3(1.68,1.08,.13)")
      .replace("vec3(1.78,1.56,.98)", "vec3(2.82,2.48,1.66)")
      .replace("vec3(2.58,2.22,1.46)", "vec3(3.08,2.68,1.78)");
    const pureBlackGoldFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 r=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=r*p*1.96+.13;a*=.5;}return v;}
      mat2 r(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
      void main(){
        vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;
        float t=u_time*.055,d=length(p);
        vec2 s=r(-.62+d*1.15+sin(t*.6)*.04)*p;
        vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));
        vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));
        float z=f(s*1.62+3.85*a);
        float bands=.5+.5*sin((s.x*1.35-s.y*.62+d*4.25+z*4.+a.x*1.65-a.y*.82)*3.14159);
        float broad=pow(smoothstep(.25,.88,bands),1.46);
        float ridge=pow(smoothstep(.52,.94,bands),2.25);
        float fine=pow(smoothstep(.70,.985,.5+.5*sin((z+a.x-a.y)*17.)),4.8);
        float gold=clamp(smoothstep(.86,-.86,p.x+z*.34-a.y*.2)*(.52+ridge*.48)+smoothstep(.28,.98,d+a.x*.18)*(.40+.60*ridge)*.48,0.,1.);
        float amberField=gold*(.36*broad+.64*ridge);
        vec3 c=mix(vec3(.010,.009,.006),vec3(.043,.031,.012),.42+z*.38);
        c=mix(c,vec3(.16,.105,.034),gold*.36);
        c=mix(c,vec3(.50,.36,.125),amberField*.70);
        c=mix(c,vec3(.92,.70,.31),gold*fine*.32);
        c+=ridge*gold*vec3(.105,.068,.018);
        c*=.62+smoothstep(.36,.02,abs(bands-.48))*.34;
        c*=.50+smoothstep(1.04,.30,length(p*vec2(.78,.94)))*.58;
        gl_FragColor=vec4(pow(c,vec3(.92)),1.);
      }`;
    const mixedGoldFlowFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 rr=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=rr*p*1.96+.13;a*=.5;}return v;}
      mat2 rot(float a){float ss=sin(a),c=cos(a);return mat2(c,-ss,ss,c);}
      void main(){
        vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;
        float t=u_time*.055,d=length(p);
        vec2 s=rot(-.62+d*1.15+sin(t*.6)*.04)*p;
        vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));
        vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));
        vec2 m=s+vec2((q.x-.5)*.34,(a.y-.5)*.28);
        float z=f(s*1.62+3.85*a);
        float bands=.5+.5*sin((m.x*1.28-m.y*.66+d*4.10+z*4.35+a.x*1.52-a.y*.76)*3.14159);
        float secondary=.5+.5*sin((m.x*2.04+m.y*.78+q.y*3.1-z*1.9+t*.45)*3.14159);
        float broad=pow(smoothstep(.23,.88,bands),1.34);
        float ridge=pow(smoothstep(.49,.94,bands),2.10);
        float lace=pow(smoothstep(.66,.985,secondary),4.1);
        float leftGold=smoothstep(.88,-.86,p.x+z*.30-a.y*.17)*(.42+ridge*.58);
        float rightGold=smoothstep(-.55,.68,p.x+q.x*.15+z*.12)*(.40+.60*ridge);
        float centerGold=smoothstep(.92,.24,abs(p.x+a.x*.08-z*.06))*(.22+.78*broad);
        float gold=clamp(leftGold*.52+rightGold*.62+centerGold*.34+smoothstep(.28,.96,d+a.x*.16)*(.18+.42*ridge),0.,1.);
        float darkPocket=smoothstep(.14,.62,abs(p.x-.05+q.y*.09))*smoothstep(.12,.86,abs(p.y+.04-a.x*.08));
        vec3 black=vec3(.008,.007,.005);
        vec3 umber=vec3(.060,.041,.014);
        vec3 bronze=vec3(.34,.205,.055);
        vec3 oldGold=vec3(.68,.49,.17);
        vec3 champagne=vec3(1.10,.86,.40);
        vec3 c=mix(black,umber,.34+z*.36);
        c=mix(c,bronze,gold*(.28+.42*broad));
        c=mix(c,oldGold,gold*ridge*.58);
        c=mix(c,champagne,gold*lace*.30);
        c+=ridge*gold*vec3(.12,.077,.020);
        c*=mix(.92,.58,darkPocket*.28);
        c*=.62+smoothstep(.38,.02,abs(bands-.50))*.34;
        c*=.50+smoothstep(1.04,.30,length(p*vec2(.78,.94)))*.58;
        gl_FragColor=vec4(pow(c,vec3(.92)),1.);
      }`;
    const leanBrightGoldFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 rr=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=rr*p*1.96+.13;a*=.5;}return v;}
      mat2 rot(float a){float ss=sin(a),c=cos(a);return mat2(c,-ss,ss,c);}
      void main(){
        vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;
        float t=u_time*.055,d=length(p);
        vec2 s=rot(-.62+d*1.15+sin(t*.6)*.04)*p;
        vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));
        vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));
        vec2 m=s+vec2((q.x-.5)*.30,(a.y-.5)*.24);
        float z=f(s*1.62+3.85*a);
        float bands=.5+.5*sin((m.x*1.28-m.y*.66+d*4.10+z*4.35+a.x*1.52-a.y*.76)*3.14159);
        float secondary=.5+.5*sin((m.x*2.04+m.y*.78+q.y*3.1-z*1.9+t*.45)*3.14159);
        float broad=pow(smoothstep(.34,.91,bands),1.55);
        float ridge=pow(smoothstep(.60,.965,bands),2.65);
        float lace=pow(smoothstep(.82,.997,secondary),6.8);
        float leftGold=smoothstep(.82,-.78,p.x+z*.26-a.y*.14)*(.26+ridge*.74);
        float rightGold=smoothstep(-.45,.72,p.x+q.x*.12+z*.10)*(.34+.66*ridge);
        float centerGold=smoothstep(.74,.20,abs(p.x+a.x*.07-z*.05))*(.14+.86*ridge);
        float gold=clamp(leftGold*.34+rightGold*.48+centerGold*.20+smoothstep(.38,.98,d+a.x*.14)*(.08+.30*ridge),0.,1.);
        vec3 black=vec3(.007,.006,.004);
        vec3 umber=vec3(.046,.031,.010);
        vec3 bronze=vec3(.25,.145,.034);
        vec3 oldGold=vec3(.58,.405,.115);
        vec3 brightGold=vec3(2.05,1.55,.36);
        vec3 hotChampagne=vec3(3.10,2.62,1.18);
        vec3 c=mix(black,umber,.28+z*.30);
        c=mix(c,bronze,gold*(.18+.28*broad));
        c=mix(c,oldGold,gold*ridge*.42);
        c=mix(c,brightGold,gold*lace*.48);
        c=mix(c,hotChampagne,gold*lace*ridge*.34);
        c+=ridge*gold*vec3(.070,.045,.010);
        c*=.62+smoothstep(.38,.02,abs(bands-.50))*.30;
        c*=.50+smoothstep(1.04,.30,length(p*vec2(.78,.94)))*.58;
        gl_FragColor=vec4(pow(c,vec3(.91)),1.);
      }`;
    const refinedGoldFlowFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 rr=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=rr*p*1.96+.13;a*=.5;}return v;}
      mat2 rot(float a){float ss=sin(a),c=cos(a);return mat2(c,-ss,ss,c);}
      void main(){
        vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;
        float t=u_time*.055,d=length(p);
        vec2 s=rot(-.62+d*1.15+sin(t*.6)*.04)*p;
        vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));
        vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));
        vec2 m=s+vec2((q.x-.5)*.30,(a.y-.5)*.24);
        float z=f(s*1.62+3.85*a);
        float bands=.5+.5*sin((m.x*1.28-m.y*.66+d*4.10+z*4.35+a.x*1.52-a.y*.76)*3.14159);
        float secondary=.5+.5*sin((m.x*2.04+m.y*.78+q.y*3.1-z*1.9+t*.45)*3.14159);
        float broad=pow(smoothstep(.36,.93,bands),1.66);
        float ridge=pow(smoothstep(.62,.972,bands),2.88);
        float lace=pow(smoothstep(.84,.998,secondary),7.2);
        float leftGold=smoothstep(.82,-.78,p.x+z*.26-a.y*.14)*(.22+ridge*.78);
        float rightGold=smoothstep(-.36,.76,p.x+q.x*.12+z*.10)*(.40+.60*ridge);
        float centerGold=smoothstep(.68,.24,abs(p.x+a.x*.07-z*.05))*(.10+.90*ridge);
        float titleQuiet=1.-smoothstep(.30,.62,abs(p.x))*smoothstep(.02,.34,abs(p.y+.02));
        float copyMask=1.-smoothstep(.28,.02,abs(p.x))*smoothstep(.26,.04,abs(p.y+.02));
        float gold=clamp(leftGold*.26+rightGold*.50+centerGold*.13+smoothstep(.42,.99,d+a.x*.14)*(.06+.26*ridge),0.,1.);
        gold*=mix(.62,1.0,copyMask);
        vec3 black=vec3(.0065,.0055,.004);
        vec3 umber=vec3(.041,.028,.009);
        vec3 bronze=vec3(.22,.126,.030);
        vec3 oldGold=vec3(.54,.372,.104);
        vec3 brightGold=vec3(2.28,1.72,.38);
        vec3 hotChampagne=vec3(3.35,2.86,1.28);
        vec3 c=mix(black,umber,.24+z*.28);
        c=mix(c,bronze,gold*(.13+.24*broad));
        c=mix(c,oldGold,gold*ridge*.36);
        c=mix(c,brightGold,gold*lace*.56);
        c=mix(c,hotChampagne,gold*lace*ridge*.42);
        c+=ridge*gold*vec3(.055,.036,.008);
        c*=mix(.80,1.0,titleQuiet);
        c*=.61+smoothstep(.38,.02,abs(bands-.50))*.29;
        c*=.50+smoothstep(1.04,.30,length(p*vec2(.78,.94)))*.58;
        gl_FragColor=vec4(pow(c,vec3(.91)),1.);
      }`;
    const layeredDepthGoldFragmentSource = `precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 rr=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=rr*p*1.96+.13;a*=.5;}return v;}
      mat2 rot(float a){float ss=sin(a),c=cos(a);return mat2(c,-ss,ss,c);}
      void main(){
        vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;
        float t=u_time*.055,d=length(p);
        vec2 s=rot(-.62+d*1.15+sin(t*.6)*.04)*p;
        vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));
        vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));
        vec2 m=s+vec2((q.x-.5)*.30,(a.y-.5)*.24);
        float z=f(s*1.62+3.85*a);
        float z2=f(m*2.55+q*2.2+vec2(t*.22,-t*.16));
        float bands=.5+.5*sin((m.x*1.28-m.y*.66+d*4.10+z*4.35+a.x*1.52-a.y*.76)*3.14159);
        float secondary=.5+.5*sin((m.x*2.04+m.y*.78+q.y*3.1-z*1.9+t*.45)*3.14159);
        float depthBand=.5+.5*sin((m.x*3.10-m.y*1.18+z2*4.4+a.y*2.1-t*.32)*3.14159);
        float broad=pow(smoothstep(.31,.92,bands),1.55);
        float ridge=pow(smoothstep(.58,.972,bands),2.75);
        float fold=pow(smoothstep(.57,.92,depthBand),2.2);
        float lace=pow(smoothstep(.84,.998,secondary),7.0);
        float leftGold=smoothstep(.82,-.78,p.x+z*.26-a.y*.14)*(.22+ridge*.78);
        float rightGold=smoothstep(-.34,.76,p.x+q.x*.12+z*.10)*(.40+.60*ridge);
        float centerGold=smoothstep(.68,.24,abs(p.x+a.x*.07-z*.05))*(.10+.90*ridge);
        float gold=clamp(leftGold*.26+rightGold*.50+centerGold*.13+smoothstep(.42,.99,d+a.x*.14)*(.06+.26*ridge),0.,1.);
        float centerQuiet=smoothstep(.08,.34,abs(p.x));
        gold*=mix(.56,1.0,centerQuiet);
        vec3 black=vec3(.006,.005,.0035);
        vec3 umber=vec3(.048,.031,.008);
        vec3 bronze=vec3(.26,.145,.028);
        vec3 oldGold=vec3(.62,.41,.095);
        vec3 brightGold=vec3(2.16,1.58,.31);
        vec3 hotChampagne=vec3(3.22,2.62,1.06);
        vec3 c=mix(black,umber,.22+z*.25);
        c=mix(c,vec3(.10,.058,.012),fold*.30*(.45+.55*gold));
        c=mix(c,bronze,gold*(.16+.30*broad));
        c=mix(c,oldGold,gold*(ridge*.38+fold*.12));
        c=mix(c,brightGold,gold*lace*.52);
        c=mix(c,hotChampagne,gold*lace*ridge*.40);
        c+=ridge*gold*vec3(.06,.038,.007);
        c*=.60+smoothstep(.40,.02,abs(bands-.50))*.30;
        c*=.50+smoothstep(1.04,.30,length(p*vec2(.78,.94)))*.58;
        gl_FragColor=vec4(pow(c,vec3(.91)),1.);
      }`;
    const distributedGoldFragmentSource = `#extension GL_OES_standard_derivatives : enable
      precision highp float;
      uniform vec2 u_resolution; uniform float u_time;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      float f(vec2 p){float v=0.,a=.54;mat2 r=mat2(.82,.57,-.57,.82);for(int i=0;i<5;i++){v+=a*n(p);p=r*p*1.96+.13;a*=.5;}return v;}
      mat2 r(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
      float liquidSeg(vec2 p,vec4 spec,float phase,float flow){
        float x0=spec.x,x1=spec.y,y0=spec.z,amp=spec.w;
        float u=clamp((p.x-x0)/(x1-x0),0.,1.);
        float gate=smoothstep(x0,x0+.004,p.x)*(1.-smoothstep(x1-.004,x1,p.x));
        float taper=pow(max(sin(u*3.14159),0.),.72);
        float path=y0+amp*(.62*sin(u*3.14159+phase)+.24*sin(u*6.8-phase*.63)+.14*sin(u*11.7+phase*1.9));
        path+=(flow-.5)*.0105;
        float width=.00178*(.62+.27*sin(u*9.4+phase*2.1)+.22*flow);
        float normalized=abs(p.y-path)/max(width*taper,.00008);
        return mix(9.,normalized,gate*taper);
      }
      void main(){
        vec2 uv=gl_FragCoord.xy/u_resolution.xy;uv.y=1.-uv.y;vec2 p=uv-.5;p.x*=u_resolution.x/u_resolution.y;
        float t=u_time*.055,d=length(p);vec2 s=r(-.62+d*1.15+sin(t*.6)*.04)*p;
        vec2 q=vec2(f(s*1.18+vec2(-.25,t)),f(s*1.16+vec2(4.8,-t*.82)));
        vec2 a=vec2(f(s*1.42+3.35*q+vec2(1.7,t*.52)),f(s*1.38+3.18*q+vec2(8.4,-t*.44)));
        float z=f(s*1.62+3.85*a);float bands=.5+.5*sin((s.x*1.35-s.y*.62+d*4.25+z*4.+a.x*1.65-a.y*.82)*3.14159);
        float ridge=pow(smoothstep(.52,.94,bands),2.35);float fine=pow(smoothstep(.70,.985,.5+.5*sin((z+a.x-a.y)*17.)),4.8);
        float gold=clamp(smoothstep(.84,-.84,p.x+z*.34-a.y*.2)*(.54+ridge*.46)+smoothstep(.30,.96,d+a.x*.18)*(.42+.58*ridge)*.45,0.,1.);
        vec3 c=mix(vec3(.024,.020,.012),vec3(.085,.062,.026),.50+z*.34);c=mix(c,vec3(.28,.19,.065),gold*.42);c=mix(c,vec3(.70,.50,.19),gold*ridge*.62);c=mix(c,vec3(.94,.76,.40),gold*fine*.30);c+=ridge*gold*vec3(.11,.07,.018);c*=.64+smoothstep(.36,.02,abs(bands-.48))*.33;c*=.50+smoothstep(1.04,.3,length(p*vec2(.78,.94)))*.56;
        float mt=u_time*.42;vec2 fp=uv+vec2((q.x-.5)*.026,(a.y-.5)*.022);fp.y+=.012*sin(fp.x*18.+mt*.74+q.y*3.2);
        float seg=liquidSeg(fp,vec4(.070,.132,.205,.019),.15+q.x*.72,q.y);
        seg=min(seg,liquidSeg(fp,vec4(.205,.286,.742,.014),1.31+a.y*.58,a.x));
        seg=min(seg,liquidSeg(fp,vec4(.365,.414,.176,.021),2.22+z*.64,q.x));
        seg=min(seg,liquidSeg(fp,vec4(.602,.672,.772,.016),2.94+q.y*.66,a.y));
        seg=min(seg,liquidSeg(fp,vec4(.738,.796,.237,.020),3.71+a.x*.62,z));
        seg=min(seg,liquidSeg(fp,vec4(.884,.956,.694,.015),4.63+z*.58,q.y));
        float edge=1.-smoothstep(1.25,2.35,seg);float body=1.-smoothstep(.58,1.34,seg);float core=1.-smoothstep(.12,.68,seg);
        float surface=bands*.72+z*.28;vec2 grad=vec2(dFdx(surface),dFdy(surface));vec3 normal=normalize(vec3(-grad*38.,1.));
        vec3 lightDir=normalize(vec3(.54*cos(mt*.78+.4),-.18+.24*sin(mt*.66),.82));vec3 halfDir=normalize(lightDir+vec3(0.,0.,1.));float spec=pow(max(dot(normal,halfDir),0.),26.);
        c=mix(c,vec3(.15,.061,.003),edge*.94);c=mix(c,vec3(3.20,2.36,.50),body*(.76+.24*ridge));c=mix(c,vec3(4.40,3.90,2.50),core*(.52+1.48*spec));
        gl_FragColor=vec4(pow(c,vec3(.93)),1.);
      }`;
    const fragmentSource = palette === "sparse-gold" ? sparseGoldFragmentSource : palette === "layered-gold" ? layeredGoldFragmentSource : palette === "balanced-gold" ? balancedGoldFragmentSourceBright : palette === "distributed-gold" ? distributedGoldFragmentSource : palette === "pure-black-gold" ? pureBlackGoldFragmentSource : palette === "mixed-gold-flow" ? mixedGoldFlowFragmentSource : palette === "lean-bright-gold" ? leanBrightGoldFragmentSource : palette === "refined-gold-flow" ? refinedGoldFlowFragmentSource : palette === "layered-depth-gold" ? layeredDepthGoldFragmentSource : defaultFragmentSource;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    const resolution = gl.getUniformLocation(program, "u_resolution");
    const time = gl.getUniformLocation(program, "u_time");
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    return {
      renderer: palette === "sparse-gold" ? "webgl-sparse-gold" : palette === "layered-gold" ? "webgl-layered-gold" : palette === "balanced-gold" ? "webgl-balanced-gold" : palette === "distributed-gold" ? "webgl-distributed-gold" : palette === "pure-black-gold" ? "webgl-pure-black-gold" : palette === "mixed-gold-flow" ? "webgl-mixed-gold-flow" : palette === "lean-bright-gold" ? "webgl-lean-bright-gold" : palette === "refined-gold-flow" ? "webgl-refined-gold-flow" : palette === "layered-depth-gold" ? "webgl-layered-depth-gold" : "webgl",
      gl,
      resize() { resizeCanvas(); gl.viewport(0, 0, canvas.width, canvas.height); },
      render(milliseconds) {
        gl.uniform2f(resolution, canvas.width, canvas.height);
        gl.uniform1f(time, milliseconds / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    };
  };
  let engine;
  try { engine = createWebGl() || createFallback(); } catch { engine = createFallback(); }
  if (!engine) { canvas.dataset.renderer = "none"; setState("unavailable"); return null; }
  canvas.dataset.renderer = engine.renderer;
  const draw = milliseconds => {
    if (!running) return;
    engine.render(milliseconds);
    frames += 1;
    setState("running");
    frame = requestAnimationFrame(draw);
  };
  return {
    resize: () => engine.resize(),
    freeze() { engine.resize(); engine.render(performance.now()); setState("frozen"); },
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      running = false;
      if (engine.renderer.startsWith("webgl")) engine.gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
      setState("disposed");
    },
    start() {
      if (running) return;
      engine.resize();
      running = true;
      setState("running");
      frame = requestAnimationFrame(draw);
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      running = false;
      setState("stopped");
    }
  };
}

function initHeroRenderer() {
  if (fluidPreviewEnabled) {
    const previewScript = document.createElement("script");
    previewScript.src = "./fluid-preview-r1.js?v=20260731-real-fluid-gilded-preview-r1d";
    previewScript.async = true;
    document.head.appendChild(previewScript);
    return;
  }
  if (sparseGoldPreviewEnabled) {
    document.body.classList.add("has-sparse-gold-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "sparse-gold");
    syncHeroRenderer();
    return;
  }
  if (layeredGoldPreviewEnabled) {
    document.body.classList.add("has-layered-gold-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "layered-gold");
    syncHeroRenderer();
    return;
  }
  if (balancedGoldPreviewEnabled) {
    document.body.classList.add("has-balanced-gold-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "balanced-gold");
    syncHeroRenderer();
    return;
  }
  if (distributedGoldPreviewEnabled) {
    document.body.classList.add("has-distributed-gold-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "distributed-gold");
    syncHeroRenderer();
    return;
  }
  if (pureBlackGoldPreviewEnabled) {
    document.body.classList.add("has-pure-black-gold-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "pure-black-gold");
    syncHeroRenderer();
    return;
  }
  if (mixedGoldFlowPreviewEnabled) {
    document.body.classList.add("has-mixed-gold-flow-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "mixed-gold-flow");
    syncHeroRenderer();
    return;
  }
  if (leanBrightGoldPreviewEnabled) {
    document.body.classList.add("has-lean-bright-gold-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "lean-bright-gold");
    syncHeroRenderer();
    return;
  }
  if (refinedGoldFlowPreviewEnabled) {
    document.body.classList.add("has-refined-gold-flow-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "refined-gold-flow");
    syncHeroRenderer();
    return;
  }
  if (layeredDepthGoldPreviewEnabled) {
    document.body.classList.add("has-layered-depth-gold-preview");
    if ((window.location.hash.replace("#", "") || "home") === "home") fluidRenderer = createFluidRenderer(fluidCanvas, "layered-depth-gold");
    syncHeroRenderer();
    return;
  }
  fluidRenderer = createFluidRenderer(fluidCanvas, "layered-depth-gold");
  syncHeroRenderer();
}

function syncHeroRenderer() {
  if (fluidPreviewEnabled) return;
  if (sparseGoldPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "sparse-gold");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (layeredGoldPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "layered-gold");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (balancedGoldPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "balanced-gold");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (distributedGoldPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "distributed-gold");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (pureBlackGoldPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "pure-black-gold");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (mixedGoldFlowPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "mixed-gold-flow");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (leanBrightGoldPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "lean-bright-gold");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (refinedGoldFlowPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "refined-gold-flow");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (layeredDepthGoldPreviewEnabled) {
    if (currentView !== "home") { fluidRenderer?.dispose(); fluidRenderer = null; return; }
    if (!fluidRenderer) fluidRenderer = createFluidRenderer(fluidCanvas, "layered-depth-gold");
    if (canPlayHeroMotion()) fluidRenderer.start(); else fluidRenderer.freeze();
    return;
  }
  if (!fluidRenderer) return;
  if (canPlayHeroMotion()) fluidRenderer.start();
  else fluidRenderer.stop();
}

function syncVisualMotion() {
  syncHeroRenderer();
}

function initShowcaseFilmMotion() {
  const films = Array.from(document.querySelectorAll(".showcase-film"));
  if (!films.length || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  films.forEach((film) => {
    let frame = null;
    let nextShift = { x: 0, y: 0 };
    const renderShift = () => {
      frame = null;
      film.style.setProperty("--showcase-shift-x", `${nextShift.x.toFixed(2)}px`);
      film.style.setProperty("--showcase-shift-y", `${nextShift.y.toFixed(2)}px`);
    };
    const resetShift = () => {
      nextShift = { x: 0, y: 0 };
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(renderShift);
    };
    film.addEventListener("pointermove", (event) => {
      if (reducedMotion.matches || !document.body.classList.contains("is-showcase-view") || !film.classList.contains("is-active")) return;
      const bounds = film.getBoundingClientRect();
      nextShift = {
        x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 16,
        y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 10
      };
      if (!frame) frame = requestAnimationFrame(renderShift);
    });
    film.addEventListener("pointerleave", resetShift);
    reducedMotion.addEventListener?.("change", resetShift);
  });
}

function setShowcaseFilm(nextIndex) {
  const films = Array.from(document.querySelectorAll("[data-showcase-film]"));
  const controls = Array.from(document.querySelectorAll("[data-showcase-film-index]"));
  if (!films.length) return;
  const normalizedIndex = ((nextIndex % films.length) + films.length) % films.length;
  showcaseFilmIndex = normalizedIndex;
  films.forEach((film, index) => {
    const active = index === normalizedIndex;
    film.classList.toggle("is-active", active);
    film.setAttribute("aria-hidden", String(!active));
    film.querySelectorAll("button").forEach((button) => { button.tabIndex = active ? 0 : -1; });
  });
  controls.forEach((control, index) => {
    const active = index === normalizedIndex;
    control.classList.toggle("is-active", active);
    control.setAttribute("aria-pressed", String(active));
  });
}

function initShowcaseFilmDeck() {
  const deck = document.querySelector("#showcaseFilmDeck");
  if (!deck) return;
  document.querySelectorAll("[data-showcase-film-index]").forEach((control) => {
    control.addEventListener("click", () => setShowcaseFilm(Number(control.dataset.showcaseFilmIndex)));
  });
  deck.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); setShowcaseFilm(showcaseFilmIndex + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); setShowcaseFilm(showcaseFilmIndex - 1); }
  });
  deck.querySelectorAll("[data-showcase-film]:not(.is-active) button").forEach((button) => { button.tabIndex = -1; });
}

function closeMobileNavigation() {
  if (!mobileMenuToggle || !primaryNavigation) return;
  mobileMenuToggle.setAttribute("aria-expanded", "false");
  mobileMenuToggle.setAttribute("aria-label", "打开导航");
  primaryNavigation.classList.remove("is-open");
}

function toggleMobileNavigation() {
  if (!mobileMenuToggle || !primaryNavigation) return;
  const isOpen = mobileMenuToggle.getAttribute("aria-expanded") === "true";
  mobileMenuToggle.setAttribute("aria-expanded", String(!isOpen));
  mobileMenuToggle.setAttribute("aria-label", isOpen ? "打开导航" : "关闭导航");
  primaryNavigation.classList.toggle("is-open", !isOpen);
}

function openModal(type) {
  const content = modalContent[type] || modalContent["new-project"];
  const isAuth = type === "login" || type === "register";
  modalBackdrop.dataset.modalType = type;
  modalKicker.textContent = content.kicker;
  modalTitle.textContent = content.title;
  if (modalCopy) modalCopy.textContent = content.copy;
  fieldLabel.textContent = content.label;
  modalInput.placeholder = content.placeholder;
  modalInput.type = isAuth ? "email" : "text";
  modalInput.autocomplete = isAuth ? "email" : "off";
  modalSubmit.textContent = content.submit;
  modalInput.value = "";
  modalPasswordField.hidden = !isAuth;
  modalPassword.value = "";
  modalPassword.autocomplete = type === "register" ? "new-password" : "current-password";
  modalPassword.minLength = type === "register" ? 8 : 0;
  modalPassword.placeholder = type === "register" ? "至少 8 位密码" : "密码";
  modalStatus.textContent = "";
  modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => modalInput.focus());
}

function closeModal() {
  modalBackdrop.hidden = true;
  delete modalBackdrop.dataset.modalType;
  document.body.style.overflow = "";
}

async function submitAuth(type) {
  const email = modalInput.value.trim();
  const password = modalPassword.value;
  if (!email || !password) {
    modalStatus.textContent = "请输入邮箱和密码";
    return;
  }
  modalSubmit.disabled = true;
  modalStatus.textContent = type === "register" ? "正在创建账户..." : "正在登录...";
  try {
    const response = await fetch(`/api/auth/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "认证失败，请稍后重试");
    modalStatus.textContent = type === "register" ? "账户已创建，正在进入..." : "登录成功，正在进入...";
    window.setTimeout(() => { window.location.href = "/studio/"; }, 260);
  } catch (error) {
    modalStatus.textContent = error instanceof Error ? error.message : "认证失败，请稍后重试";
    modalSubmit.disabled = false;
  }
}

navigationItems.forEach((item) => {
  item.addEventListener("click", () => {
    if (item.dataset.view) setView(item.dataset.view, { scroll: "top" });
  });
});

// Access panels are rendered after the initial shell. Route their existing
// data-view actions through the same navigator without changing their markup.
document.addEventListener("click", (event) => {
  const viewTrigger = event.target.closest("[data-view]");
  if (!viewTrigger || navigationItems.includes(viewTrigger) || !viewTrigger.dataset.view) return;
  setView(viewTrigger.dataset.view, { scroll: "top" });
});

mobileMenuToggle?.addEventListener("click", toggleMobileNavigation);

window.addEventListener("resize", () => {
  if (window.innerWidth > 640) closeMobileNavigation();
  fluidRenderer?.resize();
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.("[data-modal]");
  if (trigger?.dataset.modal) openModal(trigger.dataset.modal);
});

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeModal();
});

modalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const modalType = modalBackdrop.dataset.modalType;
  if (["login", "register"].includes(modalType)) {
    submitAuth(modalType);
    return;
  }
  if (!modalInput.value.trim()) {
    modalInput.focus();
    return;
  }
  modalSubmit.textContent = "已提交";
  modalSubmit.disabled = true;
  window.setTimeout(() => {
    modalSubmit.disabled = false;
    closeModal();
  }, 650);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenuToggle?.getAttribute("aria-expanded") === "true") {
    closeMobileNavigation();
    mobileMenuToggle.focus();
    return;
  }
  if (event.key === "Escape" && !modalBackdrop.hidden) closeModal();
});

window.addEventListener("hashchange", () => {
  const viewName = window.location.hash.replace("#", "") || "home";
  // The hash can already agree with currentView while a prior render left the wrong panel visible.
  // Reapply the route on every hash transition so URL and visible panel cannot diverge.
  setView(viewName, { syncHash: false, scroll: "preserve" });
});

window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("online", () => {
  updateConnectionStatus();
  window.dispatchEvent(new CustomEvent("niannian:network-restored"));
});

const heroWords = ["做高燃短剧", "做精品漫剧", "做真人情感剧", "做爆款商品视频", "做电影感品牌片", "做转绘出海短剧"];
let heroWordIndex = 0;
window.setInterval(() => {
  if (!heroVerb || !canPlayHeroMotion()) return;
  heroWordIndex = (heroWordIndex + 1) % heroWords.length;
  heroVerb.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(-8px)", offset: 0.48 },
      { opacity: 0, transform: "translateY(8px)", offset: 0.52 },
      { opacity: 1, transform: "translateY(0)" }
    ],
    { duration: 420, easing: "ease-out" }
  );
  window.setTimeout(() => {
    heroVerb.textContent = heroWords[heroWordIndex];
  }, 205);
}, 3200);

initHeroRenderer();
updateConnectionStatus();
registerOfflineShell();
initShowcaseFilmMotion();
initShowcaseFilmDeck();
window.addEventListener("visibilitychange", syncVisualMotion);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
reducedMotionQuery.addEventListener?.("change", syncVisualMotion);
setView(window.location.hash.replace("#", "") || "home", { syncHash: false, scroll: "preserve" });

window.addEventListener("beforeunload", () => {
  window.removeEventListener("visibilitychange", syncVisualMotion);
  reducedMotionQuery.removeEventListener?.("change", syncVisualMotion);
  fluidRenderer?.stop();
});
