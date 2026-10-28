// ── Clock ────────────────────────────────────────────────────────────────────
function pad(n){ return String(n).padStart(2,'0'); }

function updateClock(){
  const now = new Date();
  const clk = document.getElementById('clock');
  const clkDate = document.getElementById('clock-date');
  if(clk){
    clk.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  if(clkDate){
    clkDate.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}
setInterval(updateClock, 1000);
updateClock();

// ── State ─────────────────────────────────────────────────────────────────────
let activeTab = 'log';
let logs = [];
let events = [];
let timetable = [];
let liveEnrolling = false;
let enrollPollInterval = null;
let recordingActive = true;

const colors = [
  {color:'#00d4ff', bg:'rgba(0,212,255,.15)'},
  {color:'#a78bfa', bg:'rgba(167,139,250,.15)'},
  {color:'#00e676', bg:'rgba(0,230,118,.15)'},
  {color:'#ffc107', bg:'rgba(255,193,7,.15)'},
  {color:'#ff80ab', bg:'rgba(255,128,171,.15)'},
  {color:'#69f0ae', bg:'rgba(105,240,174,.15)'},
  {color:'#ff9800', bg:'rgba(255,152,0,.15)'},
  {color:'#0080ff', bg:'rgba(0,128,255,.15)'},
];
const colorMap = {};
function getColor(name){
  if(!colorMap[name]){
    const idx = Object.keys(colorMap).length % colors.length;
    colorMap[name] = colors[idx];
  }
  return colorMap[name];
}
function initials(name){
  return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || 'ST';
}

// ── Application Operation Mode Switcher (Attendance Mode vs Enrollment Mode) ──
let appMode = 'attendance'; // 'attendance' | 'enroll'

function setAppMode(mode){
  appMode = mode;
  const btnAtt = document.getElementById('btn-mode-attendance');
  const btnEnr = document.getElementById('btn-mode-enroll');
  const enrollPanel = document.getElementById('live-enroll-panel');
  const regPanel = document.getElementById('register-panel');
  const delModal = document.getElementById('delete-modal');
  const modePill = document.getElementById('mode-pill-txt');
  const camStatus = document.getElementById('cam-status');

  if(btnAtt) btnAtt.classList.toggle('active', mode === 'attendance');
  if(btnEnr) btnEnr.classList.toggle('active', mode === 'enroll');

  if(mode === 'enroll'){
    if(regPanel) regPanel.style.display = 'none';
    if(delModal) delModal.style.display = 'none';
    if(enrollPanel) enrollPanel.style.display = 'flex';
    if(modePill){
      modePill.className = 'mode-pill enroll';
      modePill.textContent = '⚡ ENROLLMENT MODE (ZONE)';
    }
    if(camStatus) camStatus.textContent = 'REGISTRATION ZONE · FAST LIVE CAPTURE';
    const nameInput = document.getElementById('enroll-name');
    if(nameInput) nameInput.focus();
    triggerHud('SWITCHED TO ENROLLMENT MODE');
  } else {
    if(enrollPanel) enrollPanel.style.display = 'none';
    if(delModal) delModal.style.display = 'none';
    if(modePill){
      modePill.className = 'mode-pill attendance';
      modePill.textContent = '● ATTENDANCE MODE';
    }
    if(camStatus) camStatus.textContent = 'ATTENDANCE TRACKING ACTIVE';
    if(liveEnrolling) cancelLiveEnroll();
    triggerHud('SWITCHED TO ATTENDANCE MODE');
  }
}

// ── Delete Student Modal Dialog ───────────────────────────────────────────────
async function openDeleteStudentModal(){
  const modal = document.getElementById('delete-modal');
  const select = document.getElementById('delete-student-select');
  const msgEl = document.getElementById('delete-modal-msg');
  if(msgEl) msgEl.textContent = '';

  const enrollPanel = document.getElementById('live-enroll-panel');
  const regPanel = document.getElementById('register-panel');
  if(enrollPanel) enrollPanel.style.display = 'none';
  if(regPanel) regPanel.style.display = 'none';

  try {
    const res = await fetch('/api/students/list');
    const students = await res.json();
    if(!students.length){
      select.innerHTML = '<option value="" disabled selected>No students currently enrolled</option>';
    } else {
      select.innerHTML = '<option value="" disabled selected>Select student to delete...</option>' +
        students.map(s => `<option value="${s.name}">${s.name} (${s.reg_no} · ${s.class_name})</option>`).join('');
    }
  } catch(e){
    select.innerHTML = '<option value="" disabled selected>Error loading students</option>';
  }

  if(modal) modal.style.display = 'flex';
}

function closeDeleteStudentModal(){
  const modal = document.getElementById('delete-modal');
  if(modal) modal.style.display = 'none';
}

async function confirmDeleteFromModal(){
  const select = document.getElementById('delete-student-select');
  const studentName = select ? select.value : '';
  const msgEl = document.getElementById('delete-modal-msg');

  if(!studentName){
    if(msgEl){
      msgEl.textContent = 'Please select a student from the dropdown.';
      msgEl.className = 'reg-msg err';
    }
    return;
  }

  await deleteStudent(studentName);
  closeDeleteStudentModal();
}

// ── Toggle Attendance Recording via Video Tracking ────────────────────────────
async function toggleAttendanceRecording(){
  const btn = document.getElementById('btn-toggle-record');
  const badge = document.getElementById('rec-status-badge');
  const sideRecLabel = document.getElementById('sidebar-rec-label');
  const sideRecIcon = document.getElementById('sidebar-rec-icon');

  try {
    const res = await fetch('/api/recording/toggle', {method: 'POST'});
    const data = await res.json();
    recordingActive = data.active;

    if(recordingActive){
      if(btn){
        btn.className = 'btn btn-record';
        btn.innerHTML = '<span class="rec-circle"></span> RECORD ATTENDANCE [ACTIVE]';
      }
      if(badge){
        badge.className = 'mode-badge rec-badge';
        badge.innerHTML = '<span class="mode-dot rec-dot"></span>ACTIVE';
      }
      if(sideRecLabel) sideRecLabel.textContent = 'Pause Attendance Tracking';
      if(sideRecIcon) sideRecIcon.textContent = '⏸️';
      triggerHud('ATTENDANCE RECORDING RESUMED');
    } else {
      if(btn){
        btn.className = 'btn btn-record paused';
        btn.innerHTML = '<span class="rec-circle"></span> RECORD ATTENDANCE [PAUSED]';
      }
      if(badge){
        badge.className = 'mode-badge rec-badge paused';
        badge.innerHTML = '<span class="mode-dot rec-dot"></span>PAUSED';
      }
      if(sideRecLabel) sideRecLabel.textContent = 'Resume Attendance Tracking';
      if(sideRecIcon) sideRecIcon.textContent = '▶️';
      triggerHud('ATTENDANCE RECORDING PAUSED');
    }
  } catch(e){
    alert('Error toggling attendance recording.');
  }
}

// ── Camera Source Switcher (Backend CCTV vs Client Onboard Webcam 60 FPS) ─────
let useClientWebcam = false;
let clientStream = null;
let clientInferInterval = null;
let clientRenderAnimFrame = null;
let clientDetections = [];

let selectedClientDeviceId = null;
let activeBackendCamId = "Classroom 1 (Front)";
let activeBackendCamSrc = 0;

// ── Multi-Camera Controller & Hot-Plug Device Discovery ─────────────────────
async function refreshCameraDevices(isAuto = false){
  const select = document.getElementById('camera-select');
  const btnRefresh = document.getElementById('btn-refresh-cam');
  if(btnRefresh) btnRefresh.style.transform = 'rotate(180deg)';

  let browserDevices = [];
  try {
    if(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices){
      const allDevs = await navigator.mediaDevices.enumerateDevices();
      browserDevices = allDevs.filter(d => d.kind === 'videoinput');
    }
  } catch(e){
    console.warn("Browser media devices enumeration:", e);
  }

  let backendCameras = [];
  try {
    const res = await fetch('/api/cameras/scan');
    const data = await res.json();
    backendCameras = data.cameras || [];
    activeBackendCamId = data.active || activeBackendCamId;
    activeBackendCamSrc = data.active_source !== undefined ? data.active_source : 0;
  } catch(e){
    console.warn("Backend camera scan:", e);
  }

  if(select){
    const prevVal = select.value;
    select.innerHTML = '';

    // Group 1: Backend Hardware Cameras (OpenCV DirectShow / MSMF)
    const grpBackend = document.createElement('optgroup');
    grpBackend.label = '⚙️ AI Camera Feeds (OpenCV DirectShow / MSMF)';
    let backendMatched = false;
    backendCameras.forEach(cam => {
      const opt = document.createElement('option');
      opt.value = `backend:${cam.id}:${cam.src !== undefined ? cam.src : 0}`;
      const icon = (cam.type === 'EXTERNAL_WEBCAM' || cam.type === 'EXTERNAL_USB') ? '📹' : '🖥️';
      opt.textContent = `${icon} ${cam.label || cam.id} [${cam.status}]`;
      if(!useClientWebcam && (cam.id === activeBackendCamId || cam.src === activeBackendCamSrc)){
        opt.selected = true;
        backendMatched = true;
      }
      grpBackend.appendChild(opt);
    });
    if(!useClientWebcam && !backendMatched && grpBackend.firstChild){
      grpBackend.firstChild.selected = true;
    }
    select.appendChild(grpBackend);

    // Group 2: Browser Webcams (External & Integrated WebRTC)
    if(browserDevices.length > 0){
      const grpBrowser = document.createElement('optgroup');
      grpBrowser.label = '🌐 Browser Webcams (Direct WebRTC)';
      browserDevices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = `browser:${dev.deviceId}`;
        const cleanName = dev.label ? dev.label : `Webcam #${idx + 1}`;
        opt.textContent = `💻 ${cleanName}`;
        if(useClientWebcam && selectedClientDeviceId === dev.deviceId){
          opt.selected = true;
        }
        grpBrowser.appendChild(opt);
      });
      select.appendChild(grpBrowser);
    }

    // Group 3: Quick Action
    const grpAction = document.createElement('optgroup');
    grpAction.label = '➕ Add Stream / Device';
    const optCustom = document.createElement('option');
    optCustom.value = 'action:custom_camera';
    optCustom.textContent = '➕ Connect IP / Phone / External Cam...';
    grpAction.appendChild(optCustom);
    select.appendChild(grpAction);

    // Restore selection if still valid and not explicitly changed
    if(prevVal && select.querySelector(`option[value="${prevVal}"]`)){
      select.value = prevVal;
    }
  }

  if(btnRefresh){
    setTimeout(() => { btnRefresh.style.transform = 'none'; }, 400);
  }

  const totalCams = browserDevices.length + backendCameras.length;
  if(!isAuto){
    triggerHud(`CAMERAS SCANNED: ${totalCams} READY`);
  }
}

async function onCameraSelectChange(val){
  if(!val) return;
  if(val === 'action:custom_camera'){
    toggleAddCameraModal();
    refreshCameraDevices(true);
    return;
  }

  if(val.startsWith('browser:')){
    const devId = val.replace('browser:', '');
    const selOpt = document.querySelector(`#camera-select option[value="${val}"]`);
    const label = selOpt ? selOpt.textContent.replace('💻 ', '') : 'External Webcam';
    await activateClientWebcam(devId, label);
  } else if(val.startsWith('backend:')){
    const parts = val.replace('backend:', '').split(':');
    const camId = parts[0];
    const camSrc = parts.slice(1).join(':');
    await activateBackendCamera(camId, camSrc);
  }
}

async function activateClientWebcam(deviceId = null, deviceLabel = ''){
  stopClientCameraPipeline();
  if(clientStream){
    clientStream.getTracks().forEach(t => t.stop());
    clientStream = null;
  }

  // Release backend camera device first so Windows releases hardware lock
  try {
    await fetch('/api/camera/pause', { method: 'POST' });
  } catch(e){}

  const videoConstraints = {
    width: { ideal: 3840, min: 1280 },
    height: { ideal: 2160, min: 720 },
    frameRate: { ideal: 60, min: 30 }
  };
  if(deviceId){
    videoConstraints.deviceId = { exact: deviceId };
    selectedClientDeviceId = deviceId;
  }

  try {
    clientStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    });

    useClientWebcam = true;
    const clientVideo = document.getElementById('client-webcam');
    const clientCanvas = document.getElementById('client-canvas');
    const backendImg = document.getElementById('video-feed');
    const btn = document.getElementById('btn-cam-src');
    const label = document.getElementById('cam-src-label');
    const camStatus = document.getElementById('cam-status');

    clientVideo.srcObject = clientStream;
    await clientVideo.play();

    backendImg.style.display = 'none';
    clientVideo.style.display = 'block';
    clientCanvas.style.display = 'block';

    btn.classList.add('active-client');
    const cleanLabel = deviceLabel || 'DIRECT WEBCAM';
    label.textContent = cleanLabel.toUpperCase().slice(0, 18);
    camStatus.textContent = `${cleanLabel.toUpperCase()} · ACTIVE`;
    triggerHud(`CONNECTED: ${cleanLabel.toUpperCase()}`);

    startClientCameraPipeline();
  } catch(err){
    console.error("Camera access error:", err);
    alert('Could not access camera via browser: ' + err.message + '\nSwitching to backend camera feed.');
    activateBackendCamera(activeBackendCamId, activeBackendCamSrc);
  }
}

async function startWindowShare(){
  stopClientCameraPipeline();
  if(clientStream){
    clientStream.getTracks().forEach(t => t.stop());
    clientStream = null;
  }

  try {
    // Release backend camera device so hardware locks are freed
    try {
      await fetch('/api/camera/pause', { method: 'POST' });
    } catch(e){}

    // Trigger Chrome / Edge / Firefox native Window / Screen picker modal
    clientStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'window',
        cursor: 'never',
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    });

    useClientWebcam = true;
    const clientVideo = document.getElementById('client-webcam');
    const clientCanvas = document.getElementById('client-canvas');
    const backendImg = document.getElementById('video-feed');
    const camStatus = document.getElementById('cam-status');
    const shareBtnLabel = document.getElementById('share-window-label');

    clientVideo.srcObject = clientStream;
    await clientVideo.play();

    backendImg.style.display = 'none';
    clientVideo.style.display = 'block';
    clientCanvas.style.display = 'block';

    const track = clientStream.getVideoTracks()[0];
    const windowTitle = track.label || 'iVMS-4200 Window';
    if(camStatus) camStatus.textContent = `WINDOW STREAM: ${windowTitle.toUpperCase()}`;
    if(shareBtnLabel) shareBtnLabel.textContent = 'Stop Sharing Window';
    triggerHud(`STREAMING WINDOW: ${windowTitle.toUpperCase()}`);

    // When user clicks 'Stop sharing' from the browser banner
    track.onended = () => {
      if(shareBtnLabel) shareBtnLabel.textContent = 'Share iVMS Window';
      activateBackendCamera(activeBackendCamId, activeBackendCamSrc);
    };

    startClientCameraPipeline();
  } catch(err){
    if(err.name !== 'NotAllowedError'){
      console.error("Window share error:", err);
      alert('Could not share window: ' + err.message);
    }
    activateBackendCamera(activeBackendCamId, activeBackendCamSrc);
  }
}

async function activateBackendCamera(camId, camSrc = 0){
  stopClientCameraPipeline();
  if(clientStream){
    clientStream.getTracks().forEach(t => t.stop());
    clientStream = null;
  }
  useClientWebcam = false;

  // Re-open backend camera stream
  try {
    await fetch('/api/camera/resume', { method: 'POST' });
  } catch(e){}

  const backendImg = document.getElementById('video-feed');
  const clientVideo = document.getElementById('client-webcam');
  const clientCanvas = document.getElementById('client-canvas');
  const btn = document.getElementById('btn-cam-src');
  const label = document.getElementById('cam-src-label');
  const camStatus = document.getElementById('cam-status');

  clientVideo.style.display = 'none';
  clientCanvas.style.display = 'none';
  backendImg.style.display = 'block';
  btn.classList.remove('active-client');
  label.textContent = 'AI CAMERA FEED';

  try {
    const res = await fetch('/api/cameras', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({camera_id: camId, source: camSrc})
    });
    const data = await res.json();
    if(data.success || data.status === 'switched'){
      activeBackendCamId = camId;
      activeBackendCamSrc = data.active_source !== undefined ? data.active_source : camSrc;
      camStatus.textContent = `LIVE TRACKING: ${camId.toUpperCase()}`;
      triggerHud(`SWITCHED: ${camId.toUpperCase()}`);
      backendImg.src = `/video_feed?t=${Date.now()}`;
    } else {
      alert(data.message || 'Failed to switch camera.');
    }
  } catch(e){
    console.error("Backend camera switch failed:", e);
  }
}

async function toggleWebcamSource(){
  if(useClientWebcam){
    await activateBackendCamera(activeBackendCamId, activeBackendCamSrc);
  } else {
    // If already on backend feed, reconnect/refresh the MJPEG stream to fix any stalled frames
    const backendImg = document.getElementById('video-feed');
    if(backendImg){
      backendImg.src = `/video_feed?t=${Date.now()}`;
      triggerHud('RECONNECTED AI CAMERA FEED');
    }
  }
}

// ── Custom External Camera / IP Stream Modal ────────────────────────────────
function toggleAddCameraModal(){
  const modal = document.getElementById('camera-modal');
  if(!modal) return;
  if(modal.style.display === 'none' || !modal.style.display){
    modal.style.display = 'flex';
    const statusEl = document.getElementById('cam-modal-status');
    if(statusEl) statusEl.textContent = '';
  } else {
    modal.style.display = 'none';
  }
}

function onNewCamTypeChange(type){
  const labelEl = document.getElementById('new-cam-src-label');
  const srcInput = document.getElementById('new-cam-src');
  const isHik = type === 'hikvision';
  document.getElementById('hik-fields').style.display = isHik ? 'block' : 'none';
  document.getElementById('new-cam-src-group').style.display = isHik ? 'none' : 'block';
  if(isHik) return;
  if(type === 'usb'){
    if(labelEl) labelEl.textContent = 'DEVICE INDEX:';
    if(srcInput){
      srcInput.placeholder = '1 (for first external USB webcam)';
      srcInput.value = '1';
    }
  } else {
    if(labelEl) labelEl.textContent = 'RTSP / HTTP STREAM URL:';
    if(srcInput){
      srcInput.placeholder = 'http://192.168.1.50:8080/video or rtsp://...';
      srcInput.value = 'http://192.168.1.100:8080/video';
    }
  }
}

async function saveAndConnectCustomCamera(){
  const name = document.getElementById('new-cam-name').value.trim();
  const src = document.getElementById('new-cam-src').value.trim();
  const statusEl = document.getElementById('cam-modal-status');
  const isHik = document.getElementById('new-cam-type').value === 'hikvision';

  let payload = {name: name, source: src, activate: true};
  if(isHik){
    payload = {
      name: name, type: 'hikvision', activate: true,
      ip: document.getElementById('hik-ip').value.trim(),
      username: document.getElementById('hik-user').value.trim(),
      password: document.getElementById('hik-pass').value,
      channel: document.getElementById('hik-channel').value.trim(),
      port: document.getElementById('hik-port').value.trim(),
      stream: document.getElementById('hik-stream').value
    };
    if(!name || !payload.ip || !payload.password){
      if(statusEl) statusEl.textContent = 'Please provide camera label, IP address and password.';
      return;
    }
  } else if(!name || !src){
    if(statusEl) statusEl.textContent = 'Please provide both camera name and source.';
    return;
  }

  if(statusEl) statusEl.textContent = 'Connecting and verifying stream...';

  try {
    const res = await fetch('/api/cameras/add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(data.success){
      if(statusEl) statusEl.textContent = `Connected: ${name}!`;
      setTimeout(() => {
        toggleAddCameraModal();
        refreshCameraDevices(true);
      }, 700);
    } else {
      if(statusEl) statusEl.textContent = data.message || data.error || 'Connection failed.';
    }
  } catch(err){
    if(statusEl) statusEl.textContent = 'Error: ' + err.message;
  }
}

function startClientCameraPipeline(){
  const video = document.getElementById('client-webcam');
  const canvas = document.getElementById('client-canvas');
  const ctx = canvas.getContext('2d');

  // Optimized offscreen canvas for detecting 10-35 students simultaneously at exit (720x405 @ 0.70)
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 720;
  offCanvas.height = 405;
  const offCtx = offCanvas.getContext('2d');

  let isSending = false;

  let fpsCounter = 0;
  let fpsTimer = performance.now();

  // 60 FPS local render loop for video display, boxes & HUD
  function renderFrame(){
    if(!useClientWebcam) return;
    if(video.videoWidth > 0){
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      fpsCounter++;
      const nowMs = performance.now();
      if(nowMs - fpsTimer >= 1000){
        const measuredFps = Math.round((fpsCounter * 1000) / (nowMs - fpsTimer));
        const fpsEl = document.getElementById('telemetry-fps');
        if(fpsEl) fpsEl.textContent = `⚡ ${measuredFps} FPS`;
        fpsCounter = 0;
        fpsTimer = nowMs;
      }

      // Render designated registration range oval guide when active
      if(liveEnrolling){
        const cx = canvas.width / 2;
        const cy = canvas.height * 0.48;
        const rx = canvas.width * 0.24;
        const ry = canvas.height * 0.36;

        // Outer glow oval
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zone header badge
        ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
        ctx.fillRect(cx - 110, cy - ry - 22, 220, 20);
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 110, cy - ry - 22, 220, 20);
        ctx.fillStyle = '#00d4ff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('REGISTRATION ZONE RANGE', cx, cy - ry - 8);
        ctx.restore();
      }

      // Draw detection boxes with accurate resolution scaling (matching 720x405 inference)
      const scaleX = canvas.width / 720;
      const scaleY = canvas.height / 405;
      for(const det of clientDetections){
        const x1 = (det.box ? det.box[0] : 0) * scaleX;
        const y1 = (det.box ? det.box[1] : 0) * scaleY;
        const x2 = (det.box ? det.box[2] : 0) * scaleX;
        const y2 = (det.box ? det.box[3] : 0) * scaleY;
        ctx.strokeStyle = det.color || '#00e676';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // Label box
        ctx.fillStyle = det.color || '#00e676';
        const labelText = det.label || det.name;
        const textWidth = ctx.measureText(labelText).width + 8;
        ctx.fillRect(x1, Math.max(0, y1 - 22), textWidth, 22);

        ctx.fillStyle = '#0a0e1a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(labelText, x1 + 4, Math.max(15, y1 - 6));
      }
    }
    clientRenderAnimFrame = requestAnimationFrame(renderFrame);
  }
  clientRenderAnimFrame = requestAnimationFrame(renderFrame);

  // Send frames to backend recognition model with zero lag (720x405 @ 0.70 quality)
  clientInferInterval = setInterval(async () => {
    if(!useClientWebcam || isSending || video.videoWidth === 0) return;
    isSending = true;
    try {
      offCtx.drawImage(video, 0, 0, 720, 405);
      const base64Data = offCanvas.toDataURL('image/jpeg', 0.70);
      const res = await fetch('/api/process_frame', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          image: base64Data,
          session_id: window.activeAttendanceSessionId || null
        })
      });
      const data = await res.json();
      if(data.detections){
        clientDetections = data.detections;
      }
      if(data.session_alerts && data.session_alerts.length > 0){
        showSessionMismatchAlert(data.session_alerts[0]);
      } else {
        hideSessionMismatchAlert();
      }
      if(data.session_stats){
        updateLiveSessionHUDStats(data.session_stats);
      }
      if(data.enrollment && liveEnrolling){
        // update progress UI
        const st = data.enrollment;
        const bar = document.getElementById('enroll-bar');
        const stepText = document.getElementById('enroll-step-text');
        const pctText = document.getElementById('enroll-pct-text');
        const pct = Math.min(100, Math.round((st.captured_frames / (st.target_frames || 30)) * 100));
        if(bar) bar.style.width = pct + '%';
        if(pctText) pctText.textContent = `${st.captured_frames}/${st.target_frames || 30}`;
        if(stepText) stepText.textContent = st.status_msg;

        if(st.completed){
          liveEnrolling = false;
          const msgEl = document.getElementById('enroll-msg');
          if(msgEl){
            msgEl.textContent = `✓ Biometric profile enrolled: ${st.name} | ${st.class_name} | ${st.reg_no}!`;
            msgEl.className = 'reg-msg ok';
          }
          document.getElementById('btn-start-enroll').style.display = 'inline-block';
          document.getElementById('btn-cancel-enroll').style.display = 'none';
          document.getElementById('enroll-name').disabled = false;
          document.getElementById('enroll-class').disabled = false;
          document.getElementById('enroll-reg').disabled = false;
          document.getElementById('enroll-name').value = '';
          document.getElementById('enroll-reg').value = '';
          pollStats();
          triggerHud(`ENROLLED: ${st.name.toUpperCase()} (${st.reg_no})`);
        }
      }
    } catch(e){}
    isSending = false;
  }, 40);
}

function stopClientCameraPipeline(){
  if(clientStream){
    clientStream.getTracks().forEach(track => track.stop());
    clientStream = null;
  }
  if(clientInferInterval){
    clearInterval(clientInferInterval);
    clientInferInterval = null;
  }
  if(clientRenderAnimFrame){
    cancelAnimationFrame(clientRenderAnimFrame);
    clientRenderAnimFrame = null;
  }
  clientDetections = [];
}

// ── Theater Mode & Fullscreen Controls ────────────────────────────────────────
let theaterModeActive = false;

function toggleTheaterMode(){
  theaterModeActive = !theaterModeActive;
  const mainGrid = document.querySelector('.main');
  const btnIcon = document.getElementById('theater-icon');
  const maxBtn = document.getElementById('btn-maximize-view');

  if(theaterModeActive){
    mainGrid.classList.add('theater-mode');
    if(btnIcon) btnIcon.textContent = '⮌';
    if(maxBtn) maxBtn.innerHTML = '📋 RESTORE SIDEBAR';
    triggerHud('EXPANDED SCREEN MODE');
  } else {
    mainGrid.classList.remove('theater-mode');
    if(btnIcon) btnIcon.textContent = '⛶';
    if(maxBtn) maxBtn.innerHTML = '🖥️ MAXIMIZE SCREEN';
    triggerHud('STANDARD VIEW RESTORED');
  }
}

function toggleFullScreen(){
  const camWrap = document.querySelector('.cam-wrap');
  if(!document.fullscreenElement){
    if(camWrap.requestFullscreen){
      camWrap.requestFullscreen();
    } else if(camWrap.webkitRequestFullscreen){
      camWrap.webkitRequestFullscreen();
    } else if(camWrap.msRequestFullscreen){
      camWrap.msRequestFullscreen();
    }
    triggerHud('FULLSCREEN MODE (PRESS ESC TO EXIT)');
  } else {
    if(document.exitFullscreen){
      document.exitFullscreen();
    }
  }
}
async function changeCamera(camId){
  await activateBackendCamera(camId);
}

// ── Live Video Facial Enrollment (Name, Class, Reg No) ────────────────────────
function toggleLiveEnroll(){
  const panel = document.getElementById('live-enroll-panel');
  const regPanel = document.getElementById('register-panel');
  if(regPanel) regPanel.style.display = 'none';

  if(panel.style.display === 'none' || !panel.style.display){
    panel.style.display = 'block';
    document.getElementById('enroll-name').focus();
  } else {
    panel.style.display = 'none';
    if(liveEnrolling) cancelLiveEnroll();
  }
}

async function startLiveEnroll(){
  const name = document.getElementById('enroll-name').value.trim();
  const className = document.getElementById('enroll-class').value.trim() || 'CSE-A';
  const regNo = document.getElementById('enroll-reg').value.trim();
  const msgEl = document.getElementById('enroll-msg');
  const progWrap = document.getElementById('enroll-progress-wrap');
  const btnStart = document.getElementById('btn-start-enroll');
  const btnCancel = document.getElementById('btn-cancel-enroll');

  if(!name){
    msgEl.textContent = 'Please enter student name.';
    msgEl.className = 'reg-msg err';
    return;
  }
  if(!regNo){
    msgEl.textContent = 'Please enter registration number.';
    msgEl.className = 'reg-msg err';
    return;
  }

  msgEl.textContent = `Initializing video tracking enrollment for ${name} (${regNo})...`;
  msgEl.className = 'reg-msg';

  try {
    const res = await fetch('/enroll/start', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: name,
        class_name: className,
        reg_no: regNo
      })
    });
    const data = await res.json();
    if(!res.ok){
      msgEl.textContent = data.error || 'Failed to start enrollment.';
      msgEl.className = 'reg-msg err';
      return;
    }

    liveEnrolling = true;
    progWrap.style.display = 'flex';
    btnStart.style.display = 'none';
    btnCancel.style.display = 'inline-block';
    document.getElementById('enroll-name').disabled = true;
    document.getElementById('enroll-class').disabled = true;
    document.getElementById('enroll-reg').disabled = true;

    if(enrollPollInterval) clearInterval(enrollPollInterval);
    enrollPollInterval = setInterval(pollEnrollStatus, 250);

  } catch(e){
    msgEl.textContent = 'Network error starting enrollment.';
    msgEl.className = 'reg-msg err';
  }
}

async function pollEnrollStatus(){
  if(!liveEnrolling) return;
  try {
    const res = await fetch('/enroll/status');
    const st = await res.json();

    const bar = document.getElementById('enroll-bar');
    const stepText = document.getElementById('enroll-step-text');
    const pctText = document.getElementById('enroll-pct-text');
    const msgEl = document.getElementById('enroll-msg');

    const pct = Math.min(100, Math.round((st.captured / (st.target || 30)) * 100));
    bar.style.width = pct + '%';
    pctText.textContent = `${st.captured}/${st.target || 30}`;
    stepText.textContent = st.status_msg;

    if(st.completed){
      clearInterval(enrollPollInterval);
      liveEnrolling = false;
      msgEl.textContent = `✓ Biometric profile enrolled: ${st.name} | ${st.class_name} | ${st.reg_no}!`;
      msgEl.className = 'reg-msg ok';

      document.getElementById('btn-start-enroll').style.display = 'inline-block';
      document.getElementById('btn-cancel-enroll').style.display = 'none';
      document.getElementById('enroll-name').disabled = false;
      document.getElementById('enroll-class').disabled = false;
      document.getElementById('enroll-reg').disabled = false;
      document.getElementById('enroll-name').value = '';
      document.getElementById('enroll-reg').value = '';

      pollStats();
      triggerHud(`ENROLLED: ${st.name.toUpperCase()} (${st.reg_no})`);
    }
  } catch(e){}
}

async function cancelLiveEnroll(){
  if(enrollPollInterval) clearInterval(enrollPollInterval);
  liveEnrolling = false;
  await fetch('/enroll/cancel', {method:'POST'});

  document.getElementById('btn-start-enroll').style.display = 'inline-block';
  document.getElementById('btn-cancel-enroll').style.display = 'none';
  document.getElementById('enroll-name').disabled = false;
  document.getElementById('enroll-class').disabled = false;
  document.getElementById('enroll-reg').disabled = false;
  document.getElementById('enroll-progress-wrap').style.display = 'none';
  document.getElementById('enroll-msg').textContent = 'Enrollment cancelled.';
  document.getElementById('enroll-msg').className = 'reg-msg';
}

// ── File Upload Registration (Name, Class, Reg No) ────────────────────────────
function toggleRegister(){
  toggleRegisterModal();
}

function previewRegisterPhoto(event){
  const file = event.target.files[0];
  const box = document.getElementById('reg-img-preview-box');
  const img = document.getElementById('reg-img-preview');
  if(file){
    const reader = new FileReader();
    reader.onload = e => {
      img.src = e.target.result;
      box.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    box.style.display = 'none';
  }
}

async function registerFace(){
  const name = document.getElementById('reg-name').value.trim();
  const className = document.getElementById('reg-class').value.trim() || 'CSE-A';
  const regNo = document.getElementById('reg-no').value.trim();
  const fileInput = document.getElementById('reg-image');
  const imageFile = fileInput.files[0];
  const msgEl = document.getElementById('reg-msg');
  const btnUpload = document.getElementById('btn-upload-reg');

  if(!name || !imageFile){
    msgEl.textContent = 'Student name and photo are required.';
    msgEl.className = 'reg-msg err';
    return;
  }
  if(!regNo){
    msgEl.textContent = 'Registration Number is required.';
    msgEl.className = 'reg-msg err';
    return;
  }

  msgEl.textContent = 'Enrolling student details & biometric vector...';
  msgEl.className = 'reg-msg';
  btnUpload.disabled = true;

  const formData = new FormData();
  formData.append('name', name);
  formData.append('class_name', className);
  formData.append('reg_no', regNo);
  formData.append('image', imageFile);

  try {
    const res = await fetch('/register', {method:'POST', body: formData});
    const data = await res.json();
    btnUpload.disabled = false;

    if(res.ok){
      msgEl.textContent = '✓ ' + data.message;
      msgEl.className = 'reg-msg ok';
      document.getElementById('reg-name').value = '';
      document.getElementById('reg-no').value = '';
      fileInput.value = '';
      const previewBox = document.getElementById('reg-img-preview-box');
      if(previewBox) previewBox.style.display = 'none';
      pollStats();
      if(typeof loadEnrolledStudents === 'function') loadEnrolledStudents();
      triggerHud(`ENROLLED: ${name.toUpperCase()} (${regNo})`);
    } else {
      msgEl.textContent = '✗ ' + (data.error || 'Failed to enroll student');
      msgEl.className = 'reg-msg err';
    }
  } catch(e){
    btnUpload.disabled = false;
    msgEl.textContent = '✗ Network error connecting to backend.';
    msgEl.className = 'reg-msg err';
  }
}

// ── Image Upload Recognition & Attendance ─────────────────────────────────────
let selectedRecImageFile = null;

function toggleImageRecognitionModal(){
  const modal = document.getElementById('image-recognition-modal');
  if(!modal) return;
  const isHidden = (modal.style.display === 'none' || !modal.style.display);
  // close other panels if open
  const regPanel = document.getElementById('register-panel');
  const enrollPanel = document.getElementById('live-enroll-panel');
  if(regPanel) regPanel.style.display = 'none';
  if(enrollPanel) enrollPanel.style.display = 'none';

  modal.style.display = isHidden ? 'flex' : 'none';
}

function handleImageRecSelected(event){
  const file = event.target.files[0];
  if(!file) return;
  selectedRecImageFile = file;

  const prompt = document.getElementById('img-rec-drop-prompt');
  const previewWrap = document.getElementById('img-rec-preview-wrap');
  const previewImg = document.getElementById('img-rec-preview');
  const filenameEl = document.getElementById('img-rec-filename');

  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src = e.target.result;
    filenameEl.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    prompt.style.display = 'none';
    previewWrap.style.display = 'block';
  };
  reader.readAsDataURL(file);

  const msgEl = document.getElementById('img-rec-msg');
  msgEl.textContent = '';
  msgEl.className = 'reg-msg';
}

function resetImageRecognition(){
  selectedRecImageFile = null;
  const input = document.getElementById('img-rec-input');
  if(input) input.value = '';
  const prompt = document.getElementById('img-rec-drop-prompt');
  const previewWrap = document.getElementById('img-rec-preview-wrap');
  const resultsWrap = document.getElementById('img-rec-results');
  const msgEl = document.getElementById('img-rec-msg');

  if(prompt) prompt.style.display = 'block';
  if(previewWrap) previewWrap.style.display = 'none';
  if(resultsWrap) resultsWrap.style.display = 'none';
  if(msgEl) { msgEl.textContent = ''; msgEl.className = 'reg-msg'; }
}

async function submitImageRecognition(){
  const msgEl = document.getElementById('img-rec-msg');
  const btn = document.getElementById('btn-run-img-rec');
  const markAtt = document.getElementById('img-rec-mark-att').checked;
  const resultsWrap = document.getElementById('img-rec-results');

  if(!selectedRecImageFile){
    msgEl.textContent = 'Please choose or drag an image first.';
    msgEl.className = 'reg-msg err';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'ANALYZING FACES...';
  msgEl.textContent = 'Scanning facial biometrics and matching against enrolled directory...';
  msgEl.className = 'reg-msg';

  const formData = new FormData();
  formData.append('image', selectedRecImageFile);
  formData.append('mark_attendance', markAtt ? 'true' : 'false');

  try {
    const res = await fetch('/api/recognize_image', {method: 'POST', body: formData});
    const data = await res.json();
    btn.disabled = false;
    btn.textContent = 'SCAN & RECOGNIZE FACES';

    if(!res.ok){
      msgEl.textContent = '✗ ' + (data.error || 'Recognition failed');
      msgEl.className = 'reg-msg err';
      return;
    }

    if(data.total_faces === 0){
      msgEl.textContent = '⚠️ ' + (data.message || 'No faces detected in the uploaded image.');
      msgEl.className = 'reg-msg err';
      if(resultsWrap) resultsWrap.style.display = 'none';
      return;
    }

    msgEl.textContent = `✓ Scan complete! ${data.recognized_count} of ${data.total_faces} faces identified${markAtt ? ' · Attendance updated' : ''}.`;
    msgEl.className = 'reg-msg ok';

    // Update badges
    document.getElementById('res-badge-total').textContent = `${data.total_faces} Face${data.total_faces > 1 ? 's' : ''} Detected`;
    document.getElementById('res-badge-known').textContent = `${data.recognized_count} Enrolled Student${data.recognized_count !== 1 ? 's' : ''}`;
    document.getElementById('res-badge-unknown').textContent = `${data.unknown_count} Unregistered`;

    // Set annotated image
    if(data.annotated_image){
      document.getElementById('img-rec-annotated').src = data.annotated_image;
    }

    // Build student cards
    const cardsContainer = document.getElementById('img-rec-student-cards');
    cardsContainer.innerHTML = '';

    if(data.detections && data.detections.length > 0){
      data.detections.forEach(det => {
        const card = document.createElement('div');
        card.className = 'rec-student-card ' + (det.is_known ? 'known' : 'unknown');

        const statusTag = det.is_known 
          ? `<span class="rec-status-badge present">${det.status}</span>` 
          : `<span class="rec-status-badge unregistered">UNREGISTERED</span>`;

        card.innerHTML = `
          <div class="rec-card-header">
            <span class="rec-student-name">${det.name}</span>
            ${statusTag}
          </div>
          <div class="rec-card-details">
            <div><span class="rec-dim">Reg No:</span> ${det.reg_no}</div>
            <div><span class="rec-dim">Class:</span> ${det.class_name}</div>
            <div><span class="rec-dim">Confidence:</span> <strong style="color:${det.is_known ? '#00e676' : '#ff5252'}">${det.conf}%</strong></div>
          </div>
        `;
        cardsContainer.appendChild(card);
      });
    }

    resultsWrap.style.display = 'block';
    pollStats();
    if(typeof fetchAttendance === 'function') fetchAttendance();
    triggerHud(`RECOGNIZED: ${data.recognized_count}/${data.total_faces} STUDENTS`);

  } catch(e){
    btn.disabled = false;
    btn.textContent = 'SCAN & RECOGNIZE FACES';
    msgEl.textContent = '✗ Network error connecting to face recognition service.';
    msgEl.className = 'reg-msg err';
  }
}

// ── Video Upload Recognition & Database Attendance Roster ─────────────────────
let selectedRecVideoFile = null;
let currentVideoRosterData = [];
let videoScanProgressTimer = null;

function toggleVideoRecognitionModal(){
  const modal = document.getElementById('video-recognition-modal');
  if(!modal) return;
  const isHidden = (modal.style.display === 'none' || !modal.style.display);
  // close other panels if open
  const regPanel = document.getElementById('register-panel');
  const enrollPanel = document.getElementById('live-enroll-panel');
  const imgModal = document.getElementById('image-recognition-modal');
  const delModal = document.getElementById('delete-modal');
  const ttModal = document.getElementById('timetable-modal');
  if(regPanel) regPanel.style.display = 'none';
  if(enrollPanel) enrollPanel.style.display = 'none';
  if(imgModal) imgModal.style.display = 'none';
  if(delModal) delModal.style.display = 'none';
  if(ttModal) ttModal.style.display = 'none';

  modal.style.display = isHidden ? 'flex' : 'none';
}

function handleVideoRecSelected(event){
  const file = event.target.files[0];
  if(!file) return;
  selectedRecVideoFile = file;

  const prompt = document.getElementById('vid-rec-drop-prompt');
  const previewWrap = document.getElementById('vid-rec-preview-wrap');
  const previewVid = document.getElementById('vid-rec-preview');
  const filenameEl = document.getElementById('vid-rec-filename');

  const fileURL = URL.createObjectURL(file);
  previewVid.src = fileURL;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  filenameEl.textContent = `🎬 ${file.name} (${sizeMB} MB)`;
  prompt.style.display = 'none';
  previewWrap.style.display = 'block';

  const msgEl = document.getElementById('vid-rec-msg');
  msgEl.textContent = '';
  msgEl.className = 'reg-msg';
}

function resetVideoRecognition(){
  if(videoScanProgressTimer) clearInterval(videoScanProgressTimer);
  selectedRecVideoFile = null;
  currentVideoRosterData = [];

  const input = document.getElementById('vid-rec-input');
  if(input) input.value = '';
  const prompt = document.getElementById('vid-rec-drop-prompt');
  const previewWrap = document.getElementById('vid-rec-preview-wrap');
  const previewVid = document.getElementById('vid-rec-preview');
  const resultsWrap = document.getElementById('vid-rec-results');
  const progWrap = document.getElementById('vid-rec-progress-wrap');
  const msgEl = document.getElementById('vid-rec-msg');
  const keyframeWrap = document.getElementById('vid-rec-keyframe-wrap');

  if(previewVid){
    previewVid.pause();
    previewVid.removeAttribute('src');
    previewVid.load();
  }
  if(prompt) prompt.style.display = 'block';
  if(previewWrap) previewWrap.style.display = 'none';
  if(resultsWrap) resultsWrap.style.display = 'none';
  if(progWrap) progWrap.style.display = 'none';
  if(keyframeWrap) keyframeWrap.style.display = 'none';
  if(msgEl) { msgEl.textContent = ''; msgEl.className = 'reg-msg'; }
}

async function submitVideoRecognition(){
  const msgEl = document.getElementById('vid-rec-msg');
  const btn = document.getElementById('btn-run-vid-rec');
  const markAtt = document.getElementById('vid-rec-mark-att').checked;
  const resultsWrap = document.getElementById('vid-rec-results');
  const progWrap = document.getElementById('vid-rec-progress-wrap');
  const progBar = document.getElementById('vid-rec-bar');
  const stepText = document.getElementById('vid-rec-step-text');
  const pctText = document.getElementById('vid-rec-pct-text');

  if(!selectedRecVideoFile){
    msgEl.textContent = 'Please choose or drag a video file first.';
    msgEl.className = 'reg-msg err';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'ANALYZING VIDEO...';
  msgEl.textContent = 'Uploading video and initializing spatial-temporal face recognition...';
  msgEl.className = 'reg-msg';

  // Show progress animation
  progWrap.style.display = 'flex';
  progBar.style.width = '15%';
  pctText.textContent = '15%';
  stepText.textContent = 'Uploading video file to server...';

  let fakePct = 15;
  if(videoScanProgressTimer) clearInterval(videoScanProgressTimer);
  videoScanProgressTimer = setInterval(() => {
    if(fakePct < 88){
      fakePct += Math.floor(Math.random() * 8) + 3;
      if(fakePct > 88) fakePct = 88;
      progBar.style.width = fakePct + '%';
      pctText.textContent = fakePct + '%';
      if(fakePct > 35 && fakePct < 65){
        stepText.textContent = 'Extracting keyframes & running ArcFace biometric extraction...';
      } else if(fakePct >= 65){
        stepText.textContent = 'Cross-referencing face vectors with enrolled student database...';
      }
    }
  }, 450);

  const formData = new FormData();
  formData.append('video', selectedRecVideoFile);
  formData.append('mark_attendance', markAtt ? 'true' : 'false');

  try {
    const res = await fetch('/api/recognize_video', {method: 'POST', body: formData});
    const data = await res.json();

    if(videoScanProgressTimer) clearInterval(videoScanProgressTimer);
    progBar.style.width = '100%';
    pctText.textContent = '100%';
    stepText.textContent = 'Analysis complete!';
    setTimeout(() => { if(progWrap) progWrap.style.display = 'none'; }, 800);

    btn.disabled = false;
    btn.textContent = 'SCAN VIDEO & COMPILE ROSTER';

    if(!res.ok){
      msgEl.textContent = '✗ ' + (data.error || 'Video analysis failed');
      msgEl.className = 'reg-msg err';
      return;
    }

    currentVideoRosterData = data.students || [];

    msgEl.textContent = `✓ Video analysis complete! ${data.present_count} Present · ${data.absent_count} Absent out of ${data.total_enrolled} enrolled students (${data.duration_formatted} duration, ${data.frames_processed} frames scanned).`;
    msgEl.className = 'reg-msg ok';

    // Update summary badges
    document.getElementById('vid-res-total').textContent = `${data.total_enrolled} Enrolled in DB`;
    document.getElementById('vid-res-present').textContent = `${data.present_count} Present`;
    document.getElementById('vid-res-absent').textContent = `${data.absent_count} Absent`;
    document.getElementById('vid-res-duration').textContent = `⏱️ ${data.duration_formatted} (${data.duration_sec}s)`;
    document.getElementById('vid-res-frames').textContent = `⚡ ${data.frames_processed} Frames Scanned`;

    // Render Keyframe
    const keyframeWrap = document.getElementById('vid-rec-keyframe-wrap');
    const keyframeImg = document.getElementById('vid-rec-keyframe');
    if(data.annotated_preview){
      keyframeImg.src = data.annotated_preview;
      keyframeWrap.style.display = 'block';
    } else {
      keyframeWrap.style.display = 'none';
    }

    // Render roster table
    filterVideoRoster('all');

    resultsWrap.style.display = 'block';
    pollStats();
    if(typeof fetchAttendance === 'function') fetchAttendance();
    triggerHud(`VIDEO ATTENDANCE: ${data.present_count} PRESENT / ${data.absent_count} ABSENT`);

  } catch(e){
    if(videoScanProgressTimer) clearInterval(videoScanProgressTimer);
    btn.disabled = false;
    btn.textContent = 'SCAN VIDEO & COMPILE ROSTER';
    msgEl.textContent = '✗ Network error or timeout connecting to video recognition service.';
    msgEl.className = 'reg-msg err';
    if(progWrap) progWrap.style.display = 'none';
  }
}

function filterVideoRoster(statusFilter){
  const buttons = {
    'all': document.getElementById('filter-btn-all'),
    'PRESENT': document.getElementById('filter-btn-present'),
    'ABSENT': document.getElementById('filter-btn-absent')
  };
  Object.keys(buttons).forEach(k => {
    if(buttons[k]) buttons[k].classList.remove('active');
  });
  if(buttons[statusFilter]) buttons[statusFilter].classList.add('active');

  const tbody = document.getElementById('vid-roster-tbody');
  if(!tbody) return;
  tbody.innerHTML = '';

  const filtered = currentVideoRosterData.filter(item => {
    if(statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: #94a3b8; font-family:var(--mono);">No students match filter '${statusFilter}'.</td></tr>`;
    return;
  }

  filtered.forEach(st => {
    const isPres = st.status === 'PRESENT';
    const tr = document.createElement('tr');
    tr.className = isPres ? 'row-present' : 'row-absent';

    const sName = st.name || st.student_name || st.studentName || st.reg_no || 'Unknown Student';
    const sReg = st.reg_no || st.student_reg_no || st.regNo || '--';
    const sClass = st.class_name || st.className || st.section || '--';

    const statusBadge = isPres
      ? `<span class="rec-status-badge present">● PRESENT</span>`
      : `<span class="rec-status-badge absent">○ ABSENT</span>`;

    const confDisplay = isPres
      ? `<strong style="color:#059669; font-weight:700; font-family:var(--font-mono, monospace);">${st.confidence}%</strong>`
      : `<span style="color:#64748b; font-family:var(--font-mono, monospace);">--</span>`;

    const timeDisplay = isPres
      ? `<span style="font-family:var(--font-mono, monospace); color:#475569; font-weight:500;">⏱️ ${st.time_range}</span>`
      : `<span style="color:#64748b; font-family:var(--font-mono, monospace);">--</span>`;

    const occDisplay = isPres
      ? `<span style="font-family:var(--font-mono, monospace); color:#0284c7; font-weight:600;">${st.occurrences} hits</span>`
      : `<span style="color:#64748b; font-family:var(--font-mono, monospace);">0</span>`;

    tr.innerHTML = `
      <td><strong style="color:${isPres ? '#0f172a' : '#64748b'}; font-size:13px; font-weight:600;">${sName}</strong></td>
      <td style="font-family:var(--font-mono, monospace); font-size:11.5px; color:#475569; font-weight:500;">${sReg}</td>
      <td style="font-family:var(--font-mono, monospace); font-size:11.5px; color:#334155; font-weight:500;">${sClass}</td>
      <td style="text-align:center;">${statusBadge}</td>
      <td>${confDisplay}</td>
      <td>${timeDisplay}</td>
      <td>${occDisplay}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── HUD Banner ────────────────────────────────────────────────────────────────
function triggerHud(text){
  const banner = document.getElementById('hud-banner');
  const textEl = document.getElementById('hud-text');
  if(!banner || !textEl) return;
  textEl.textContent = text;
  banner.style.display = 'flex';
  setTimeout(()=>{ banner.style.display = 'none'; }, 3000);
}

// ── Polling Loops ─────────────────────────────────────────────────────────────
async function pollAttendance(){
  try {
    const res = await fetch('/attendance');
    logs = await res.json();
    if(activeTab === 'log') renderLog();
    else if(activeTab === 'roster') renderRoster();
    if(typeof updateDashboardRosterAndSpotlight === 'function'){
      updateDashboardRosterAndSpotlight();
    }
  } catch(e){}
  setTimeout(pollAttendance, 1500);
}

async function pollEvents(){
  try {
    const res = await fetch('/api/events');
    events = await res.json();
    if(activeTab === 'events') renderEvents();
    if(typeof updateDashboardActivityStream === 'function'){
      updateDashboardActivityStream();
    }
  } catch(e){}
  setTimeout(pollEvents, 2000);
}

async function pollStats(){
  try {
    const res = await fetch('/stats');
    const data = await res.json();

    const totalEnrolled = data.total_enrolled || '0';
    const presentCount = data.present || '0';
    const activePeriod = data.active_period || 'Period 1';

    const elEnrolled = document.getElementById('stat-enrolled');
    const elPresent = document.getElementById('stat-present');
    const elLate = document.getElementById('stat-late');
    const elAnomalies = document.getElementById('stat-anomalies');
    const sideEnrolled = document.getElementById('side-stat-enrolled');
    const sidePresent = document.getElementById('side-stat-present');
    const sidePeriod = document.getElementById('side-stat-period');

    const elMatchCount = document.getElementById('stat-match-count');
    if(elMatchCount) elMatchCount.textContent = presentCount;

    if(elEnrolled) elEnrolled.textContent = totalEnrolled;
    if(elPresent) elPresent.textContent = presentCount;
    if(elLate) elLate.textContent = data.late || '0';
    if(elAnomalies) elAnomalies.textContent = data.anomalies_count || '0';

    if(sideEnrolled) sideEnrolled.textContent = totalEnrolled;
    if(sidePresent) sidePresent.textContent = presentCount;
    if(sidePeriod) sidePeriod.textContent = activePeriod;

    if(data.recording_active !== undefined){
      recordingActive = data.recording_active;
      const btn = document.getElementById('btn-toggle-record');
      const badge = document.getElementById('rec-status-badge');
      if(btn){
        btn.className = recordingActive ? 'btn btn-primary' : 'btn btn-primary paused';
      }
      if(badge){
        badge.className = recordingActive ? 'stream-status-pill online' : 'stream-status-pill paused';
        badge.innerHTML = `<span class="stream-pulse-dot"></span><span>${recordingActive ? 'CAMERA ACTIVE' : 'CAMERA PAUSED'}</span>`;
      }
    }
    if(typeof updateDashboardKPIs === 'function'){
      updateDashboardKPIs(data);
    }
  } catch(e){}
  setTimeout(pollStats, 4000);
}

let selectedTimetableClass = '';
let availableClassesList = ['CSE-A'];

async function loadTimetable(classFilter = ''){
  try {
    selectedTimetableClass = classFilter;
    const url = classFilter ? `/api/timetable?class_name=${encodeURIComponent(classFilter)}` : '/api/timetable';
    const res = await fetch(url);
    const data = await res.json();
    timetable = data.timetable || [];
    availableClassesList = data.available_classes || ['CSE-A'];
    if(activeTab === 'timetable') renderTimetable();
  } catch(e){}
}

// ── Rendering Functions ───────────────────────────────────────────────────────
function renderLog(){
  const list = document.getElementById('log-list');
  if(!logs.length){
    list.innerHTML = '<div class="empty-state">No classroom attendance logged yet. Click RECORD ATTENDANCE to log automatically from video tracking.</div>';
    return;
  }
  list.innerHTML = logs.map(e => {
    const c = getColor(e.name);
    let badgeClass = 'badge-in';
    if(e.status.includes('ABSENT')) badgeClass = 'badge-absent';
    else if(e.status.includes('LATE')) badgeClass = 'badge-late';
    else if(e.status.includes('DEFICIT')) badgeClass = 'badge-def';

    const outAlert = (e.exited && e.out_minutes > 0) 
      ? `<span class="out-alert-tag">⚠ Out of frame: ${e.out_minutes}m ${e.out_minutes >= 15 ? '(ABSENT)' : ''}</span>` 
      : '';

    return `<div class="log-entry">
      <div class="avatar" style="background:${c.bg};color:${c.color}">${initials(e.name)}</div>
      <div class="log-info">
        <div class="log-name">
          <span>${e.name}</span>
          <span class="log-tag">${e.class_name || 'CSE-A'}</span>
          <span class="log-tag" style="color:var(--accent);border-color:rgba(0,212,255,0.25)">${e.reg_no || '--'}</span>
          ${outAlert}
        </div>
        <div class="log-meta">${e.period || 'Period 1'} · First: ${e.first_in} · Dwell: ${e.duration} · Match: ${e.confidence}</div>
      </div>
      <span class="badge ${badgeClass}">${e.status}</span>
    </div>`;
  }).join('');
}

// ── Daily Register (Deduplicated, 1 Record Per Student for Day & Period) ──────
let dailyRegisterList = [];

async function loadDailyRegister(){
  try {
    const res = await fetch('/api/attendance/daily');
    dailyRegisterList = await res.json();
    if(activeTab === 'daily') renderDailyRegister();
  } catch(e){}
}

function renderDailyRegister(){
  const list = document.getElementById('log-list');
  const dateStr = new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});

  if(!dailyRegisterList.length){
    list.innerHTML = `
      <div class="daily-register-wrap">
        <div class="daily-reg-header">
          <span>DATE: ${dateStr.toUpperCase()}</span>
          <span>PERIOD TIMETABLE SYNC</span>
        </div>
        <div class="empty-state">No attendance records finalized for today yet.<br>Faces tracked in Classroom 1 (Front/Back cameras) are automatically registered once per period.</div>
      </div>`;
    return;
  }

  list.innerHTML = `
    <div class="daily-register-wrap">
      <div class="daily-reg-header">
        <span>DAILY ATTENDANCE SHEET · ${dateStr.toUpperCase()}</span>
        <span>${dailyRegisterList.length} STUDENTS</span>
      </div>` +
    dailyRegisterList.map(item => {
      const c = getColor(item.student_name);
      let badgeClass = 'badge-in';
      if(item.status.includes('ABSENT')) badgeClass = 'badge-absent';
      else if(item.status.includes('LATE')) badgeClass = 'badge-late';
      else if(item.status.includes('DEFICIT')) badgeClass = 'badge-def';

      return `
        <div class="daily-reg-row">
          <div style="display:flex; align-items:center; gap:8px; flex:1">
            <div class="avatar" style="background:${c.bg};color:${c.color}">${initials(item.student_name)}</div>
            <div>
              <div style="font-size:12px; font-weight:600; display:flex; gap:6px; align-items:center">
                <span>${item.student_name}</span>
                <span class="log-tag">${item.class_name}</span>
                <span class="log-tag" style="color:var(--accent);border-color:rgba(0,212,255,0.25)">${item.reg_no}</span>
              </div>
              <div style="font-size:10px; color:var(--muted); margin-top:2px; font-family:var(--mono)">
                ${item.period} · In: ${item.first_in} · Dwell: ${item.dwell} (${item.attendance_pct})
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px">
            <span class="badge ${badgeClass}">${item.status}</span>
            <select class="reg-action-select" onchange="setManualAttendance('${item.student_name}', this.value, '${item.period}')" title="Override attendance status">
              <option value="" disabled selected>Mark</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT (>15m Out)">Absent</option>
              <option value="LATE">Late</option>
            </select>
            <button class="btn-del-student" style="padding:2px 5px" onclick="deleteStudent('${item.student_name}')" title="Delete student profile">🗑</button>
          </div>
        </div>`;
    }).join('') + `</div>`;
}

async function setManualAttendance(studentName, status, period){
  try {
    const res = await fetch('/api/attendance/register_daily', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        student_name: studentName,
        status: status,
        period: period
      })
    });
    const data = await res.json();
    triggerHud(`${studentName}: MARKED ${status}`);
    loadDailyRegister();
    pollAttendance();
    pollStats();
  } catch(e){
    alert('Error updating attendance record.');
  }
}

function renderRoster(){
  const list = document.getElementById('log-list');
  if(!logs.length){
    list.innerHTML = '<div class="empty-state">No active students verified in classroom.</div>';
    return;
  }
  list.innerHTML = `<div class="section-title">VERIFIED ACTIVE ROSTER (${logs.length})</div>` +
    logs.map(e => {
      const c = getColor(e.name);
      const dotColor = e.status.includes('DEFICIT') ? 'var(--red)' : (e.status.includes('LATE') ? 'var(--amber)' : 'var(--green)');
      const confNum = parseInt(e.confidence) || 95;
      return `<div class="roster-item">
        <div class="status-dot" style="background:${dotColor}"></div>
        <div class="avatar" style="background:${c.bg};color:${c.color}">${initials(e.name)}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;display:flex;gap:6px;align-items:center">
            <span>${e.name}</span>
            <span class="log-tag">${e.class_name || 'CSE-A'}</span>
            <span class="log-tag" style="color:var(--accent);border-color:rgba(0,212,255,0.25)">${e.reg_no || '--'}</span>
          </div>
          <div style="font-size:10px;color:var(--muted)">Dwell: ${e.duration} (${e.attendance_pct}) · Match: ${e.confidence}</div>
        </div>
        <div style="text-align:right">
          <div class="conf-bar-wrap"><div class="conf-bar" style="width:${confNum}%"></div></div>
          <div style="font-size:9px;color:var(--accent);margin-top:2px;font-family:var(--mono)">${e.confidence}</div>
        </div>
      </div>`;
    }).join('');
}

function renderEvents(){
  const list = document.getElementById('log-list');
  if(!events.length){
    list.innerHTML = '<div class="empty-state">No identity events dispatched yet.</div>';
    return;
  }
  list.innerHTML = `<div class="section-title">EVENT BUS STREAM (${events.length})</div>` +
    events.slice(0, 30).map(ev => {
      const c = getColor(ev.name);
      return `<div class="event-item">
        <div class="avatar" style="background:${c.bg};color:${c.color}">${initials(ev.name)}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600">${ev.type}: ${ev.name}</div>
          <div style="font-size:10px;color:var(--muted)">${ev.details} · ${ev.timestamp}</div>
        </div>
        <span class="badge badge-in" style="font-size:8px">${ev.camera.split(' ')[0]}</span>
      </div>`;
    }).join('');
}

function renderTimetable(){
  const list = document.getElementById('log-list');
  const classOptions = ['<option value="">All Classes / Sections</option>']
    .concat(availableClassesList.map(c => `<option value="${c}" ${c === selectedTimetableClass ? 'selected' : ''}>Class: ${c}</option>`))
    .join('');

  let contentHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px;">
      <select onchange="loadTimetable(this.value)" class="reg-input" style="flex:1; max-width:220px; font-size:11px; padding:6px 10px;">
        ${classOptions}
      </select>
      <button class="btn btn-accent" style="padding:6px 14px; font-size:11px;" onclick="toggleTimetableModal()">
        ➕ ADD / UPLOAD TIMETABLE
      </button>
    </div>`;

  if(!timetable.length){
    contentHtml += `<div class="empty-state">No scheduled periods found${selectedTimetableClass ? ` for class ${selectedTimetableClass}` : ''}. Click <b>➕ ADD / UPLOAD TIMETABLE</b> to configure periods.</div>`;
    list.innerHTML = contentHtml;
    return;
  }

  contentHtml += `<div style="display:flex; flex-direction:column; gap:8px;">` +
    timetable.map(t => {
      return `<div class="timetable-item" style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
        <div style="flex:1">
          <div style="font-size:12px; font-weight:700; color:var(--accent); display:flex; align-items:center; gap:6px;">
            <span class="log-tag" style="background:rgba(0,212,255,0.15); color:#00d4ff; font-weight:bold;">${t.class_name || 'CSE-A'}</span>
            <span>${t.code} — ${t.course}</span>
          </div>
          <div style="font-size:10px; color:var(--muted); margin-top:3px;">
            ${t.classroom} · Faculty: <b>${t.faculty || 'Unassigned'}</b>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge badge-late" style="font-size:11px; font-family:var(--mono);">${t.start} - ${t.end}</span>
          <button onclick="deleteTimetableSlot(${t.id})" style="background:transparent; border:none; color:#f87171; cursor:pointer; font-size:13px;" title="Delete period">✕</button>
        </div>
      </div>`;
    }).join('') + `</div>`;

  list.innerHTML = contentHtml;
}

// ── Timetable Manager Modal Functions ─────────────────────────────────────────
function toggleTimetableModal(){
  const modal = document.getElementById('timetable-modal');
  const enrollPanel = document.getElementById('live-enroll-panel');
  const regPanel = document.getElementById('register-panel');
  const delModal = document.getElementById('delete-modal');

  if(enrollPanel) enrollPanel.style.display = 'none';
  if(regPanel) regPanel.style.display = 'none';
  if(delModal) delModal.style.display = 'none';

  if(!modal) return;
  modal.style.display = modal.style.display === 'none' || !modal.style.display ? 'flex' : 'none';
  const msgEl = document.getElementById('tt-modal-msg');
  if(msgEl) msgEl.textContent = '';
}

async function submitTimetableSlot(){
  const className = document.getElementById('tt-class').value.trim() || 'CSE-A';
  const courseCode = document.getElementById('tt-course-code').value.trim();
  const courseName = document.getElementById('tt-course-name').value.trim();
  const faculty = document.getElementById('tt-faculty').value.trim();
  const startTime = document.getElementById('tt-start').value.trim();
  const endTime = document.getElementById('tt-end').value.trim();
  const msgEl = document.getElementById('tt-modal-msg');

  if(!courseCode || !startTime || !endTime){
    if(msgEl){
      msgEl.textContent = 'Course Code, Start Time, and End Time are required.';
      msgEl.className = 'reg-msg err';
    }
    return;
  }

  try {
    const res = await fetch('/api/timetable', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        class_name: className,
        course_code: courseCode,
        course_name: courseName,
        faculty: faculty,
        start_time: startTime,
        end_time: endTime,
        classroom: 'Classroom 1 (Front)'
      })
    });
    const data = await res.json();
    if(res.ok && data.success){
      if(msgEl){
        msgEl.textContent = '✓ ' + data.message;
        msgEl.className = 'reg-msg ok';
      }
      document.getElementById('tt-course-code').value = '';
      document.getElementById('tt-course-name').value = '';
      loadTimetable(selectedTimetableClass);
      triggerHud(`ADDED PERIOD: ${courseCode} (${className})`);
    } else {
      if(msgEl){
        msgEl.textContent = '✗ ' + (data.error || 'Failed to add timetable slot.');
        msgEl.className = 'reg-msg err';
      }
    }
  } catch(e){
    if(msgEl){
      msgEl.textContent = '✗ Network error.';
      msgEl.className = 'reg-msg err';
    }
  }
}

async function uploadTimetableCSV(){
  const fileInput = document.getElementById('tt-csv-file');
  const file = fileInput.files[0];
  const msgEl = document.getElementById('tt-modal-msg');

  if(!file){
    if(msgEl){
      msgEl.textContent = 'Please select a CSV file to upload.';
      msgEl.className = 'reg-msg err';
    }
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  if(msgEl){
    msgEl.textContent = 'Importing timetable CSV...';
    msgEl.className = 'reg-msg';
  }

  try {
    const res = await fetch('/api/timetable/upload', {method: 'POST', body: formData});
    const data = await res.json();
    if(res.ok && data.success){
      if(msgEl){
        msgEl.textContent = '✓ ' + data.message;
        msgEl.className = 'reg-msg ok';
      }
      fileInput.value = '';
      loadTimetable(selectedTimetableClass);
      triggerHud('TIMETABLE CSV IMPORTED');
    } else {
      if(msgEl){
        msgEl.textContent = '✗ ' + (data.error || 'Failed to import CSV.');
        msgEl.className = 'reg-msg err';
      }
    }
  } catch(e){
    if(msgEl){
      msgEl.textContent = '✗ Network error uploading CSV.';
      msgEl.className = 'reg-msg err';
    }
  }
}

async function deleteTimetableSlot(slotId){
  if(!confirm('Are you sure you want to delete this scheduled class period?')) return;
  try {
    const res = await fetch('/api/timetable/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: slotId})
    });
    const data = await res.json();
    if(res.ok && data.success){
      triggerHud('TIMETABLE PERIOD DELETED');
      loadTimetable(selectedTimetableClass);
    }
  } catch(e){}
}

function toggleRegisterModal(){
  const panel = document.getElementById('register-panel');
  const enrollPanel = document.getElementById('live-enroll-panel');
  if(enrollPanel) enrollPanel.style.display = 'none';
  if(panel.style.display === 'none' || !panel.style.display){
    panel.style.display = 'flex';
    document.getElementById('reg-name').focus();
  } else {
    panel.style.display = 'none';
  }
}

// ── Enrolled Students Directory & Delete Student Feature ───────────────────────
let enrolledStudentsList = [];

async function loadEnrolledStudents(){
  try {
    const res = await fetch('/api/students/list');
    enrolledStudentsList = await res.json();
    if(activeTab === 'students') renderStudentsList();
  } catch(e){}
}

function renderStudentsList(){
  const list = document.getElementById('log-list');
  if(!enrolledStudentsList.length){
    list.innerHTML = `
      <div class="empty-state">
        No students currently enrolled in the biometric registry.<br>
        Click <b>➕ REGISTER NEW STUDENT</b> or <b>⚡ LIVE 60-FRAME ENROLL</b> to add students.
      </div>`;
    return;
  }

  list.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:10px; font-family:var(--mono); color:var(--muted)">
      <span>ENROLLED PROFILES: ${enrolledStudentsList.length}</span>
      <span style="color:var(--accent)">InsightFace 512D Biometric Vectors</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px">` +
    enrolledStudentsList.map(s => {
      const c = getColor(s.name);
      return `
        <div class="student-mg-item">
          <div style="display:flex; align-items:center; gap:8px; flex:1">
            <div class="avatar" style="background:${c.bg};color:${c.color}">${initials(s.name)}</div>
            <div>
              <div style="font-size:12px; font-weight:600; display:flex; gap:6px; align-items:center">
                <span>${s.name}</span>
                <span class="log-tag">${s.class_name || 'CSE-A'}</span>
                <span class="log-tag" style="color:var(--accent);border-color:rgba(0,212,255,0.25)">${s.reg_no || '--'}</span>
              </div>
              <div style="font-size:10px; color:var(--muted); margin-top:2px; font-family:var(--mono)">
                Dataset: ${s.samples} sample images · Enrolled Profile
              </div>
            </div>
          </div>
          <button class="btn-del-student" onclick="deleteStudent('${s.name}')" title="Delete ${s.name} from biometric dataset and records">
            🗑 DELETE
          </button>
        </div>`;
    }).join('') + `</div>`;
}

async function deleteStudent(name){
  if(!confirm(`Are you sure you want to delete student "${name}"?\n\nThis will remove their facial training data, biometric encodings, and attendance profile from the system.`)){
    return;
  }

  try {
    const res = await fetch('/api/students/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ name: name })
    });
    const data = await res.json();
    if(res.ok && data.success){
      triggerHud(`DELETED STUDENT: ${name.toUpperCase()}`);
      loadEnrolledStudents();
      loadDailyRegister();
      pollAttendance();
      pollStats();
    } else {
      alert(data.error || 'Failed to delete student.');
    }
  } catch(e){
    alert('Network error while deleting student.');
  }
}

// ── 5-Classroom Campus Matrix Dashboard (Phase II Scalability) ───────────────
let campusMatrixData = null;

async function loadCampusMatrix(){
  try {
    const res = await fetch('/api/classrooms_matrix');
    campusMatrixData = await res.json();
    if(activeTab === 'matrix') renderCampusMatrix();
  } catch(e){}
}

function renderCampusMatrix(){
  const list = document.getElementById('log-list');
  if(!campusMatrixData || !campusMatrixData.classrooms){
    list.innerHTML = '<div class="empty-state">Loading campus-wide classroom matrix...</div>';
    return;
  }

  const { classrooms, total_campus_occupancy, total_campus_capacity } = campusMatrixData;
  const pctTotal = Math.round((total_campus_occupancy / Math.max(1, total_campus_capacity)) * 100);

  list.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:10px 14px; background:rgba(0,212,255,0.06); border:1px solid rgba(0,212,255,0.2); border-radius:8px;">
      <div>
        <div style="font-size:12px; font-weight:700; color:#00d4ff;">CAMPUS-WIDE LIVE OCCUPANCY</div>
        <div style="font-size:10px; color:var(--muted); margin-top:2px;">Simultaneous Multi-Room CCTV Monitoring (5 Classrooms)</div>
      </div>
      <div style="text-align:right">
        <span style="font-size:16px; font-weight:700; color:#00e676;">${total_campus_occupancy} / ${total_campus_capacity}</span>
        <span style="font-size:11px; color:var(--muted); margin-left:4px;">(${pctTotal}%)</span>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">` +
    classrooms.map(room => {
      const occPct = Math.round((room.occupancy / room.capacity) * 100);
      const isRoom1 = room.id === 'CR-101';
      const statusColor = isRoom1 ? '#00e676' : '#00d4ff';
      const borderCol = isRoom1 ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255,255,255,0.08)';

      return `
        <div style="background:rgba(15,23,42,0.75); border:1px solid ${borderCol}; border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-size:13px; font-weight:700; color:#fff;">${room.name}</div>
              <div style="font-size:10px; color:var(--accent); font-family:var(--mono);">${room.id} · ${room.camera}</div>
            </div>
            <span class="badge badge-in" style="background:rgba(0,230,118,0.15); color:${statusColor}; font-size:9px;">${room.status}</span>
          </div>

          <div style="font-size:11px; color:#cbd5e1; margin-top:4px;">
            <b>${room.course}</b>
          </div>
          <div style="font-size:10px; color:var(--muted);">
            Faculty: ${room.faculty} · ${room.period}
          </div>

          <!-- Occupancy bar -->
          <div style="margin-top:6px;">
            <div style="display:flex; justify-content:space-between; font-size:10px; font-family:var(--mono); margin-bottom:3px;">
              <span>Occupancy</span>
              <span><b>${room.occupancy}</b> / ${room.capacity} (${occPct}%)</span>
            </div>
            <div style="background:rgba(255,255,255,0.08); border-radius:4px; height:6px; overflow:hidden;">
              <div style="background:${occPct > 80 ? '#00e676' : '#00d4ff'}; width:${occPct}%; height:100%;"></div>
            </div>
          </div>
        </div>`;
    }).join('') + `</div>`;
}

// ── Live Telemetry Polling (FPS, Vector Latency) ──────────────────────────────
async function pollTelemetry(){
  try {
    const res = await fetch('/api/telemetry');
    const data = await res.json();
    const fpsEl = document.getElementById('telemetry-fps');
    const vecEl = document.getElementById('telemetry-vec');

    if(fpsEl && data.fps) fpsEl.textContent = `⚡ ${Math.round(data.fps)} FPS`;
    if(vecEl && data.vector_latency_ms !== undefined) vecEl.textContent = `🎯 FAISS: ${data.vector_latency_ms}ms`;
  } catch(e){}
  setTimeout(pollTelemetry, 2500);
}

function switchTab(tab){
  activeTab = tab;
  const tLog = document.getElementById('t-log');
  const tMatrix = document.getElementById('t-matrix');
  const tDaily = document.getElementById('t-daily');
  const tStudents = document.getElementById('t-students');
  const tEvents = document.getElementById('t-events');
  const tRoster = document.getElementById('t-roster');
  const tTimetable = document.getElementById('t-timetable');

  if(tLog) tLog.classList.toggle('active', tab === 'log');
  if(tMatrix) tMatrix.classList.toggle('active', tab === 'matrix');
  if(tDaily) tDaily.classList.toggle('active', tab === 'daily');
  if(tStudents) tStudents.classList.toggle('active', tab === 'students');
  if(tEvents) tEvents.classList.toggle('active', tab === 'events');
  if(tRoster) tRoster.classList.toggle('active', tab === 'roster');
  if(tTimetable) tTimetable.classList.toggle('active', tab === 'timetable');

  const titles = {
    log: 'REAL-TIME ATTENDANCE TRACKING LOG',
    matrix: 'CAMPUS-WIDE LIVE CLASSROOM MATRIX (5 ROOMS)',
    daily: 'DAILY ATTENDANCE REGISTER & PERIOD LOG',
    students: 'MANAGE ENROLLED STUDENTS & BIOMETRIC PROFILES',
    events: 'IDENTITY & ANOMALY EVENT BUS',
    roster: 'VERIFIED CLASSROOM ROSTER & DWELL %',
    timetable: 'INSTITUTIONAL TIMETABLE PRE-FILTER'
  };

  const panel = document.getElementById('panel-body');
  panel.innerHTML = `<div class="section-title">${titles[tab] || 'SYSTEM PANEL'}</div><div id="log-list"></div>`;

  if(tab === 'log') renderLog();
  else if(tab === 'matrix') { loadCampusMatrix(); }
  else if(tab === 'daily') { loadDailyRegister(); }
  else if(tab === 'students') { loadEnrolledStudents(); }
  else if(tab === 'events') renderEvents();
  else if(tab === 'roster') renderRoster();
  else if(tab === 'timetable') renderTimetable();
}

// Start polling
pollAttendance();
pollEvents();
pollStats();
pollTelemetry();
loadTimetable();
loadDailyRegister();
loadCampusMatrix();
refreshCameraDevices(true);

// Resilient auto-reconnect for live MJPEG stream
const liveVideoFeedImg = document.getElementById('video-feed');
if(liveVideoFeedImg){
  liveVideoFeedImg.onerror = () => {
    setTimeout(() => {
      if(!useClientWebcam && liveVideoFeedImg){
        liveVideoFeedImg.src = `/video_feed?t=${Date.now()}`;
      }
    }, 1200);
  };
}

// Hot-plug auto-detection for external USB webcams
if(navigator.mediaDevices && navigator.mediaDevices.addEventListener){
  navigator.mediaDevices.addEventListener('devicechange', () => {
    refreshCameraDevices(true);
  });
}

/* ==========================================================================
   VISIONATTEND AI - MODERN ENTERPRISE DASHBOARD CONTROLLER
   ========================================================================== */

let currentPage = 'dashboard';
let dashboardStatusFilter = 'ALL';
let historyRecords = [];
let directoryStudentsList = [];
let chartWeeklyInstance = null;
let chartDonutInstance = null;
let chartTrendInstance = null;

// ── Multi-Page Dashboard Navigation ──────────────────────────────────────────
function navigateTo(pageId){
  currentPage = pageId;

  // 1. Update Sidebar Active Button
  document.querySelectorAll('.app-sidebar .nav-item').forEach(el => {
    el.classList.remove('active');
  });
  const activeNav = document.getElementById(`nav-${pageId}`);
  if(activeNav) activeNav.classList.add('active');

  // 2. Update Page Section Active Class
  document.querySelectorAll('.page-viewport .dashboard-page').forEach(el => {
    el.classList.remove('active');
  });
  const targetPage = document.getElementById(`page-${pageId}`);
  if(targetPage) targetPage.classList.add('active');

  // 3. Update Breadcrumb Title & Path
  const titles = {
    dashboard: { title: 'Dashboard Overview', path: 'University Master · Academic Hierarchy' },
    live: { title: 'Live Attendance Monitoring', path: 'Real-Time Biometric Recognition & CCTV Feed' },
    'my-classes': { title: 'My Assigned Classes & Faculty Workflow', path: 'Today\'s Timetable, Live Verification & Session Control' },
    records: { title: 'Attendance Records & Logs', path: 'Database Query & Historical Attendance Sheets' },
    students: { title: 'Student Management Directory', path: 'Enrolled Facial Profiles & Biometric Vectors' },
    analytics: { title: 'Attendance Analytics & Insights', path: 'Weekly Trends, Compliance & Performance Metrics' },
    reports: { title: 'Academic Reports Generator', path: 'Official Faculty & Department Audit Reports' },
    timetable: { title: 'Timetable & Class Schedule', path: 'Active Periods & Lecture Timetable' },
    academic: { title: 'Academic Management & Structure', path: 'University Master · Departments, Programs, Batches & Timetable' },
    settings: { title: 'System & Recognition Settings', path: 'ArcFace AI Parameters & Faculty Preferences' }
  };
  const bTitle = document.getElementById('breadcrumb-title');
  const bPath = document.getElementById('breadcrumb-path');
  if(titles[pageId]){
    if(bTitle) bTitle.textContent = titles[pageId].title;
    if(bPath) bPath.textContent = titles[pageId].path;
  }

  // 4. Trigger Page Specific Data Fetching
  if(pageId === 'analytics') {
    loadAnalytics();
  } else if(pageId === 'records') {
    loadRecordsForDate();
  } else if(pageId === 'students') {
    loadStudentsDirectory();
  } else if(pageId === 'reports') {
    generateReportPreview();
  } else if(pageId === 'timetable') {
    loadTimetableSchedule();
  } else if(pageId === 'dashboard') {
    renderDashboardRoster();
  } else if(pageId === 'my-classes') {
    loadFacultyClasses();
  } else if(pageId === 'academic') {
    switchAcademicTab('departments');
  }

  // Re-create icons if Lucide is loaded
  if(window.lucide && typeof lucide.createIcons === 'function'){
    lucide.createIcons();
  }

  // Close mobile sidebar on navigation if opened
  const sidebar = document.getElementById('app-sidebar');
  if(sidebar) sidebar.classList.remove('mobile-open');
}

// ── Sidebar collapse & mobile menu toggles ───────────────────────────────────
function toggleSidebarCollapse(){
  const sidebar = document.getElementById('app-sidebar');
  const icon = document.getElementById('sidebar-collapse-icon');
  if(!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  if(icon){
    icon.setAttribute('data-lucide', isCollapsed ? 'chevron-right' : 'chevron-left');
    if(window.lucide) lucide.createIcons();
  }
}

function toggleMobileSidebar(){
  const sidebar = document.getElementById('app-sidebar');
  if(sidebar) sidebar.classList.toggle('mobile-open');
}

// ── Dark / Light Mode Theme Toggle ───────────────────────────────────────────
function toggleAppTheme(forced){
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme') || 'light';
  let newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  if(typeof forced === 'boolean'){
    newTheme = forced ? 'dark' : 'light';
  }
  html.setAttribute('data-theme', newTheme);
  try {
    localStorage.setItem('visionattend_theme', newTheme);
  } catch(e){}
  const themeIcon = document.getElementById('theme-toggle-icon');
  if(themeIcon){
    themeIcon.setAttribute('data-lucide', newTheme === 'dark' ? 'sun' : 'moon');
    if(window.lucide) lucide.createIcons();
  }
  const darkCheckbox = document.getElementById('set-dark-mode');
  if(darkCheckbox) darkCheckbox.checked = (newTheme === 'dark');

  // If analytics charts exist, update them with new theme colors
  if(currentPage === 'analytics') loadAnalytics();
}

// ── Toast Notifications System ───────────────────────────────────────────────
function showToast(title, message, type = 'info'){
  const container = document.getElementById('toast-container');
  if(!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  
  let iconName = 'info';
  if(type === 'success') iconName = 'check-circle';
  else if(type === 'warning') iconName = 'alert-triangle';
  else if(type === 'danger') iconName = 'x-circle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width:18px;height:18px;flex-shrink:0;"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  if(window.lucide && typeof lucide.createIcons === 'function'){
    lucide.createIcons();
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

// ── Dashboard Home: Today's Attendance Table & Spotlight Card ────────────────
function updateDashboardRosterAndSpotlight(){
  // 1. Update Spotlight Hero Cards on Dashboard & Live view
  if(logs && logs.length > 0){
    const latest = logs[logs.length - 1];
    const spotAvatar = document.getElementById('spotlight-avatar');
    const spotName = document.getElementById('spotlight-name');
    const spotMeta = document.getElementById('spotlight-meta');
    const spotConfVal = document.getElementById('spotlight-conf-val');
    const spotConfBar = document.getElementById('spotlight-conf-bar');
    const spotTime = document.getElementById('spotlight-time');
    const spotBadge = document.getElementById('spotlight-status-badge');

    const liveAvatar = document.getElementById('live-spotlight-avatar');
    const liveName = document.getElementById('live-spotlight-name');
    const liveMeta = document.getElementById('live-spotlight-meta');
    const liveConfVal = document.getElementById('live-spotlight-conf');
    const liveConfBar = document.getElementById('live-spotlight-bar');
    const liveTime = document.getElementById('live-spotlight-time');

    const c = getColor(latest.name);
    const inits = initials(latest.name);

    if(spotAvatar){
      spotAvatar.textContent = inits;
      spotAvatar.style.background = `linear-gradient(135deg, ${c.color}, #2563eb)`;
    }
    if(spotName) spotName.textContent = latest.name;
    if(spotMeta) spotMeta.textContent = `${latest.reg_no || '--'} · ${latest.class_name || 'CSE-A'}`;
    if(spotConfVal) spotConfVal.textContent = latest.confidence || '98.5%';
    if(spotConfBar){
      const confNum = parseFloat((latest.confidence || '95').replace('%', '')) || 95;
      spotConfBar.style.width = `${Math.min(100, Math.max(0, confNum))}%`;
    }
    if(spotTime) spotTime.textContent = latest.last_seen || 'Active';
    if(spotBadge){
      spotBadge.textContent = latest.status || 'PRESENT';
      spotBadge.className = `status-badge ${latest.status.toLowerCase().includes('absent') ? 'absent' : (latest.status.toLowerCase().includes('late') ? 'late' : 'present')}`;
    }

    if(liveAvatar){
      liveAvatar.textContent = inits;
      liveAvatar.style.background = `linear-gradient(135deg, ${c.color}, #2563eb)`;
    }
    if(liveName) liveName.textContent = latest.name;
    if(liveMeta) liveMeta.textContent = `${latest.reg_no || '--'} · ${latest.class_name || 'CSE-A'}`;
    if(liveConfVal) liveConfVal.textContent = latest.confidence || '98.5%';
    if(liveConfBar){
      const confNum = parseFloat((latest.confidence || '95').replace('%', '')) || 95;
      liveConfBar.style.width = `${Math.min(100, Math.max(0, confNum))}%`;
    }
    if(liveTime) liveTime.textContent = latest.last_seen || 'Active';
  }

  // 2. Render Today's Roster Table on Dashboard
  renderDashboardRoster();
}

function renderDashboardRoster(){
  const tbody = document.getElementById('dash-roster-tbody');
  if(!tbody) return;

  const searchInput = document.getElementById('dash-search-input');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

  // Combine active session logs + dailyRegisterList for comprehensive roster
  let combined = [];
  const seenNames = new Set();

  (logs || []).forEach(item => {
    combined.push(item);
    seenNames.add(item.name || item.student_name);
  });

  (dailyRegisterList || []).forEach(item => {
    const sName = item.student_name || item.name;
    if(!seenNames.has(sName)){
      combined.push({
        name: sName,
        reg_no: item.reg_no,
        class_name: item.class_name,
        period: item.period,
        first_in: item.first_in,
        last_seen: item.last_seen,
        duration: item.dwell,
        status: item.status,
        confidence: item.confidence,
        attendance_pct: item.attendance_pct
      });
      seenNames.add(sName);
    }
  });

  // Filter by query and status
  let filtered = combined.filter(st => {
    const sName = (st.name || st.student_name || '').toLowerCase();
    const sReg = (st.reg_no || '').toLowerCase();
    const sClass = (st.class_name || '').toLowerCase();
    const matchesQ = !q || sName.includes(q) || sReg.includes(q) || sClass.includes(q);

    let matchesStatus = true;
    const statusUpper = (st.status || '').toUpperCase();
    if(dashboardStatusFilter === 'PRESENT'){
      matchesStatus = statusUpper.includes('PRESENT') && !statusUpper.includes('LATE');
    } else if(dashboardStatusFilter === 'LATE'){
      matchesStatus = statusUpper.includes('LATE');
    } else if(dashboardStatusFilter === 'ABSENT'){
      matchesStatus = statusUpper.includes('ABSENT') || statusUpper.includes('DEFICIT');
    }

    return matchesQ && matchesStatus;
  });

  const countBadge = document.getElementById('roster-count-badge');
  if(countBadge) countBadge.textContent = `${filtered.length} Students`;

  if(!filtered.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state-card">
            <i data-lucide="users" class="empty-icon"></i>
            <div class="empty-heading">No attendance records found</div>
            <div class="empty-sub">Adjust your search query or status filter to see students.</div>
          </div>
        </td>
      </tr>`;
    if(window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
    return;
  }

  tbody.innerHTML = filtered.map(st => {
    const sName = st.name || st.student_name || 'Student';
    const c = getColor(sName);
    const inits = initials(sName);
    const statusUpper = (st.status || 'PRESENT').toUpperCase();
    let badgeClass = 'present';
    if(statusUpper.includes('ABSENT')) badgeClass = 'absent';
    else if(statusUpper.includes('LATE')) badgeClass = 'late';
    else if(statusUpper.includes('DEFICIT')) badgeClass = 'deficit';

    const confDisplay = st.confidence || '98.5%';
    const methodDisplay = confDisplay.includes('Manual') ? 'Manual Punch' : 'ArcFace Live';

    return `
      <tr>
        <td>
          <div class="student-col-cell">
            <div class="student-avatar-round" style="background:${c.color};">${inits}</div>
            <div class="student-details">
              <span class="student-name-text">${sName}</span>
              <span class="student-reg-text">${st.period || 'Period 1'}</span>
            </div>
          </div>
        </td>
        <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted);">${st.reg_no || '--'}</td>
        <td><span class="nav-badge" style="background:var(--bg-subtle); color:var(--text-main);">${st.class_name || 'CSE-A'}</span></td>
        <td style="font-family:var(--font-mono); font-size:12px;">${st.first_in || st.last_seen || '--:--'}</td>
        <td><span class="status-badge ${badgeClass}">${st.status || 'PRESENT'}</span></td>
        <td><span class="confidence-chip">${confDisplay}</span></td>
        <td><span style="font-size:11.5px; color:var(--text-muted);">${methodDisplay}</span></td>
        <td style="text-align:right;">
          <div class="action-btn-group" style="justify-content:flex-end;">
            <button class="mini-btn" onclick="setManualAttendance('${sName}', 'PRESENT', '${st.period || 'Period 1'}')" title="Mark Present">✓</button>
            <button class="mini-btn" onclick="setManualAttendance('${sName}', 'LATE', '${st.period || 'Period 1'}')" title="Mark Late">⏱</button>
            <button class="mini-btn danger" onclick="setManualAttendance('${sName}', 'ABSENT (>15m Out)', '${st.period || 'Period 1'}')" title="Mark Absent">✕</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if(window.lucide && typeof lucide.createIcons === 'function'){
    lucide.createIcons();
  }
}

function filterTodayRoster(){
  renderDashboardRoster();
}

function setDashboardStatusFilter(status, btn){
  dashboardStatusFilter = status;
  if(btn && btn.parentElement){
    btn.parentElement.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
  }
  renderDashboardRoster();
}

function updateDashboardKPIs(data){
  if(!data) return;
  const total = parseInt(data.total_enrolled || '0', 10);
  const present = parseInt(data.present || '0', 10);
  const late = parseInt(data.late || '0', 10);
  const pct = total > 0 ? Math.round((present / total) * 100) : (present > 0 ? 100 : 0);

  const kpiPct = document.getElementById('kpi-today-pct');
  const kpiProg = document.getElementById('kpi-today-progress');
  const kpiRatio = document.getElementById('kpi-present-ratio');
  const recBtnText = document.getElementById('dash-rec-btn-text');
  const liveRecLabel = document.getElementById('live-rec-btn-label');

  if(kpiPct) kpiPct.textContent = `${pct}%`;
  if(kpiProg) kpiProg.style.width = `${pct}%`;
  if(kpiRatio) kpiRatio.textContent = `${present} / ${total} present`;

  if(data.recording_active !== undefined){
    const labelText = data.recording_active ? 'Pause Attendance Tracking' : 'Start Attendance Tracking';
    if(recBtnText) recBtnText.textContent = labelText;
    if(liveRecLabel) liveRecLabel.textContent = labelText;
  }
}

function updateDashboardActivityStream(){
  const container = document.getElementById('dash-activity-stream');
  if(!container || !events || !events.length) return;

  container.innerHTML = events.slice(0, 8).map(ev => {
    return `
      <div class="activity-event-item">
        <div class="event-dot-indicator"></div>
        <div class="event-details">
          <div style="font-weight:600; color:var(--text-main); font-size:12px;">${ev.student_name}</div>
          <div style="font-size:11px; color:var(--text-muted);">${ev.details}</div>
          <div class="event-time">${ev.timestamp} · ${ev.camera_id}</div>
        </div>
      </div>
    `;
  }).join('');
}

function exportTodayCSV(){
  window.location.href = '/export';
  showToast('Export Initiated', "Downloading today's attendance CSV...", 'info');
}

// ── Attendance Records History Page ──────────────────────────────────────────
async function loadRecordsForDate(dateStr){
  const picker = document.getElementById('records-date-picker');
  const targetDate = dateStr || (picker ? picker.value : '') || new Date().toISOString().split('T')[0];
  if(picker && !picker.value) picker.value = targetDate;

  try {
    const res = await fetch(`/api/attendance/daily?date=${encodeURIComponent(targetDate)}`);
    historyRecords = await res.json();
    filterRecordsTable();
  } catch(e){
    historyRecords = [];
    filterRecordsTable();
  }
}

function filterRecordsTable(){
  const tbody = document.getElementById('records-table-tbody');
  if(!tbody) return;

  const searchInput = document.getElementById('records-search-input');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const statusSel = document.getElementById('records-status-select');
  const statusFilter = statusSel ? statusSel.value : 'ALL';

  const classSel = document.getElementById('records-class-select');
  const classFilter = classSel ? classSel.value : 'ALL';

  let filtered = (historyRecords || []).filter(item => {
    const sName = (item.student_name || '').toLowerCase();
    const sReg = (item.reg_no || '').toLowerCase();
    const matchesQ = !q || sName.includes(q) || sReg.includes(q);

    let matchesStatus = true;
    const itemStatus = (item.status || '').toUpperCase();
    if(statusFilter === 'PRESENT') matchesStatus = itemStatus.includes('PRESENT') && !itemStatus.includes('LATE');
    else if(statusFilter === 'LATE') matchesStatus = itemStatus.includes('LATE');
    else if(statusFilter === 'ABSENT') matchesStatus = itemStatus.includes('ABSENT');
    else if(statusFilter === 'DEFICIT') matchesStatus = itemStatus.includes('DEFICIT');

    let matchesClass = true;
    if(classFilter !== 'ALL') matchesClass = (item.class_name || '').toUpperCase().includes(classFilter.toUpperCase());

    return matchesQ && matchesStatus && matchesClass;
  });

  const countBadge = document.getElementById('records-count-badge');
  if(countBadge) countBadge.textContent = `${filtered.length} Records`;

  if(!filtered.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="empty-state-card">
            <i data-lucide="calendar" class="empty-icon"></i>
            <div class="empty-heading">No records found for this date</div>
            <div class="empty-sub">Select another date or adjust status filters.</div>
          </div>
        </td>
      </tr>`;
    if(window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
    return;
  }

  const picker = document.getElementById('records-date-picker');
  const curDate = picker ? picker.value : new Date().toISOString().split('T')[0];

  tbody.innerHTML = filtered.map(item => {
    const sName = item.student_name || 'Student';
    const c = getColor(sName);
    const inits = initials(sName);
    const statusUpper = (item.status || 'PRESENT').toUpperCase();
    let badgeClass = 'present';
    if(statusUpper.includes('ABSENT')) badgeClass = 'absent';
    else if(statusUpper.includes('LATE')) badgeClass = 'late';
    else if(statusUpper.includes('DEFICIT')) badgeClass = 'deficit';

    return `
      <tr>
        <td style="font-family:var(--font-mono); font-size:11.5px; color:var(--text-muted);">${curDate}</td>
        <td>
          <div class="student-col-cell">
            <div class="student-avatar-round" style="background:${c.color};">${inits}</div>
            <span class="student-name-text">${sName}</span>
          </div>
        </td>
        <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted);">${item.reg_no || '--'}</td>
        <td><span class="nav-badge" style="background:var(--bg-subtle); color:var(--text-main);">${item.class_name || 'CSE-A'}</span></td>
        <td style="font-size:12px;">${item.period || 'Period 1'}</td>
        <td style="font-family:var(--font-mono); font-size:12px;">${item.first_in || '--:--'}</td>
        <td style="font-family:var(--font-mono); font-size:12px;">${item.last_seen || '--:--'}</td>
        <td style="font-family:var(--font-mono); font-size:12px;">${item.dwell || '--'}</td>
        <td style="font-weight:600;">${item.attendance_pct || '100%'}</td>
        <td><span class="status-badge ${badgeClass}">${item.status || 'PRESENT'}</span></td>
        <td><span class="confidence-chip">${item.confidence || '98.5%'}</span></td>
        <td style="text-align:right;">
          <button class="mini-btn" onclick="setManualAttendance('${sName}', 'PRESENT', '${item.period || 'Period 1'}')" title="Mark Present">✓</button>
          <button class="mini-btn danger" onclick="setManualAttendance('${sName}', 'ABSENT (>15m Out)', '${item.period || 'Period 1'}')" title="Mark Absent">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  if(window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function setRecordsDateToday(){
  const picker = document.getElementById('records-date-picker');
  if(picker){
    picker.value = new Date().toISOString().split('T')[0];
    loadRecordsForDate(picker.value);
  }
}

function exportRecordsCSV(){
  const picker = document.getElementById('records-date-picker');
  const d = (picker && picker.value) ? picker.value : new Date().toISOString().split('T')[0];
  window.location.href = `/export?date=${encodeURIComponent(d)}`;
  showToast('Export Initiated', `Downloading attendance CSV for ${d}...`, 'info');
}

// ── Student Biometric Management Directory ───────────────────────────────────
async function loadStudentsDirectory(){
  try {
    const res = await fetch('/api/students/list');
    directoryStudentsList = await res.json();
    filterStudentsGrid();
  } catch(e){
    directoryStudentsList = [];
    filterStudentsGrid();
  }
}

function filterStudentsGrid(){
  const searchInput = document.getElementById('students-search-input');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const classSel = document.getElementById('students-class-filter');
  const classFilter = classSel ? classSel.value : 'ALL';

  let filtered = (directoryStudentsList || []).filter(st => {
    const sName = (st.name || '').toLowerCase();
    const sReg = (st.reg_no || '').toLowerCase();
    const matchesQ = !q || sName.includes(q) || sReg.includes(q);

    let matchesClass = true;
    if(classFilter !== 'ALL') matchesClass = (st.class_name || '').toUpperCase().includes(classFilter.toUpperCase());

    return matchesQ && matchesClass;
  });

  const countBadge = document.getElementById('students-count-badge');
  if(countBadge) countBadge.textContent = `${filtered.length} Registered`;

  const grid = document.getElementById('students-cards-grid');
  const tbody = document.getElementById('students-table-tbody');

  if(!filtered.length){
    if(grid) grid.innerHTML = `<div class="empty-state-card" style="grid-column: 1 / -1;"><i data-lucide="users" class="empty-icon"></i><div class="empty-heading">No students found</div><div class="empty-sub">Click "Add Student" above to enroll students into the biometric database.</div></div>`;
    if(tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state-card"><div class="empty-heading">No students registered</div></div></td></tr>`;
    if(window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
    return;
  }

  // 1. Render Cards View
  if(grid){
    grid.innerHTML = filtered.map(st => {
      const c = getColor(st.name);
      const inits = initials(st.name);
      return `
        <div class="student-card-item">
          <div class="student-card-top">
            <div class="student-card-avatar" style="background:${c.color};">${inits}</div>
            <div class="student-card-names">
              <div class="student-card-name">${st.name}</div>
              <div class="student-card-reg">${st.reg_no || '--'}</div>
            </div>
          </div>
          <div class="student-card-metrics">
            <div class="metric-mini-col">
              <span class="metric-mini-label">Class</span>
              <span class="metric-mini-val">${st.class_name || 'CSE-A'}</span>
            </div>
            <div class="metric-mini-col">
              <span class="metric-mini-label">Vectors</span>
              <span class="metric-mini-val">${st.samples || 120}</span>
            </div>
            <div class="metric-mini-col">
              <span class="metric-mini-label">Status</span>
              <span class="status-badge present" style="padding:2px 6px; font-size:10px;">ACTIVE</span>
            </div>
          </div>
          <div class="student-card-actions">
            <button class="btn btn-secondary" style="flex:1; font-size:11px; padding:5px 8px;" onclick="viewStudentHistory('${st.name}')">
              <i data-lucide="eye" style="width:13px;height:13px;"></i>
              <span>History</span>
            </button>
            <button class="btn btn-danger" style="font-size:11px; padding:5px 8px;" onclick="promptDeleteStudent('${st.name}')" title="Delete Profile">
              <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Render Table View
  if(tbody){
    tbody.innerHTML = filtered.map(st => {
      const c = getColor(st.name);
      const inits = initials(st.name);
      return `
        <tr>
          <td>
            <div class="student-col-cell">
              <div class="student-avatar-round" style="background:${c.color};">${inits}</div>
              <span class="student-name-text">${st.name}</span>
            </div>
          </td>
          <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted);">${st.reg_no || '--'}</td>
          <td><span class="nav-badge" style="background:var(--bg-subtle); color:var(--text-main);">${st.class_name || 'CSE-A'}</span></td>
          <td><span class="confidence-chip">${st.samples || 120} Face Vectors</span></td>
          <td><span class="status-badge present">ACTIVE</span></td>
          <td style="text-align:right;">
            <div class="action-btn-group" style="justify-content:flex-end;">
              <button class="mini-btn" onclick="viewStudentHistory('${st.name}')">History</button>
              <button class="mini-btn danger" onclick="promptDeleteStudent('${st.name}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  if(window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function setStudentsViewMode(mode){
  const grid = document.getElementById('students-cards-grid');
  const tableWrap = document.getElementById('students-table-wrap');
  const btnCards = document.getElementById('btn-view-cards');
  const btnTable = document.getElementById('btn-view-table');

  if(mode === 'cards'){
    if(grid) grid.style.display = 'grid';
    if(tableWrap) tableWrap.style.display = 'none';
    if(btnCards) btnCards.classList.add('active');
    if(btnTable) btnTable.classList.remove('active');
  } else {
    if(grid) grid.style.display = 'none';
    if(tableWrap) tableWrap.style.display = 'block';
    if(btnCards) btnCards.classList.remove('active');
    if(btnTable) btnTable.classList.add('active');
  }
}

function viewStudentHistory(name){
  navigateTo('records');
  const input = document.getElementById('records-search-input');
  if(input){
    input.value = name;
    filterRecordsTable();
  }
}

function promptDeleteStudent(name){
  openDeleteStudentModal();
  setTimeout(() => {
    const select = document.getElementById('delete-student-select');
    if(select) select.value = name;
  }, 200);
}

async function rebuildEmbeddings(){
  showToast('Rebuilding Cache', 'Rebuilding ArcFace vector embeddings from known_faces...', 'info');
  try {
    const res = await fetch('/rebuild', { method: 'POST' });
    const data = await res.json();
    showToast('Rebuild Complete', data.message || 'Face embeddings rebuilt successfully', 'success');
    loadStudentsDirectory();
  } catch(e){
    showToast('Rebuild Failed', 'Could not rebuild embeddings: ' + e.message, 'danger');
  }
}

// ── Attendance Analytics & Charts ────────────────────────────────────────────
async function loadAnalytics(){
  try {
    const res = await fetch('/api/analytics');
    const data = await res.json();
    if(data.error) return;

    // 1. Metric Tiles
    const avgAtt = document.getElementById('analytics-avg-att');
    const punct = document.getElementById('analytics-punctuality');
    const totalLogs = document.getElementById('analytics-total-logs');
    const defCount = document.getElementById('analytics-deficit-count');

    if(avgAtt && data.summary) avgAtt.textContent = `${data.summary.overall_attendance_rate}%`;
    if(punct && data.summary) punct.textContent = `${data.summary.punctuality_rate}%`;
    if(totalLogs && data.summary) totalLogs.textContent = `${data.summary.total_records}`;
    if(defCount && data.status_distribution) defCount.textContent = `${data.status_distribution.absent || 0}`;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    // 2. Chart 1: Weekly Attendance (Bar chart)
    const ctxWeekly = document.getElementById('chart-weekly-attendance');
    if(ctxWeekly && typeof Chart !== 'undefined'){
      const weeklyLabels = (data.weekly || []).map(w => w.date.slice(5));
      const weeklyRates = (data.weekly || []).map(w => w.rate);

      if(chartWeeklyInstance) chartWeeklyInstance.destroy();
      chartWeeklyInstance = new Chart(ctxWeekly, {
        type: 'bar',
        data: {
          labels: weeklyLabels.length ? weeklyLabels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
          datasets: [{
            label: 'Attendance %',
            data: weeklyRates.length ? weeklyRates : [92, 88, 95, 90, 85, 94, 91],
            backgroundColor: '#2563eb',
            borderRadius: 6,
            barThickness: 24
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` Attendance: ${ctx.parsed.y}%`
              }
            }
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: { color: textColor, callback: v => `${v}%` },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: textColor },
              grid: { display: false }
            }
          }
        }
      });
    }

    // 3. Chart 2: Present vs Absent vs Late (Donut chart)
    const ctxDonut = document.getElementById('chart-status-donut');
    if(ctxDonut && typeof Chart !== 'undefined'){
      const dist = data.status_distribution || { present: 42, late: 4, absent: 2 };
      if(chartDonutInstance) chartDonutInstance.destroy();
      chartDonutInstance = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
          labels: ['Present (On-Time)', 'Late Arrival', 'Absent / Deficit'],
          datasets: [{
            data: [dist.present || 42, dist.late || 4, dist.absent || 2],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                color: textColor
              }
            }
          },
          cutout: '70%'
        }
      });
    }

    // 4. Chart 3: Attendance Rate Trend (Line chart)
    const ctxTrend = document.getElementById('chart-trend-line');
    if(ctxTrend && typeof Chart !== 'undefined'){
      const weeklyLabels = (data.weekly || []).map(w => w.date.slice(5));
      const weeklyRates = (data.weekly || []).map(w => w.rate);

      if(chartTrendInstance) chartTrendInstance.destroy();
      chartTrendInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
          labels: weeklyLabels.length ? weeklyLabels : ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
          datasets: [{
            label: 'Attendance Rate',
            data: weeklyRates.length ? weeklyRates : [88, 91, 89, 94, 92, 96, 95],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              min: 50,
              max: 100,
              ticks: { color: textColor, callback: v => `${v}%` },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: textColor },
              grid: { display: false }
            }
          }
        }
      });
    }

    // 5. Top Students Leaderboard Table
    const topTbody = document.getElementById('analytics-top-students-tbody');
    if(topTbody){
      const topList = data.top_students || [];
      if(!topList.length){
        topTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No student attendance history recorded yet.</td></tr>';
      } else {
        topTbody.innerHTML = topList.map((st, i) => {
          const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i+1}`));
          return `
            <tr>
              <td style="font-weight:700;">${medal}</td>
              <td style="font-weight:600;">${st.name}</td>
              <td style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">${st.reg_no}</td>
              <td>${st.attended || st.classes} classes</td>
              <td style="text-align:right; font-weight:700; color:var(--success);">${st.rate}%</td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch(e){}
}

// ── Academic Reports Generator ───────────────────────────────────────────────
async function generateReportPreview(){
  const typeSel = document.getElementById('report-type-select');
  const datePick = document.getElementById('report-date-picker');
  const classSel = document.getElementById('report-class-select');

  const reportType = typeSel ? typeSel.value : 'daily';
  const targetDate = (datePick && datePick.value) ? datePick.value : new Date().toISOString().split('T')[0];
  if(datePick && !datePick.value) datePick.value = targetDate;
  const classFilter = classSel ? classSel.value : 'ALL';

  const sheetTitle = document.getElementById('rep-sheet-title');
  const sheetDate = document.getElementById('rep-sheet-date');
  if(sheetTitle){
    const titles = {
      daily: 'DAILY ATTENDANCE REGISTER',
      weekly: 'WEEKLY DEPARTMENT SUMMARY REPORT',
      monthly: 'MONTHLY COMPLIANCE AUDIT SHEET',
      student: 'STUDENT BIOMETRIC VERIFICATION ROSTER'
    };
    sheetTitle.textContent = titles[reportType] || 'ATTENDANCE REPORT';
  }
  if(sheetDate) sheetDate.textContent = targetDate;

  try {
    const res = await fetch(`/api/attendance/daily?date=${encodeURIComponent(targetDate)}`);
    const records = await res.json();

    let filtered = records;
    if(classFilter !== 'ALL'){
      filtered = records.filter(r => (r.class_name || '').toUpperCase().includes(classFilter.toUpperCase()));
    }

    const presentCount = filtered.filter(r => (r.status || '').toUpperCase().includes('PRESENT') || (r.status || '').toUpperCase().includes('LATE')).length;
    const absentCount = filtered.length - presentCount;
    const pct = filtered.length > 0 ? Math.round((presentCount / filtered.length) * 100) : 0;

    const repTotal = document.getElementById('rep-sheet-total');
    const repPresent = document.getElementById('rep-sheet-present');
    const repAbsent = document.getElementById('rep-sheet-absent');
    const repPct = document.getElementById('rep-sheet-pct');

    if(repTotal) repTotal.textContent = filtered.length;
    if(repPresent) repPresent.textContent = presentCount;
    if(repAbsent) repAbsent.textContent = absentCount;
    if(repPct) repPct.textContent = `${pct}%`;

    const tbody = document.getElementById('rep-sheet-tbody');
    if(tbody){
      if(!filtered.length){
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--text-muted)">No attendance records found for selected criteria.</td></tr>';
      } else {
        tbody.innerHTML = filtered.map(r => `
          <tr>
            <td style="font-weight:600;">${r.student_name}</td>
            <td style="font-family:var(--font-mono); font-size:11.5px;">${r.reg_no || '--'}</td>
            <td>${r.class_name || 'CSE-A'}</td>
            <td>${r.period || 'Period 1'}</td>
            <td style="font-family:var(--font-mono); font-size:11.5px;">${r.first_in || '--:--'}</td>
            <td style="font-family:var(--font-mono); font-size:11.5px;">${r.last_seen || '--:--'}</td>
            <td><span class="status-badge ${r.status.toLowerCase().includes('absent') ? 'absent' : (r.status.toLowerCase().includes('late') ? 'late' : 'present')}">${r.status}</span></td>
            <td style="font-family:var(--font-mono); font-size:11px;">${r.confidence || '98.5%'}</td>
          </tr>
        `).join('');
      }
    }
  } catch(e){}
}

function printOfficialReport(){
  window.print();
}

// ── Timetable Schedule Page ──────────────────────────────────────────────────
let currentTimetableDayFilter = 'ALL';
let currentTimetableSectionFilter = 'ALL';

function filterTimetableByDay(day) {
  currentTimetableDayFilter = day;
  document.querySelectorAll('.filter-pill[id^="tt-day-"]').forEach(btn => {
    btn.classList.toggle('active', btn.id === `tt-day-${day}`);
  });
  loadTimetableSchedule();
}

function filterTimetableBySection(sec) {
  currentTimetableSectionFilter = sec;
  loadTimetableSchedule();
}

function handleTimetableDrop(event) {
  event.preventDefault();
  const dt = event.dataTransfer;
  const files = dt ? dt.files : null;
  if (files && files.length > 0) {
    const input = getElem('tt-master-file-input', 'timetable-file-input');
    if (input) input.files = files;
    onTimetableFileSelected({ target: { files: files } });
  }
}

function toggleTimetableModal() {
  openTimetableUploadModal();
}

function closeAcademicAddModal() {
  closeAcademicEntityModal();
}

function refreshAcademicTab() {
  loadAcademicData(window.activeAcademicTab || 'departments');
}

function filterAcademicTable(query) {
  const q = (query || '').toLowerCase().trim();
  const tbody = getElem('academic-table-tbody', 'academic-master-table');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

function exportAcademicTableCSV() {
  const table = getElem('academic-master-table');
  if (!table) return;
  let csv = [];
  const rows = table.querySelectorAll('tr');
  for (let i = 0; i < rows.length; i++) {
    let row = [], cols = rows[i].querySelectorAll('td, th');
    for (let j = 0; j < cols.length - 1; j++) {
      row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
    }
    csv.push(row.join(','));
  }
  const csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
  const downloadLink = document.createElement('a');
  downloadLink.download = `academic_${window.activeAcademicTab || 'records'}.csv`;
  downloadLink.href = window.URL.createObjectURL(csvFile);
  downloadLink.style.display = 'none';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

async function loadTimetableSchedule(){
  try {
    const res = await fetch('/api/timetable');
    const data = await res.json();
    let list = data.timetable || [];

    // Filter by selected day if set
    if (currentTimetableDayFilter && currentTimetableDayFilter !== 'ALL') {
      list = list.filter(item => (item.day || '').toLowerCase() === currentTimetableDayFilter.toLowerCase());
    }

    // Filter by selected section if set
    if (currentTimetableSectionFilter && currentTimetableSectionFilter !== 'ALL') {
      list = list.filter(item => {
        const cls = (item.class_name || item.section_name || '').toUpperCase();
        return cls.includes(currentTimetableSectionFilter.toUpperCase());
      });
    }

    const badge = document.getElementById('tt-count-badge');
    if(badge) badge.textContent = `${list.length} Slots`;

    const tbody = document.getElementById('timetable-table-tbody');
    if(tbody){
      if(!list.length){
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--text-muted)">No timetable schedule found for selected filters. Upload Excel/CSV or adjust filters.</td></tr>';
      } else {
        tbody.innerHTML = list.map(item => `
          <tr>
            <td><strong style="color:var(--primary); font-size:12px;">${item.day || 'Monday'}</strong></td>
            <td style="font-family:var(--font-mono); font-size:12px;">${item.start_time} - ${item.end_time}</td>
            <td style="font-size:12px;">${item.department_code || item.department || 'CSE'} (${item.program_code || 'B.Tech'})</td>
            <td><span class="nav-badge" style="background:var(--bg-subtle); color:var(--text-main); font-weight:700;">${item.class_name || 'CSE-3-A'}</span></td>
            <td style="font-family:var(--font-mono); font-weight:600; color:var(--primary);">${item.course_code || item.subject_code || '--'}</td>
            <td style="font-weight:600;">${item.course_name || item.subject_name || 'Lecture'}</td>
            <td>${item.faculty || item.faculty_name || 'Faculty'}</td>
            <td style="font-size:12px; color:var(--text-muted);">${item.classroom_id || item.room || 'Room 302'}</td>
            <td style="text-align:right;">
              <button class="mini-btn danger" onclick="deleteTimetableSlot('${item.id}')">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch(e){}
}

async function deleteTimetableSlot(id){
  if(!confirm('Are you sure you want to delete this class period slot?')) return;
  try {
    const res = await fetch('/api/timetable/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });
    const data = await res.json();
    showToast('Slot Deleted', data.message || 'Class slot deleted', 'success');
    loadTimetableSchedule();
  } catch(e){
    showToast('Delete Failed', e.message, 'danger');
  }
}

// ── Settings Page Tabs & Save ────────────────────────────────────────────────
function switchSettingsTab(tabName, btn){
  document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');

  document.querySelectorAll('.settings-tab-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(`set-panel-${tabName}`);
  if(panel) panel.style.display = 'block';
}

function saveDashboardSettings(){
  const name = document.getElementById('set-faculty-name')?.value || 'Dr. A. Sharma';
  const desig = document.getElementById('set-faculty-desig')?.value || 'Professor & Head';
  const dept = document.getElementById('set-faculty-dept')?.value || 'Computer Science & Engineering';
  const inst = document.getElementById('set-faculty-inst')?.value || 'SRM Institute of Science and Technology';
  const thresh = document.getElementById('set-threshold-slider')?.value || '0.42';

  try {
    localStorage.setItem('visionattend_faculty', JSON.stringify({ name, desig, dept, inst, thresh }));
  } catch(e){}

  document.querySelectorAll('.faculty-name').forEach(el => el.textContent = name);
  document.querySelectorAll('.faculty-role').forEach(el => el.textContent = `${desig} · ${dept}`);

  showToast('Settings Saved', 'Faculty preferences and ArcFace parameters saved successfully.', 'success');
}

function toggleNotificationDrawer(){
  showToast('Notifications', 'All system services operating nominally. Camera 0 active, ArcFace AI Online.', 'info');
}

// ============================================================================
// VISIONATTEND AI - ACADEMIC HIERARCHY, TIMETABLE & FACULTY WORKFLOW SYSTEM
// ============================================================================

window.activeAttendanceSessionId = null;
window.activeSessionData = null;
window.currentActiveRole = 'ADMIN';
window.currentActiveFacultyId = 'FAC001';
window.validatedTimetableEntries = [];
window.currentReviewSessionData = null;
window.activeAcademicTab = 'departments';

function getElem(id1, id2) {
  return document.getElementById(id1) || (id2 ? document.getElementById(id2) : null);
}

// ── 1. Academic Hierarchy Global Filters ──────────────────────────────────────
async function initAcademicFilterOptions() {
  try {
    const res = await fetch('/api/academic/filters');
    const data = await res.json();
    if (!data) return;

    // Populate Department select
    const deptSel = getElem('filter-dept', 'academic-filter-dept');
    if (deptSel && data.departments) {
      deptSel.innerHTML = '<option value="">All Departments</option>' +
        data.departments.map(d => `<option value="${d.id}">${d.code} · ${d.name}</option>`).join('');
    }

    // Populate Program select
    const progSel = getElem('filter-prog', 'academic-filter-program');
    if (progSel && data.programs) {
      progSel.innerHTML = '<option value="">All Programs</option>' +
        data.programs.map(p => `<option value="${p.id}" data-dept="${p.dept_id}">${p.code} · ${p.name}</option>`).join('');
    }

    // Populate Section select
    const secSel = getElem('filter-sec', 'academic-filter-section');
    if (secSel && data.sections) {
      secSel.innerHTML = '<option value="">All Sections</option>' +
        data.sections.map(s => `<option value="${s.id}" data-prog="${s.program_id}" data-year="${s.year}">${s.name} (${s.program_code} Y${s.year})</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to initialize academic filter options:', err);
  }
}

async function onAcademicFilterChange(level) {
  const deptId = getElem('filter-dept', 'academic-filter-dept')?.value || '';
  const progId = getElem('filter-prog', 'academic-filter-program')?.value || '';
  const year = getElem('filter-year', 'academic-filter-year')?.value || '';
  const sem = getElem('filter-sem', 'academic-filter-sem')?.value || '';
  const secId = getElem('filter-sec', 'academic-filter-section')?.value || '';

  // Trigger cascade options if needed
  try {
    const res = await fetch(`/api/academic/filters?dept_id=${encodeURIComponent(deptId)}&program_id=${encodeURIComponent(progId)}&year=${encodeURIComponent(year)}`);
    const data = await res.json();

    if (level === 'dept') {
      const progSel = getElem('filter-prog', 'academic-filter-program');
      if (progSel && data.programs) {
        const curVal = progSel.value;
        progSel.innerHTML = '<option value="">All Programs</option>' +
          data.programs.map(p => `<option value="${p.id}">${p.code} · ${p.name}</option>`).join('');
        if (data.programs.some(p => p.id === curVal)) progSel.value = curVal;
      }
    }

    if (level === 'dept' || level === 'prog' || level === 'year') {
      const secSel = getElem('filter-sec', 'academic-filter-section');
      if (secSel && data.sections) {
        const curVal = secSel.value;
        secSel.innerHTML = '<option value="">All Sections</option>' +
          data.sections.map(s => `<option value="${s.id}">${s.name} (${s.program_code} Y${s.year})</option>`).join('');
        if (data.sections.some(s => s.id === curVal)) secSel.value = curVal;
      }
    }
  } catch (e) {}

  await loadFilteredDashboard();
}

function resetAcademicFilters() {
  const dept = getElem('filter-dept', 'academic-filter-dept');
  const prog = getElem('filter-prog', 'academic-filter-program');
  const yr = getElem('filter-year', 'academic-filter-year');
  const sem = getElem('filter-sem', 'academic-filter-sem');
  const sec = getElem('filter-sec', 'academic-filter-section');
  if (dept) dept.value = '';
  if (prog) prog.value = '';
  if (yr) yr.value = '';
  if (sem) sem.value = '';
  if (sec) sec.value = '';
  initAcademicFilterOptions().then(() => loadFilteredDashboard());
}

async function loadFilteredDashboard() {
  const deptId = getElem('filter-dept', 'academic-filter-dept')?.value || '';
  const progId = getElem('filter-prog', 'academic-filter-program')?.value || '';
  const year = getElem('filter-year', 'academic-filter-year')?.value || '';
  const sem = getElem('filter-sem', 'academic-filter-sem')?.value || '';
  const secId = getElem('filter-sec', 'academic-filter-section')?.value || '';

  const params = new URLSearchParams();
  if (deptId) params.append('dept_id', deptId);
  if (progId) params.append('program_id', progId);
  if (year) params.append('year', year);
  if (sem) params.append('semester', sem);
  if (secId) params.append('section_id', secId);

  try {
    const res = await fetch(`/api/academic/dashboard?${params.toString()}`);
    const data = await res.json();
    if (!data) return;

    // Update KPI counters
    const kpiStudents = getElem('kpi-total-students', 'stat-enrolled');
    const kpiPresent = getElem('kpi-present-count', 'stat-present');
    const kpiPct = getElem('kpi-attendance-pct', 'kpi-today-pct');
    const kpiClasses = getElem('kpi-active-classes', 'side-stat-classes');

    if (kpiStudents && data.total_students !== undefined) kpiStudents.textContent = data.total_students;
    if (kpiPresent && data.present_today !== undefined) kpiPresent.textContent = data.present_today;
    if (kpiPct && data.avg_attendance_pct !== undefined) kpiPct.textContent = `${data.avg_attendance_pct}%`;
    if (kpiClasses && data.active_classes !== undefined) kpiClasses.textContent = data.active_classes;

    // Update filter path text badge
    const pathBadge = getElem('active-filter-path', 'breadcrumb-path');
    if (pathBadge && data.filter_label) {
      pathBadge.textContent = data.filter_label;
    }

    // Refresh roster with filtered students
    if (data.students && data.students.length > 0) {
      window.enrolledStudentsCache = data.students;
      renderDashboardRoster();
    }
  } catch (err) {
    console.error('Error fetching filtered academic dashboard:', err);
  }
}

// ── 2. Role-Based Access Control (RBAC) Switcher ─────────────────────────────
function onUserRoleChange(newRole) {
  window.currentActiveRole = newRole;

  // Map roles to simulated faculty IDs
  const facultyMap = {
    'FACULTY_ARUN': { id: 'FAC001', name: 'Dr. Arun Kumar', title: 'Associate Professor · CSE' },
    'FACULTY_RAMAN': { id: 'FAC002', name: 'Dr. Ramanathan', title: 'Professor · CSE' },
    'FACULTY_PRIYA': { id: 'FAC020', name: 'Dr. Priya Sharma', title: 'Associate Professor · MBA' },
    'HOD': { id: 'FAC001', name: 'Dr. Arun Kumar (HOD)', title: 'Head of Department · CSE' },
    'ADMIN': { id: 'FAC001', name: 'Dr. Admin Administrator', title: 'University Academic Administrator' },
    'STUDENT_RAHUL': { id: 'RA2311001', name: 'Rahul Kumar (Student)', title: 'Student · B.Tech CSE (3rd Yr A)' },
    'STUDENT_RITHVIK': { id: 'RA2311004', name: 'Rithvik (Student)', title: 'Student · B.Tech CSE (3rd Yr B)' }
  };

  const persona = facultyMap[newRole] || { id: 'FAC001', name: 'Dr. Arun Kumar', title: 'Faculty' };
  window.currentActiveFacultyId = persona.id;

  // Update navbar user profile label
  document.querySelectorAll('.faculty-name').forEach(el => el.textContent = persona.name);
  document.querySelectorAll('.faculty-role').forEach(el => el.textContent = persona.title);

  applyRolePermissions(newRole);

  showToast('Role Switched', `Logged in as ${persona.name} (${newRole})`, 'info');

  // Trigger page-specific refresh
  if (currentPage === 'my-classes') {
    loadFacultyClasses();
  } else if (currentPage === 'dashboard') {
    loadFilteredDashboard();
  }
}

function applyRolePermissions(role) {
  const isAdmin = role === 'ADMIN';
  const isHOD = role === 'HOD';
  const isFaculty = role.startsWith('FACULTY') || isHOD || isAdmin;
  const isStudent = role.startsWith('STUDENT');

  // Show/Hide Admin-only nav items and buttons
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = (isAdmin || isHOD) ? '' : 'none';
  });

  // For Student view: limit navigation
  const myClassesNav = document.getElementById('nav-my-classes');
  if (myClassesNav) {
    const lbl = myClassesNav.querySelector('.nav-label');
    if (lbl) lbl.textContent = isStudent ? 'My Timetable' : 'My Classes';
  }
}

// ── 3. Faculty Dashboard & Class Schedule Workflow ───────────────────────────
let currentScheduleDay = 'Monday';

async function loadFacultyClasses(dayName) {
  if (dayName) currentScheduleDay = dayName;
  const day = currentScheduleDay || 'Monday';

  // Highlight active day pill in UI
  document.querySelectorAll('.day-filter-btn').forEach(btn => {
    if (btn.textContent.trim().toLowerCase() === day.toLowerCase()) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const facultyId = window.currentActiveFacultyId || 'FAC001';
  try {
    const res = await fetch(`/api/faculty/schedule?faculty_id=${encodeURIComponent(facultyId)}&day=${encodeURIComponent(day)}`);
    const data = await res.json();
    if (!data) return;

    // Render Current Class Hero Card
    renderCurrentClassCard(data.current_class);

    // Render Today's Schedule Cards
    renderScheduleGrid(data.schedule || []);
  } catch (err) {
    console.error('Error loading faculty classes:', err);
  }
}

function renderCurrentClassCard(classInfo) {
  const container = document.getElementById('current-class-card-container');
  if (!container) return;

  if (!classInfo) {
    container.innerHTML = `
      <div class="empty-state-card" style="padding:28px; text-align:center;">
        <i data-lucide="calendar-check" class="empty-icon" style="margin:0 auto 12px; color:var(--text-muted);"></i>
        <div class="empty-heading" style="font-size:16px;">No Active Period Right Now</div>
        <div class="empty-sub" style="font-size:13px; color:var(--text-muted); margin-top:4px;">
          You do not have a scheduled class at this exact time. Check your upcoming periods below or launch any scheduled class directly.
        </div>
      </div>
    `;
    if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="current-class-hero-card">
      <div class="hero-left">
        <div class="hero-badge-live">
          <span class="pulse-dot"></span> CURRENT CLASS NOW
        </div>
        <div class="hero-subject">${classInfo.subject_name} <span class="hero-subcode">(${classInfo.subject_code})</span></div>
        <div class="hero-meta">
          <span class="hero-pill"><i data-lucide="layers"></i> ${classInfo.department_code} · ${classInfo.year}rd Year · Sec ${classInfo.section_name}</span>
          <span class="hero-pill"><i data-lucide="clock"></i> ${classInfo.start_time} - ${classInfo.end_time}</span>
          <span class="hero-pill"><i data-lucide="map-pin"></i> ${classInfo.room || 'Room 302'}</span>
          <span class="hero-pill"><i data-lucide="users"></i> ${classInfo.enrolled_count || 48} Enrolled</span>
        </div>
      </div>
      <div class="hero-right">
        <button class="btn btn-primary hero-start-btn" onclick="startCurrentClassAttendance('${classInfo.id}')">
          <i data-lucide="camera"></i> START ATTENDANCE
        </button>
      </div>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function renderScheduleGrid(slots) {
  const grid = document.getElementById('faculty-schedule-grid');
  if (!grid) return;

  if (!slots.length) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:32px; color:var(--text-muted)">No classes scheduled for ' + currentScheduleDay + '.</div>';
    return;
  }

  grid.innerHTML = slots.map(s => `
    <div class="schedule-period-card ${s.is_active ? 'is-current' : ''}">
      <div class="card-time-row">
        <span class="card-time">${s.start_time} - ${s.end_time}</span>
        ${s.is_active ? '<span class="status-badge present">CURRENT</span>' : '<span class="status-badge" style="background:var(--bg-subtle); color:var(--text-muted);">SCHEDULED</span>'}
      </div>
      <div class="card-subject">${s.subject_name}</div>
      <div class="card-subcode">${s.subject_code} · ${s.room || 'Room 302'}</div>
      <div class="card-class-chip">
        <i data-lucide="graduation-cap"></i> ${s.department_code} · ${s.year}rd Year · Section ${s.section_name}
      </div>
      <div class="card-footer-row">
        <span class="card-count"><i data-lucide="users"></i> ${s.enrolled_count || 48} Students</span>
        <button class="btn btn-sm btn-primary" onclick="startCurrentClassAttendance('${s.id}')">
          <i data-lucide="camera"></i> Start Attendance
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

// ── 4. Attendance Session Lifecycle ──────────────────────────────────────────
async function startCurrentClassAttendance(timetableId) {
  try {
    const res = await fetch('/api/attendance/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timetable_id: timetableId })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Failed to start attendance session');
      return;
    }

    window.activeAttendanceSessionId = data.session_id;
    window.activeSessionData = data.session;

    showToast('Session Started', `Class session started for ${data.session.subject_code} (${data.session.section_name})`, 'success');

    // Switch to Live Attendance view
    navigateTo('live');

    // Update HUD
    refreshActiveSessionHUD(data.session_id);
  } catch (err) {
    showToast('Session Error', err.message, 'danger');
  }
}

async function refreshActiveSessionHUD(sessionId) {
  if (!sessionId) return;
  try {
    const res = await fetch(`/api/attendance/session/${sessionId}`);
    const data = await res.json();
    if (data.session) {
      window.activeSessionData = data.session;
      const banner = getElem('live-session-banner', 'live-session-hud');
      if (banner) {
        banner.style.display = 'flex';
        const titleEl = document.getElementById('live-sess-title');
        const subEl = document.getElementById('live-sess-subtitle');
        const chipEl = document.getElementById('live-sess-present-chip');
        if (titleEl) titleEl.textContent = `${data.session.subject_name} (${data.session.subject_code})`;
        if (subEl) subEl.textContent = `${data.session.department_code} · ${data.session.year}rd Year · Section ${data.session.section_name} · Room ${data.session.room || '302'} · Faculty: ${data.session.faculty_name}`;
        if (chipEl) chipEl.textContent = `Present: ${data.stats.present} / ${data.stats.total}`;
      }
    }
  } catch (e) {}
}

function updateLiveSessionHUDStats(stats) {
  if (!stats) return;
  const chipEl = document.getElementById('live-sess-present-chip');
  if (chipEl) chipEl.textContent = `Present: ${stats.present} / ${stats.total}`;
  const p = document.getElementById('hud-present-count');
  const a = document.getElementById('hud-absent-count');
  const t = document.getElementById('hud-total-count');
  if (p) p.textContent = stats.present;
  if (a) a.textContent = stats.absent;
  if (t) t.textContent = stats.total;
}

function showSessionMismatchAlert(alert) {
  const el = getElem('mismatch-alert-strip', 'session-mismatch-banner');
  if (!el) return;
  el.style.display = 'flex';
  const txt = document.getElementById('mismatch-alert-text');
  if (txt) {
    txt.innerHTML = `⚠️ <strong>SECTION MISMATCH:</strong> Student <em>${alert.student_name}</em> (${alert.student_reg_no}) belongs to <strong>${alert.student_section}</strong>. Current class is strictly for <strong>${alert.target_section}</strong>. Attendance punch rejected!`;
  }
}

function hideSessionMismatchAlert() {
  const el = getElem('mismatch-alert-strip', 'session-mismatch-banner');
  if (el) el.style.display = 'none';
}

function exitActiveAttendanceSession() {
  if (!confirm('Leave this active attendance session? Unsubmitted attendance will stay in DRAFT mode.')) return;
  window.activeAttendanceSessionId = null;
  window.activeSessionData = null;
  const banner = getElem('live-session-banner', 'live-session-hud');
  if (banner) banner.style.display = 'none';
  hideSessionMismatchAlert();
  showToast('Session Exited', 'Attendance session paused. You can review or resume it anytime.', 'info');
}

// ── 5. Attendance Verification & Review Modal ────────────────────────────────
async function openAttendanceReviewModal(sessionId) {
  const sId = sessionId || window.activeAttendanceSessionId;
  if (!sId) {
    alert('No active attendance session to review.');
    return;
  }

  try {
    const res = await fetch(`/api/attendance/session/${sId}`);
    const data = await res.json();
    if (!data.session) {
      alert('Attendance session not found.');
      return;
    }
    window.currentReviewSessionData = data;
    renderReviewModal(data);
    const modal = document.getElementById('attendance-review-modal');
    if (modal) modal.style.display = 'flex';
  } catch (err) {
    showToast('Review Error', err.message, 'danger');
  }
}

function closeAttendanceReviewModal() {
  const modal = document.getElementById('attendance-review-modal');
  if (modal) modal.style.display = 'none';
}

function renderReviewModal(data) {
  const session = data.session;
  const stats = data.stats;
  const records = data.records;

  // Header meta
  const subjEl = getElem('rev-subject-name', 'review-subject');
  const classEl = getElem('rev-class-name', 'review-class');
  const facEl = getElem('rev-faculty-name', 'review-faculty');
  const dateEl = getElem('rev-session-date', 'review-date');
  const tagEl = getElem('rev-status-badge', 'review-status-tag');

  if (subjEl) subjEl.textContent = `${session.subject_name} (${session.subject_code})`;
  if (classEl) classEl.textContent = `${session.department_code} · ${session.year}rd Year · Section ${session.section_name}`;
  if (facEl) facEl.textContent = session.faculty_name;
  if (dateEl) dateEl.textContent = session.date;
  if (tagEl) tagEl.textContent = session.status.toUpperCase();

  // Metrics
  const presEl = getElem('rev-present-count', 'review-present-count');
  const absEl = getElem('rev-absent-count', 'review-absent-count');
  const confEl = getElem('rev-confidence-avg', 'review-confidence');
  if (presEl) presEl.textContent = `${stats.present} / ${stats.total}`;
  if (absEl) absEl.textContent = `${stats.absent} / ${stats.total}`;
  if (confEl) confEl.textContent = `${stats.avg_confidence}%`;

  const isLocked = session.status === 'LOCKED' || session.status === 'SUBMITTED';

  // Table rows
  const tbody = getElem('review-roster-tbody', 'review-table-tbody');
  if (tbody) {
    tbody.innerHTML = records.map((r) => {
      const isPresent = r.status.toUpperCase() === 'PRESENT';
      const conf = r.confidence ? `${Math.round(r.confidence * 100)}%` : '--';
      const faceStatus = r.face_detected ?
        '<span class="status-badge present" style="font-size:11px;">✓ Recognized</span>' :
        '<span class="status-badge" style="background:var(--bg-subtle); color:var(--text-muted); font-size:11px;">Not Detected</span>';

      return `
        <tr data-student-id="${r.student_id}">
          <td style="font-weight:600;">${r.student_name}</td>
          <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted);">${r.student_reg_no}</td>
          <td>${faceStatus}</td>
          <td style="font-family:var(--font-mono); font-size:12px;">${conf}</td>
          <td>
            <span class="status-badge ${isPresent ? 'present' : 'absent'}">${r.status}</span>
          </td>
          <td style="text-align:right;">
            <div class="toggle-switch-group ${isLocked ? 'disabled' : ''}" style="display:inline-flex; gap:4px;">
              <button class="mini-btn ${isPresent ? 'primary' : ''}" 
                onclick="${isLocked ? '' : `toggleReviewStudentStatus('${r.student_id}', 'PRESENT')`}"
                ${isLocked ? 'disabled' : ''}>
                ✓ Present
              </button>
              <button class="mini-btn ${!isPresent ? 'danger' : ''}" 
                onclick="${isLocked ? '' : `toggleReviewStudentStatus('${r.student_id}', 'ABSENT')`}"
                ${isLocked ? 'disabled' : ''}>
                ✕ Absent
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Disable actions if locked
  const btnSave = getElem('btn-rev-save-draft', 'btn-review-save-draft');
  const btnSubmit = getElem('btn-rev-submit-lock', 'btn-review-submit');
  const btnCorrect = getElem('btn-rev-request-corr', 'btn-review-request-correction');
  if (btnSave) btnSave.style.display = isLocked ? 'none' : '';
  if (btnSubmit) btnSubmit.style.display = isLocked ? 'none' : '';
  if (btnCorrect) btnCorrect.style.display = isLocked ? '' : 'none';

  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function toggleReviewStudentStatus(studentId, newStatus) {
  if (!window.currentReviewSessionData) return;
  const records = window.currentReviewSessionData.records;
  const target = records.find(r => r.student_id === studentId);
  if (target) {
    target.status = newStatus;
    if (newStatus === 'PRESENT' && !target.confidence) {
      target.confidence = 0.95;
    }
    // Recalculate stats
    const presentCount = records.filter(r => r.status.toUpperCase() === 'PRESENT').length;
    const absentCount = records.length - presentCount;
    window.currentReviewSessionData.stats.present = presentCount;
    window.currentReviewSessionData.stats.absent = absentCount;
    const pEl = getElem('rev-present-count', 'review-present-count');
    const aEl = getElem('rev-absent-count', 'review-absent-count');
    if (pEl) pEl.textContent = `${presentCount} / ${records.length}`;
    if (aEl) aEl.textContent = `${absentCount} / ${records.length}`;

    // Update row
    const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
    if (row) {
      const pBtn = row.querySelector('.mini-btn:nth-child(1)');
      const aBtn = row.querySelector('.mini-btn:nth-child(2)');
      const statusBadge = row.querySelector('td:nth-child(5) .status-badge');
      if (statusBadge) {
        statusBadge.textContent = newStatus;
        statusBadge.className = `status-badge ${newStatus === 'PRESENT' ? 'present' : 'absent'}`;
      }
      if (pBtn && aBtn) {
        if (newStatus === 'PRESENT') {
          pBtn.classList.add('primary');
          aBtn.classList.remove('danger');
        } else {
          pBtn.classList.remove('primary');
          aBtn.classList.add('danger');
        }
      }
    }
  }
}

async function saveAttendanceDraft() {
  if (!window.currentReviewSessionData) return;
  const sId = window.currentReviewSessionData.session.id;
  const records = window.currentReviewSessionData.records.map(r => ({
    student_id: r.student_id,
    status: r.status,
    confidence: r.confidence,
    face_detected: r.face_detected ? 1 : 0
  }));

  try {
    const res = await fetch(`/api/attendance/session/${sId}/save_draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Draft Saved', 'Attendance session draft saved successfully.', 'success');
      closeAttendanceReviewModal();
    }
  } catch (err) {
    showToast('Save Failed', err.message, 'danger');
  }
}

async function submitAttendanceFinal() {
  if (!window.currentReviewSessionData) return;
  if (!confirm('Submit and LOCK this attendance session? Once submitted, attendance cannot be silently modified without HOD/Admin correction approval.')) return;

  const sId = window.currentReviewSessionData.session.id;
  const records = window.currentReviewSessionData.records.map(r => ({
    student_id: r.student_id,
    status: r.status,
    confidence: r.confidence,
    face_detected: r.face_detected ? 1 : 0
  }));

  try {
    const res = await fetch(`/api/attendance/session/${sId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Attendance Locked', 'Session verified, submitted, and locked in the official university register.', 'success');
      closeAttendanceReviewModal();
      window.activeAttendanceSessionId = null;
      window.activeSessionData = null;
      const banner = getElem('live-session-banner', 'live-session-hud');
      if (banner) banner.style.display = 'none';
      loadFilteredDashboard();
    }
  } catch (err) {
    showToast('Submission Failed', err.message, 'danger');
  }
}

// Correction Request Flow
function openCorrectionRequestModal(sessionId) {
  const sId = sessionId || (window.currentReviewSessionData ? window.currentReviewSessionData.session.id : null);
  const modal = document.getElementById('correction-request-modal');
  if (modal) {
    modal.dataset.sessionId = sId;
    modal.style.display = 'flex';
  }
}

function closeCorrectionRequestModal() {
  const modal = document.getElementById('correction-request-modal');
  if (modal) modal.style.display = 'none';
}

async function submitCorrectionRequest() {
  const modal = document.getElementById('correction-request-modal');
  const sId = modal?.dataset.sessionId;
  const reason = (getElem('corr-reason', 'correction-reason-input')?.value || '').trim();
  if (!reason) {
    alert('Please enter a clear justification reason for the modification request.');
    return;
  }

  try {
    const res = await fetch(`/api/attendance/session/${sId}/request_correction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requested_by: window.currentActiveFacultyId || 'FAC001',
        reason: reason,
        changes: []
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Correction Requested', 'Modification request submitted for HOD / Admin approval.', 'info');
      closeCorrectionRequestModal();
      closeAttendanceReviewModal();
    }
  } catch (err) {
    showToast('Request Failed', err.message, 'danger');
  }
}

// ── 6. Timetable Upload & 12-Point Pre-Import Validation System ───────────────
function openTimetableUploadModal() {
  const modal = document.getElementById('timetable-upload-modal');
  if (modal) {
    modal.style.display = 'flex';
    const preview = getElem('tt-val-preview-wrap', 'timetable-upload-preview');
    if (preview) preview.style.display = 'none';
    const input = getElem('tt-master-file-input', 'timetable-file-input');
    if (input) input.value = '';
    window.validatedTimetableEntries = [];
  }
}

function closeTimetableUploadModal() {
  const modal = document.getElementById('timetable-upload-modal');
  if (modal) modal.style.display = 'none';
}

function downloadTimetableTemplate() {
  window.open('/api/academic/timetable/template', '_blank');
}

async function onTimetableFileSelected(event) {
  const file = event.target.files ? event.target.files[0] : null;
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  const banner = getElem('tt-val-summary-banner', 'timetable-upload-preview');
  if (banner) banner.style.display = 'block';

  const previewWrap = document.getElementById('tt-val-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'block';

  const titleEl = getElem('tt-val-status-title', 'tt-validation-status');
  if (titleEl) titleEl.innerHTML = '<span class="pulse-dot"></span> Validating against university academic database...';

  try {
    const res = await fetch('/api/academic/timetable/validate', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.success) {
      if (titleEl) {
        titleEl.innerHTML = `<span style="color:#ef4444; font-weight:700;">❌ Validation Failed: ${data.message}</span>`;
      }
      return;
    }

    window.validatedTimetableEntries = data.valid_entries || [];

    const valids = data.valid_rows || 0;
    const errors = data.error_count || 0;

    const validChip = document.getElementById('tt-val-valid-chip');
    const errChip = document.getElementById('tt-val-error-chip');
    if (validChip) validChip.textContent = `${valids} Valid`;
    if (errChip) errChip.textContent = `${errors} Errors`;

    if (titleEl) {
      titleEl.innerHTML = errors > 0 ?
        `<span style="color:#ef4444; font-weight:700;">❌ Issues Detected (${errors} errors)</span>` :
        `<span style="color:#10b981; font-weight:700;">✅ All ${valids} entries passed 12-point academic integrity checks.</span>`;
    }

    // Render Preview Table
    const tbody = getElem('tt-val-preview-tbody', 'tt-preview-tbody');
    if (tbody && data.preview) {
      tbody.innerHTML = data.preview.map(p => `
        <tr class="${p.errors && p.errors.length ? 'row-error' : ''}">
          <td>
            ${p.errors && p.errors.length ?
              `<span class="status-badge absent" title="${p.errors.join('; ')}">❌ Error</span>` :
              `<span class="status-badge present">✓ Valid</span>`}
          </td>
          <td>${p.day}</td>
          <td>${p.time}</td>
          <td>${p.department} (${p.program})</td>
          <td>Y${p.year} Sec ${p.section}</td>
          <td><strong>${p.subject_code}</strong></td>
          <td>${p.faculty_id}</td>
          <td>${p.room || '--'}</td>
          <td style="font-size:11.5px; color:${p.errors && p.errors.length ? '#ef4444' : 'var(--text-muted)'};">
            ${p.errors && p.errors.length ? p.errors.join('; ') : 'No conflicts'}
          </td>
        </tr>
      `).join('');
    }

    // Enable/Disable import button
    const btnImport = getElem('btn-tt-confirm-import', 'btn-confirm-import-timetable');
    if (btnImport) {
      btnImport.disabled = (errors > 0 || valids === 0);
      btnImport.textContent = `Confirm & Import ${valids} Slots`;
    }
  } catch (err) {
    if (titleEl) titleEl.innerHTML = `<span style="color:#ef4444;">Error validating file: ${err.message}</span>`;
  }
}

async function confirmTimetableImport() {
  if (!window.validatedTimetableEntries || !window.validatedTimetableEntries.length) {
    alert('No validated entries to import.');
    return;
  }

  const btnImport = getElem('btn-tt-confirm-import', 'btn-confirm-import-timetable');
  if (btnImport) {
    btnImport.disabled = true;
    btnImport.textContent = 'Importing...';
  }

  try {
    const res = await fetch('/api/academic/timetable/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: window.validatedTimetableEntries })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Timetable Imported', `Successfully imported ${data.imported_count} timetable slots into university database.`, 'success');
      closeTimetableUploadModal();
      loadTimetableSchedule();
      if (currentPage === 'my-classes') loadFacultyClasses();
    } else {
      alert(data.message || 'Import failed');
    }
  } catch (err) {
    showToast('Import Error', err.message, 'danger');
  } finally {
    if (btnImport) btnImport.disabled = false;
  }
}

// ── 7. Academic Management Master CRUD ─────────────────────────────────────────
function switchAcademicTab(tab) {
  window.activeAcademicTab = tab;
  document.querySelectorAll('.academic-subtab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  loadAcademicData(tab);
}

async function loadAcademicData(tab) {
  const container = document.getElementById('academic-tab-content');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding:32px;"><span class="pulse-dot"></span> Loading ' + tab + '...</div>';

  try {
    let url = `/api/academic/${tab}`;
    if (tab === 'corrections') url = '/api/attendance/corrections';

    const res = await fetch(url);
    const data = await res.json();

    if (tab === 'departments') {
      renderDepartmentsTable(data.departments || []);
    } else if (tab === 'programs') {
      renderProgramsTable(data.programs || []);
    } else if (tab === 'sections') {
      renderSectionsTable(data.sections || []);
    } else if (tab === 'subjects') {
      renderSubjectsTable(data.subjects || []);
    } else if (tab === 'faculty') {
      renderFacultyTable(data.faculty || []);
    } else if (tab === 'students') {
      renderStudentsTable(data.students || []);
    } else if (tab === 'corrections') {
      renderCorrectionsTable(data.corrections || []);
    }
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444; padding:24px;">Failed to load data: ${err.message}</div>`;
  }
}

function renderDepartmentsTable(depts) {
  const container = document.getElementById('academic-tab-content');
  container.innerHTML = `
    <div class="academic-table-wrap">
      <div class="academic-table-head-bar">
        <div class="head-title">Departments (${depts.length})</div>
        <button class="btn btn-sm btn-primary" onclick="openAcademicAddModal('departments')">
          <i data-lucide="plus"></i> Add Department
        </button>
      </div>
      <table class="academic-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Department Name</th>
            <th>Head of Department</th>
            <th>Building / Block</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${depts.map(d => `
            <tr>
              <td><strong>${d.code}</strong></td>
              <td>${d.name}</td>
              <td>${d.hod_name || '--'}</td>
              <td>${d.building || 'Main Campus'}</td>
              <td style="text-align:right;">
                <button class="mini-btn danger" onclick="deleteAcademicEntity('departments', '${d.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function renderProgramsTable(progs) {
  const container = document.getElementById('academic-tab-content');
  container.innerHTML = `
    <div class="academic-table-wrap">
      <div class="academic-table-head-bar">
        <div class="head-title">Degree Programs (${progs.length})</div>
        <button class="btn btn-sm btn-primary" onclick="openAcademicAddModal('programs')">
          <i data-lucide="plus"></i> Add Program
        </button>
      </div>
      <table class="academic-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Program Name</th>
            <th>Department</th>
            <th>Degree Level</th>
            <th>Duration</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${progs.map(p => `
            <tr>
              <td><strong>${p.code}</strong></td>
              <td>${p.name}</td>
              <td>${p.dept_name || p.dept_id}</td>
              <td><span class="nav-badge" style="background:var(--bg-subtle); color:var(--text-main);">${p.degree_level}</span></td>
              <td>${p.duration_years} Years</td>
              <td style="text-align:right;">
                <button class="mini-btn danger" onclick="deleteAcademicEntity('programs', '${p.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function renderSectionsTable(sections) {
  const container = document.getElementById('academic-tab-content');
  container.innerHTML = `
    <div class="academic-table-wrap">
      <div class="academic-table-head-bar">
        <div class="head-title">Sections & Batches (${sections.length})</div>
        <button class="btn btn-sm btn-primary" onclick="openAcademicAddModal('sections')">
          <i data-lucide="plus"></i> Add Section
        </button>
      </div>
      <table class="academic-table">
        <thead>
          <tr>
            <th>Section</th>
            <th>Program</th>
            <th>Department</th>
            <th>Year</th>
            <th>Semester</th>
            <th>Batch</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sections.map(s => `
            <tr>
              <td><strong>Section ${s.name}</strong></td>
              <td>${s.program_code} · ${s.program_name}</td>
              <td>${s.dept_code}</td>
              <td>Year ${s.year}</td>
              <td>Sem ${s.semester}</td>
              <td>${s.batch || '2023-27'}</td>
              <td style="text-align:right;">
                <button class="mini-btn danger" onclick="deleteAcademicEntity('sections', '${s.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function renderSubjectsTable(subjects) {
  const container = document.getElementById('academic-tab-content');
  container.innerHTML = `
    <div class="academic-table-wrap">
      <div class="academic-table-head-bar">
        <div class="head-title">Courses & Subjects (${subjects.length})</div>
        <button class="btn btn-sm btn-primary" onclick="openAcademicAddModal('subjects')">
          <i data-lucide="plus"></i> Add Subject
        </button>
      </div>
      <table class="academic-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Subject Name</th>
            <th>Program</th>
            <th>Year / Sem</th>
            <th>Credits</th>
            <th>Type</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${subjects.map(s => `
            <tr>
              <td><strong>${s.code}</strong></td>
              <td>${s.name}</td>
              <td>${s.program_code || '--'}</td>
              <td>Y${s.year} · Sem ${s.semester}</td>
              <td>${s.credits || 4}</td>
              <td><span class="status-badge present">${s.is_elective ? 'Elective' : 'Core'}</span></td>
              <td style="text-align:right;">
                <button class="mini-btn danger" onclick="deleteAcademicEntity('subjects', '${s.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function renderFacultyTable(faculty) {
  const container = document.getElementById('academic-tab-content');
  container.innerHTML = `
    <div class="academic-table-wrap">
      <div class="academic-table-head-bar">
        <div class="head-title">Faculty Members (${faculty.length})</div>
      </div>
      <table class="academic-table">
        <thead>
          <tr>
            <th>Faculty ID</th>
            <th>Name</th>
            <th>Department</th>
            <th>Designation</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          ${faculty.map(f => `
            <tr>
              <td><strong>${f.faculty_id}</strong></td>
              <td>${f.name}</td>
              <td>${f.department_code || '--'}</td>
              <td>${f.designation || 'Faculty'}</td>
              <td>${f.email || '--'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function renderStudentsTable(students) {
  const container = document.getElementById('academic-tab-content');
  container.innerHTML = `
    <div class="academic-table-wrap">
      <div class="academic-table-head-bar">
        <div class="head-title">Enrolled Students Mapped to Academic Structure (${students.length})</div>
      </div>
      <table class="academic-table">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Reg No</th>
            <th>Department</th>
            <th>Program</th>
            <th>Year / Sem</th>
            <th>Section</th>
            <th>Biometric Status</th>
          </tr>
        </thead>
        <tbody>
          ${students.map(s => `
            <tr>
              <td><strong>${s.name}</strong></td>
              <td style="font-family:var(--font-mono); font-size:12px;">${s.reg_no}</td>
              <td>${s.department_code}</td>
              <td>${s.program_code}</td>
              <td>Y${s.year} · Sem ${s.semester}</td>
              <td><span class="status-badge present">Sec ${s.section_name}</span></td>
              <td>${s.has_face_encoding ? '<span class="status-badge present">✓ Biometric Ready</span>' : '<span class="status-badge" style="background:var(--bg-subtle); color:var(--text-muted);">No Biometric</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function renderCorrectionsTable(corrections) {
  const container = document.getElementById('academic-tab-content');
  if (!corrections.length) {
    container.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-muted)">No pending attendance correction requests. All official records synchronized.</div>';
    return;
  }

  container.innerHTML = `
    <div class="academic-table-wrap">
      <div class="academic-table-head-bar">
        <div class="head-title">Official Attendance Correction Requests (${corrections.length})</div>
      </div>
      <table class="academic-table">
        <thead>
          <tr>
            <th>Session</th>
            <th>Class</th>
            <th>Requested By</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Requested At</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${corrections.map(c => `
            <tr>
              <td><strong>${c.subject_code}</strong> (${c.session_date})</td>
              <td>${c.dept_code} · ${c.year}rd Yr · Sec ${c.section_name}</td>
              <td>${c.faculty_name} (${c.requested_by})</td>
              <td>${c.reason}</td>
              <td><span class="status-badge ${c.status === 'PENDING' ? 'late' : (c.status === 'APPROVED' ? 'present' : 'absent')}">${c.status}</span></td>
              <td style="font-size:11.5px; color:var(--text-muted);">${c.requested_at}</td>
              <td style="text-align:right;">
                ${c.status === 'PENDING' ? `
                  <button class="mini-btn" onclick="reviewCorrection('${c.id}', 'APPROVE')">Approve</button>
                  <button class="mini-btn danger" onclick="reviewCorrection('${c.id}', 'REJECT')">Reject</button>
                ` : `<span style="font-size:12px; color:var(--text-muted);">${c.status}</span>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

async function reviewCorrection(correctionId, action) {
  const adminNotes = prompt(`Enter comments or justification for ${action}:`) || '';
  try {
    const res = await fetch(`/api/attendance/corrections/${correctionId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        reviewed_by: window.currentActiveFacultyId || 'ADMIN',
        admin_notes: adminNotes
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Correction Updated', `Request has been marked as ${action}.`, 'success');
      loadAcademicData('corrections');
    }
  } catch (err) {
    showToast('Action Failed', err.message, 'danger');
  }
}

async function deleteAcademicEntity(entityType, id) {
  if (!confirm(`Are you sure you want to delete this ${entityType.slice(0, -1)}?`)) return;
  try {
    const res = await fetch(`/api/academic/${entityType}/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Deleted', `${entityType.slice(0, -1)} deleted successfully.`, 'success');
      loadAcademicData(entityType);
    } else {
      alert(data.message || 'Delete failed');
    }
  } catch (err) {
    showToast('Delete Error', err.message, 'danger');
  }
}

function openAcademicAddModal(entityType) {
  const modal = document.getElementById('academic-entity-modal');
  if (!modal) return;
  modal.dataset.entityType = entityType;
  const title = document.getElementById('academic-entity-modal-title');
  const body = document.getElementById('academic-entity-modal-body');

  if (entityType === 'departments') {
    if (title) title.textContent = 'Add University Department';
    body.innerHTML = `
      <div class="form-group"><label>Department Code (e.g. CSE, ECE, MBA):</label><input type="text" id="add-dept-code" class="form-input" placeholder="e.g. AI-DS"></div>
      <div class="form-group"><label>Department Name:</label><input type="text" id="add-dept-name" class="form-input" placeholder="e.g. Artificial Intelligence and Data Science"></div>
      <div class="form-group"><label>Head of Department (Faculty ID / Name):</label><input type="text" id="add-dept-hod" class="form-input" placeholder="e.g. Dr. K. Venkat"></div>
      <div class="form-group"><label>Building / Campus Block:</label><input type="text" id="add-dept-building" class="form-input" placeholder="e.g. Tech Park Block B"></div>
    `;
  } else if (entityType === 'programs') {
    if (title) title.textContent = 'Add Academic Degree Program';
    body.innerHTML = `
      <div class="form-group"><label>Program Code (e.g. BTECH-CSE, MBA):</label><input type="text" id="add-prog-code" class="form-input" placeholder="e.g. BTECH-AIDS"></div>
      <div class="form-group"><label>Program Name:</label><input type="text" id="add-prog-name" class="form-input" placeholder="e.g. B.Tech Artificial Intelligence & Data Science"></div>
      <div class="form-group"><label>Department ID (e.g. dept_cse, dept_mba):</label><input type="text" id="add-prog-dept" class="form-input" placeholder="dept_cse"></div>
      <div class="form-group"><label>Degree Level:</label><select id="add-prog-level" class="form-select"><option value="UG">Undergraduate (UG)</option><option value="PG">Postgraduate (PG)</option><option value="PHD">PhD / Research</option></select></div>
      <div class="form-group"><label>Duration (Years):</label><input type="number" id="add-prog-duration" class="form-input" value="4"></div>
    `;
  } else if (entityType === 'sections') {
    if (title) title.textContent = 'Add Section / Class Batch';
    body.innerHTML = `
      <div class="form-group"><label>Section Name (e.g. A, B, C):</label><input type="text" id="add-sec-name" class="form-input" placeholder="A"></div>
      <div class="form-group"><label>Program ID (e.g. prog_btech_cse, prog_mba):</label><input type="text" id="add-sec-prog" class="form-input" placeholder="prog_btech_cse"></div>
      <div class="form-group"><label>Academic Year (1, 2, 3, 4):</label><input type="number" id="add-sec-year" class="form-input" value="3"></div>
      <div class="form-group"><label>Semester (1 to 8):</label><input type="number" id="add-sec-sem" class="form-input" value="5"></div>
      <div class="form-group"><label>Batch Period (e.g. 2024-2028):</label><input type="text" id="add-sec-batch" class="form-input" value="2024-2028"></div>
    `;
  } else if (entityType === 'subjects') {
    if (title) title.textContent = 'Add Course / Subject';
    body.innerHTML = `
      <div class="form-group"><label>Subject Code (e.g. CS501, MBA101):</label><input type="text" id="add-sub-code" class="form-input" placeholder="CS501"></div>
      <div class="form-group"><label>Subject Name:</label><input type="text" id="add-sub-name" class="form-input" placeholder="Database Management Systems"></div>
      <div class="form-group"><label>Program ID:</label><input type="text" id="add-sub-prog" class="form-input" placeholder="prog_btech_cse"></div>
      <div class="form-group"><label>Year:</label><input type="number" id="add-sub-year" class="form-input" value="3"></div>
      <div class="form-group"><label>Semester:</label><input type="number" id="add-sub-sem" class="form-input" value="5"></div>
      <div class="form-group"><label>Credits:</label><input type="number" id="add-sub-credits" class="form-input" value="4"></div>
    `;
  }

  modal.style.display = 'flex';
}

function closeAcademicEntityModal() {
  const modal = document.getElementById('academic-entity-modal');
  if (modal) modal.style.display = 'none';
}

async function saveAcademicEntity() {
  const modal = document.getElementById('academic-entity-modal');
  const entityType = modal?.dataset.entityType;
  if (!entityType) return;

  let payload = {};
  if (entityType === 'departments') {
    payload = {
      code: document.getElementById('add-dept-code')?.value,
      name: document.getElementById('add-dept-name')?.value,
      hod_name: document.getElementById('add-dept-hod')?.value,
      building: document.getElementById('add-dept-building')?.value
    };
  } else if (entityType === 'programs') {
    payload = {
      code: document.getElementById('add-prog-code')?.value,
      name: document.getElementById('add-prog-name')?.value,
      dept_id: document.getElementById('add-prog-dept')?.value,
      degree_level: document.getElementById('add-prog-level')?.value,
      duration_years: parseInt(document.getElementById('add-prog-duration')?.value || '4')
    };
  } else if (entityType === 'sections') {
    payload = {
      name: document.getElementById('add-sec-name')?.value,
      program_id: document.getElementById('add-sec-prog')?.value,
      year: parseInt(document.getElementById('add-sec-year')?.value || '1'),
      semester: parseInt(document.getElementById('add-sec-sem')?.value || '1'),
      batch: document.getElementById('add-sec-batch')?.value
    };
  } else if (entityType === 'subjects') {
    payload = {
      code: document.getElementById('add-sub-code')?.value,
      name: document.getElementById('add-sub-name')?.value,
      program_id: document.getElementById('add-sub-prog')?.value,
      year: parseInt(document.getElementById('add-sub-year')?.value || '1'),
      semester: parseInt(document.getElementById('add-sub-sem')?.value || '1'),
      credits: parseInt(document.getElementById('add-sub-credits')?.value || '4')
    };
  }

  try {
    const res = await fetch(`/api/academic/${entityType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Created', `${entityType.slice(0, -1)} successfully added.`, 'success');
      closeAcademicEntityModal();
      loadAcademicData(entityType);
      initAcademicFilterOptions();
    } else {
      alert(data.message || 'Creation failed');
    }
  } catch (err) {
    showToast('Save Error', err.message, 'danger');
  }
}

// ── Dashboard Initialization ─────────────────────────────────────────────────
function initDashboard(){
  // Load saved theme
  try {
    const savedTheme = localStorage.getItem('visionattend_theme');
    if(savedTheme){
      document.documentElement.setAttribute('data-theme', savedTheme);
      const darkCheckbox = document.getElementById('set-dark-mode');
      if(darkCheckbox) darkCheckbox.checked = (savedTheme === 'dark');
      const themeIcon = document.getElementById('theme-toggle-icon');
      if(themeIcon){
        themeIcon.setAttribute('data-lucide', savedTheme === 'dark' ? 'sun' : 'moon');
      }
    }

    const savedFaculty = JSON.parse(localStorage.getItem('visionattend_faculty') || '{}');
    if(savedFaculty.name){
      document.querySelectorAll('.faculty-name').forEach(el => el.textContent = savedFaculty.name);
      const nameInput = document.getElementById('set-faculty-name');
      if(nameInput) nameInput.value = savedFaculty.name;
    }
  } catch(e){}

  // Set today's date in pickers
  const todayStr = new Date().toISOString().split('T')[0];
  const recPicker = document.getElementById('records-date-picker');
  const repPicker = document.getElementById('report-date-picker');
  if(recPicker) recPicker.value = todayStr;
  if(repPicker) repPicker.value = todayStr;

  // Initialize Lucide Icons
  if(window.lucide && typeof lucide.createIcons === 'function'){
    lucide.createIcons();
  }

  // Initial data loading
  loadStudentsDirectory();
  loadRecordsForDate(todayStr);
  loadAnalytics();

  // Initialize Academic Hierarchy Filters and Faculty Schedule
  initAcademicFilterOptions();
  loadFacultyClasses();
}

// Run init
initDashboard();

// ── Backend Camera Stream Health Monitor ──────────────────────────────────────
// Auto-detects when backend MJPEG stream is black/stalled and offers client webcam fallback
(function initCameraHealthMonitor(){
  let healthCheckCount = 0;
  let lastFrameId = -1;
  let stalledCount = 0;
  let alreadyFalledBack = false;

  async function checkCameraHealth(){
    // Only check when on the live attendance page and using backend camera
    const livePage = document.getElementById('page-live');
    if(!livePage || livePage.style.display === 'none') return;
    if(useClientWebcam) return; // Already on client webcam
    if(alreadyFalledBack) return;

    healthCheckCount++;

    try {
      const res = await fetch('/api/camera/health');
      const data = await res.json();

      if(data.health && (data.health.includes('DISCONNECTED') || data.health.includes('FAILED') || data.health === 'OFFLINE')){
        stalledCount++;
      } else if(data.frame_id === lastFrameId && data.has_frame){
        // Frame ID hasn't changed — stream is stalled
        stalledCount++;
      } else {
        stalledCount = 0;
      }
      lastFrameId = data.frame_id;

      // If stalled for 3+ consecutive checks (6+ seconds), auto-switch to client webcam
      if(stalledCount >= 3 && !alreadyFalledBack){
        console.warn('[CameraHealth] Backend stream appears stalled/black. Auto-switching to client webcam...');
        alreadyFalledBack = true;
        triggerHud('BACKEND CAMERA OFFLINE — SWITCHING TO BROWSER WEBCAM');

        // Try to activate client webcam
        try {
          await activateClientWebcam(null, 'Auto-Fallback Webcam');
        } catch(e){
          console.error('[CameraHealth] Client webcam fallback failed:', e);
          // Try refreshing the backend stream instead
          const backendImg = document.getElementById('video-feed');
          if(backendImg){
            backendImg.src = `/video_feed?t=${Date.now()}`;
          }
          alreadyFalledBack = false;
          stalledCount = 0;
        }
      }
    } catch(e){
      // Server might be down
    }
  }

  // Check every 2 seconds
  setInterval(checkCameraHealth, 2000);

  // Also add error handler to the video-feed img element
  setTimeout(() => {
    const feedImg = document.getElementById('video-feed');
    if(feedImg){
      feedImg.addEventListener('error', async function(){
        if(!useClientWebcam && !alreadyFalledBack){
          console.warn('[CameraHealth] video-feed img error — switching to client webcam');
          alreadyFalledBack = true;
          try {
            await activateClientWebcam(null, 'Fallback Webcam');
          } catch(e){
            alreadyFalledBack = false;
          }
        }
      });
    }
  }, 1000);
})();


