// App.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import './App.css'

function formatTime(seconds) {
  if (seconds === '' || seconds === null || seconds === undefined) return '00:00';
  const secNum = parseInt(seconds, 10) || 0;
  const mins = Math.floor(secNum / 60);
  const secs = secNum % 60;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function App() {
  // state variables
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [timer, setTimer] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const [showFocusModal, setShowFocusModal] = useState(false);
  const [exitNotice, setExitNotice] = useState('');
  const [cameraDir, setCameraDir] = useState('');
  const [screenDir, setScreenDir] = useState('');

  // Mock test input and security state
  const [essayAnswer, setEssayAnswer] = useState('');
  const [shortAnswer, setShortAnswer] = useState('');
  const [blockedAlert, setBlockedAlert] = useState(null);
  const [blockedLog, setBlockedLog] = useState([]);

  // ref variables
  const videoRef = useRef(null);
  const pipVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const isBlurredRef = useRef(false);
  const cameraDirRef = useRef('');
  const screenDirRef = useRef('');


  const saveVideoScreenShots = useCallback(async () => {
    const stream = cameraStreamRef.current || videoRef.current?.srcObject;
    if (!stream) {
      return;
    }

    try {
      const track = stream.getVideoTracks()[0];
      if (!track) return;

      const imageCapture = new ImageCapture(track);
      const blob = await imageCapture.takePhoto();
      const arrayBuffer = await blob.arrayBuffer();

      window.athena?.storeCameraSnapImageOnDisk?.(arrayBuffer, cameraDirRef.current || undefined);
    } catch (error) {
      console.error("Failed to capture image via ImageCapture:", error);
    }
  }, []);

  useEffect(() => {
    // Check initial kiosk mode status
    window.athena?.isKiosk?.()?.then((kiosk) => {
      if (kiosk) {
        setFullScreen(true);
      }
    });

    // Fetch initial snapshot directories
    window.athena?.getDirectories?.()?.then((dirs) => {
      if (dirs) {
        if (dirs.cameraDir) {
          setCameraDir(dirs.cameraDir);
          cameraDirRef.current = dirs.cameraDir;
        }
        if (dirs.screenDir) {
          setScreenDir(dirs.screenDir);
          screenDirRef.current = dirs.screenDir;
        }
      }
    });

    // Register Listener for handling Timer Tick from Main
    const removeTimerTickListener = window.athena?.registerListenerForTimerTickFromMain?.(setTimer);

    // Register Listener for handling Camera Snap Request from Main
    const removeCameraSnapListener = window.athena?.registerListenerForCameraSnapFromMain?.(saveVideoScreenShots);

    return () => {
      removeTimerTickListener?.();
      removeCameraSnapListener?.();
    };
  }, [saveVideoScreenShots]);

  // Focus and Blur detection - starts only when test is running
  useEffect(() => {
    if (!testRunning) return;

    function handleFocusLoss() {
      // Prevent multiple flags for the same focus loss
      if (isBlurredRef.current) return;
      isBlurredRef.current = true;

      setStrikes((prev) => {
        const nextStrikes = Math.min(prev + 1, 3);
        return nextStrikes;
      });

      setShowFocusModal(true);
    }

    function handleFocusGain() {
      // Window regained focus
    }

    window.addEventListener('blur', handleFocusLoss);
    window.addEventListener('focus', handleFocusGain);

    const removeMainBlur = window.athena?.onWindowBlur?.(handleFocusLoss);
    const removeMainFocus = window.athena?.onWindowFocus?.(handleFocusGain);

    return () => {
      window.removeEventListener('blur', handleFocusLoss);
      window.removeEventListener('focus', handleFocusGain);
      removeMainBlur?.();
      removeMainFocus?.();
    };
  }, [testRunning]);

  // Synchronize camera video feeds
  useEffect(() => {
    if (!testRunning && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [testRunning, cameraStream]);

  useEffect(() => {
    if (testRunning && pipVideoRef.current && cameraStream) {
      pipVideoRef.current.srcObject = cameraStream;
    }
  }, [testRunning, cameraStream]);

  const recordBlockedAction = useCallback((actionName) => {
    const timeStr = new Date().toLocaleTimeString();
    const id = Date.now() + Math.random();
    setBlockedAlert({
      id,
      action: actionName,
      message: `${actionName} is strictly prohibited during the exam. OS clipboard wiped.`,
      type: 'danger'
    });
    setBlockedLog((prev) => [
      { id, time: timeStr, action: actionName },
      ...prev.slice(0, 8)
    ]);
    window.athena?.clearClipboard?.();
  }, []);

  // Listen for blocked events from main process (Electron before-input-event)
  useEffect(() => {
    if (!testRunning) return;

    const removeBlockedListener = window.athena?.onClipboardBlocked?.((data) => {
      recordBlockedAction(data?.action ? `${data.action} (Shortcut)` : 'Clipboard Shortcut');
    });

    return () => {
      removeBlockedListener?.();
    };
  }, [testRunning, recordBlockedAction]);

  // DOM-level event interception for copy, cut, paste, contextmenu, drag/drop, keydown
  useEffect(() => {
    if (!testRunning) return;

    function handleCopy(e) {
      e.preventDefault();
      recordBlockedAction('Copy (Event)');
    }

    function handleCut(e) {
      e.preventDefault();
      recordBlockedAction('Cut (Event)');
    }

    function handlePaste(e) {
      e.preventDefault();
      recordBlockedAction('Paste (Event)');
    }

    function handleContextMenu(e) {
      e.preventDefault();
      recordBlockedAction('Right-Click Context Menu');
    }

    function handleDragOver(e) {
      e.preventDefault();
    }

    function handleDrop(e) {
      e.preventDefault();
      recordBlockedAction('Drag & Drop Content');
    }

    function handleKeyDown(e) {
      const modifier = e.metaKey || e.ctrlKey;
      const key = (e.key || '').toLowerCase();

      if ((modifier && key === 'c') || (e.ctrlKey && e.key === 'Insert')) {
        e.preventDefault();
        e.stopPropagation();
        recordBlockedAction('Copy (Cmd/Ctrl+C)');
      } else if ((modifier && key === 'v') || (e.shiftKey && e.key === 'Insert')) {
        e.preventDefault();
        e.stopPropagation();
        recordBlockedAction('Paste (Cmd/Ctrl+V)');
      } else if ((modifier && key === 'x') || (e.shiftKey && e.key === 'Delete')) {
        e.preventDefault();
        e.stopPropagation();
        recordBlockedAction('Cut (Cmd/Ctrl+X)');
      }
    }

    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragover', handleDragOver, true);
    document.addEventListener('drop', handleDrop, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('dragover', handleDragOver, true);
      document.removeEventListener('drop', handleDrop, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [testRunning, recordBlockedAction]);

  // Auto-dismiss alert toast after 3.5s
  useEffect(() => {
    if (blockedAlert) {
      const timerId = setTimeout(() => {
        setBlockedAlert(null);
      }, 3500);
      return () => clearTimeout(timerId);
    }
  }, [blockedAlert]);



  async function selectCameraDirectory() {
    try {
      const selected = await window.athena?.selectDirectory?.(cameraDirRef.current || undefined);
      if (selected) {
        setCameraDir(selected);
        cameraDirRef.current = selected;
        await window.athena?.setCameraDirectory?.(selected);
      }
    } catch (error) {
      console.error("Error selecting camera directory:", error);
    }
  }

  async function selectScreenDirectory() {
    try {
      const selected = await window.athena?.selectDirectory?.(screenDirRef.current || undefined);
      if (selected) {
        setScreenDir(selected);
        screenDirRef.current = selected;
        await window.athena?.setScreenDirectory?.(selected);
      }
    } catch (error) {
      console.error("Error selecting screen directory:", error);
    }
  }

  async function getCameraAccess() {
    try {
      const videoData = await navigator.mediaDevices.getUserMedia({
        video: true
      });

      cameraStreamRef.current = videoData;
      setCameraStream(videoData);
      setCameraEnabled(true);
      if (videoRef.current) {
        videoRef.current.srcObject = videoData;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert('Cannot access Camera');
    }
  }

  async function enableFullScreen() {
    try {
      if (window.athena?.setKiosk) {
        await window.athena.setKiosk(true);
      } else {
        await document.documentElement.requestFullscreen();
      }
      setFullScreen(true);
    } catch (error) {
      console.error("Error requesting fullscreen:", error);
      alert('Cannot access full screen');
    }
  }

  async function handleStartTest() {
    try {
      // 1. Wipe OS clipboard immediately upon going to test
      await window.athena?.clearClipboard?.();
      // 2. Set test active in main process (sets restricted menu & before-input-event shortcut blocker)
      await window.athena?.setTestActive?.(true);
      // 3. Start timer
      await window.athena?.startTimerOnMain?.();

      setStrikes(0);
      setShowFocusModal(false);
      setExitNotice('');
      isBlurredRef.current = false;
      setBlockedLog([]);
      setBlockedAlert({
        id: Date.now(),
        action: 'Lockdown Initialized',
        message: 'OS clipboard wiped clean upon test entry. Anti-cheating protections engaged.',
        type: 'info'
      });
      setTestRunning(true);
    } catch (error) {
      console.error("Error starting test:", error);
    }
  }

  async function handleEndTest(reason = '') {
    try {
      await window.athena?.setTestActive?.(false);
      await window.athena?.stopTimerOnMain?.();
    } catch (error) {
      console.error("Error stopping test:", error);
    }
    setTestRunning(false);
    setTimer('');
    setShowFocusModal(false);
    isBlurredRef.current = false;
    setBlockedAlert(null);
    if (reason) {
      setExitNotice(reason);
    }
  }

  function handleContinueAfterFocus() {
    if (strikes >= 3) {
      handleEndTest('You reached the maximum of 3 focus-loss strikes. The exam has ended.');
    } else {
      setShowFocusModal(false);
      isBlurredRef.current = false;
    }
  }

  // ==========================================
  // ASSESSMENT / TEST RUNNING SCREEN (Full Screen)
  // ==========================================
  if (testRunning) {
    return (
      <div className="assessment-screen">
        {/* Minimal Toast Alert */}
        {blockedAlert && (
          <div className={`clean-toast ${blockedAlert.type}`}>
            <span>{blockedAlert.type === 'danger' ? '🚫' : '🛡️'}</span>
            <span>{blockedAlert.message}</span>
          </div>
        )}

        {/* Top Sticky Navigation Bar */}
        <header className="assessment-nav">
          <div className="assessment-meta">
            <span className="assessment-title">Computer Systems & Architecture Assessment</span>
            <span className="assessment-candidate">Candidate #3842 • Section A</span>
          </div>

          <div className="assessment-nav-center">
            <div className="timer-pill" title="Elapsed Time">
              <span>⏱</span>
              <span>{formatTime(timer)}</span>
            </div>

            <div
              className={`strike-counter-pill ${strikes > 0 ? 'has-strikes' : ''}`}
              title="Focus loss strikes (max 3)"
            >
              <span>Strikes:</span>
              <strong>{strikes}/3</strong>
            </div>
          </div>

          <div className="assessment-nav-right">
            {/* Renamed "open rules" button to "Test Strikes" */}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => window.athena?.showRules?.()}
              title="Triggers a native dialog which causes window blur to test strike increment"
            >
              Test Strikes
            </button>

            {/* Compact Webcam PiP */}
            {cameraEnabled && (
              <div className="pip-preview-box" title="Live proctoring webcam active">
                <video
                  ref={pipVideoRef}
                  autoPlay
                  playsInline
                  muted
                />
                <span className="pip-status-dot">● LIVE</span>
              </div>
            )}

            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => handleEndTest()}
            >
              End Test
            </button>
          </div>
        </header>

        {/* Clean Single-Line Proctoring Notice */}
        <div className="proctoring-notice-strip">
          <span className="proctoring-notice-dot"></span>
          <span>Proctoring Active — OS Clipboard cleared. Cut, copy, paste, context menu, and window switching are disabled.</span>
        </div>

        {/* Full-Screen Widescreen Assessment Layout */}
        <main className="assessment-body">
          {/* Main Questions Column */}
          <section className="questions-col">
            {/* Question 1: Code & Essay */}
            <article className="question-card">
              <div className="question-card-top">
                <span className="question-badge">Question 1</span>
                <span className="question-points">20 Marks</span>
              </div>

              <p className="question-prompt">
                Explain the difference in execution scheduling between <strong>Microtasks</strong> (e.g., <code>Promise.then</code>, <code>queueMicrotask</code>) and <strong>Macrotasks</strong> (e.g., <code>setTimeout</code>) in the JavaScript runtime. What is the output order of the following snippet?
              </p>

              <pre className="clean-code-block">
{`console.log('1: Start');
setTimeout(() => console.log('2: Timeout'), 0);
Promise.resolve().then(() => console.log('3: Promise'));
queueMicrotask(() => console.log('4: Microtask'));
console.log('5: End');`}
              </pre>

              <div className="clean-answer-wrapper">
                <div className="clean-answer-meta">
                  <span><strong>Candidate Answer</strong> (Type response below)</span>
                  <span>
                    {essayAnswer.trim() ? essayAnswer.trim().split(/\s+/).length : 0} words | {essayAnswer.length} characters
                  </span>
                </div>
                <textarea
                  className="clean-textarea"
                  rows={8}
                  value={essayAnswer}
                  onChange={(e) => setEssayAnswer(e.target.value)}
                  placeholder="Type your explanation and code response here...
(Try selecting text and pressing Cmd+C, or pressing Cmd+V to paste, or right-clicking to verify protection)"
                />
              </div>
            </article>

            {/* Question 2: Short Answer */}
            <article className="question-card">
              <div className="question-card-top">
                <span className="question-badge">Question 2</span>
                <span className="question-points">10 Marks</span>
              </div>

              <p className="question-prompt">
                Which native JavaScript API function directly queues a microtask onto the microtask queue without using Promises?
              </p>

              <input
                type="text"
                className="clean-input"
                value={shortAnswer}
                onChange={(e) => setShortAnswer(e.target.value)}
                placeholder="Type short answer here (e.g. queueMicrotask)..."
              />
            </article>
          </section>

          {/* Clean Sidebar Column */}
          <aside className="sidebar-col">
            {/* Enforced Policies Card */}
            <div className="sidebar-card">
              <h3 className="sidebar-title">Active Protections</h3>
              <div className="sidebar-list">
                <div className="sidebar-list-item">
                  <span>OS Clipboard</span>
                  <span className="badge-mini active">Cleared & Locked</span>
                </div>
                <div className="sidebar-list-item">
                  <span>Copy / Cut / Paste</span>
                  <span className="badge-mini active">Intercepted</span>
                </div>
                <div className="sidebar-list-item">
                  <span>Right-Click Menu</span>
                  <span className="badge-mini active">Suppressed</span>
                </div>
                <div className="sidebar-list-item">
                  <span>Focus Loss Limit</span>
                  <span className="badge-mini">3 Strikes Max</span>
                </div>
              </div>

              <div className="sidebar-dirs">
                <div>Camera Snaps: <code>{cameraDir ? (cameraDir.split('/').pop() || cameraDir) : 'user-camera-snap'}</code></div>
                <div style={{ marginTop: '4px' }}>Screen Snaps: <code>{screenDir ? (screenDir.split('/').pop() || screenDir) : 'user-screen-snap'}</code></div>
              </div>
            </div>

            {/* Clean Interception Log Feed */}
            <div className="sidebar-card">
              <div className="sidebar-title">
                <span>Interception Log</span>
                {blockedLog.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBlockedLog([])}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="clean-log-feed">
                {blockedLog.length === 0 ? (
                  <div className="clean-log-empty">
                    No unauthorized actions recorded. Copy & paste attempts will appear here.
                  </div>
                ) : (
                  blockedLog.map((item) => (
                    <div key={item.id} className="clean-log-item">
                      <strong>[{item.time}]</strong> Blocked {item.action}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </main>

        {/* Focus Loss Dialogue Modal */}
        {showFocusModal && (
          <div className="modal-overlay">
            <div className="modal-card">
              <div className={`modal-icon-wrapper ${strikes >= 3 ? 'modal-icon-danger' : 'modal-icon-warning'}`}>
                {strikes >= 3 ? '🚨' : '⚠️'}
              </div>

              <h3 className="modal-title">
                {strikes >= 3 ? 'Exam Terminated' : 'Warning: Focus Lost!'}
              </h3>

              <p className="modal-description">
                {strikes >= 3
                  ? 'You have lost focus 3 times and reached the maximum allowed strikes. The exam will now end.'
                  : 'Please return to the test screen. Stay on the exam screen to avoid disqualification. Your strike count was increased by 1.'}
              </p>

              {/* Strikes indicator */}
              <div className="strikes-container">
                <span className={`strike-pill ${strikes >= 1 ? 'active' : ''}`}>
                  {strikes >= 1 ? '✕' : '○'} Strike 1
                </span>
                <span className={`strike-pill ${strikes >= 2 ? 'active' : ''}`}>
                  {strikes >= 2 ? '✕' : '○'} Strike 2
                </span>
                <span className={`strike-pill ${strikes >= 3 ? 'active' : ''}`}>
                  {strikes >= 3 ? '✕' : '○'} Strike 3 (Max)
                </span>
              </div>

              {/* Live Timer badge inside modal */}
              <div className="modal-timer-badge">
                ⏱️ Timer running: <strong>{formatTime(timer)}</strong> ({timer || 0}s elapsed)
              </div>

              <div>
                {strikes >= 3 ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleEndTest('You reached the maximum of 3 focus-loss strikes. The exam has ended.')}
                  >
                    Exit Test
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleContinueAfterFocus}
                  >
                    Continue Test
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // SETUP / PERMISSIONS SCREEN (Full Screen)
  // ==========================================
  return (
    <div className="setup-screen">
      {/* Setup Top Navigation */}
      <header className="setup-topbar">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="setup-brand-title">Athena Assessment Platform</span>
          <span className="setup-brand-subtitle">Pre-Exam Readiness Check</span>
        </div>
      </header>

      <main className="setup-content">
        {/* Alert banner if test was ended due to 3 strikes */}
        {exitNotice && (
          <div className="alert-banner">
            <span>⚠️ {exitNotice}</span>
            <button
              type="button"
              onClick={() => setExitNotice('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#991b1b' }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="setup-heading-group">
          <h1>System Verification</h1>
          <p>Please configure your camera, full-screen permissions, and storage directories before beginning the exam.</p>
        </div>

        {/* 3-Card Modern Grid */}
        <div className="setup-grid">
          {/* Card 1: Camera */}
          <div className="setup-card">
            <div>
              <div className="setup-card-header">
                <span className="setup-card-title">Webcam Proctoring</span>
                <span className={`status-tag ${cameraEnabled ? 'ready' : 'pending'}`}>
                  {cameraEnabled ? 'Connected ✓' : 'Required'}
                </span>
              </div>
              <p className="setup-card-desc">
                Your webcam will be monitored and periodically captured throughout the exam.
              </p>

              {cameraEnabled ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="setup-video-preview"
                />
              ) : (
                <div className="setup-video-placeholder">
                  Camera not configured yet
                </div>
              )}
            </div>

            <button
              type="button"
              className={`btn ${cameraEnabled ? 'btn-outline' : 'btn-primary'}`}
              disabled={cameraEnabled}
              onClick={getCameraAccess}
            >
              {cameraEnabled ? 'Camera Connected ✓' : 'Connect Camera'}
            </button>
          </div>

          {/* Card 2: Full Screen Kiosk */}
          <div className="setup-card">
            <div>
              <div className="setup-card-header">
                <span className="setup-card-title">Full Screen Lock</span>
                <span className={`status-tag ${fullScreen ? 'ready' : 'pending'}`}>
                  {fullScreen ? 'Enabled ✓' : 'Required'}
                </span>
              </div>
              <p className="setup-card-desc">
                Enables locked full-screen mode to ensure an isolated assessment environment without distractions or external application access.
              </p>
            </div>

            <button
              type="button"
              className={`btn ${fullScreen ? 'btn-outline' : 'btn-primary'}`}
              disabled={fullScreen}
              onClick={enableFullScreen}
            >
              {fullScreen ? 'Full Screen Enabled ✓' : 'Enable Full Screen'}
            </button>
          </div>

          {/* Card 3: Storage Directories */}
          <div className="setup-card">
            <div>
              <div className="setup-card-header">
                <span className="setup-card-title">Snapshot Storage</span>
                <span className="status-tag ready">Configured</span>
              </div>
              <p className="setup-card-desc">
                Select custom directories on disk where your periodic camera and screen snapshots are saved.
              </p>

              <div className="setup-dir-item">
                <div>
                  <div className="setup-dir-label">Camera Snaps</div>
                  <div className="setup-dir-path" title={cameraDir}>{cameraDir || 'Loading default...'}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={selectCameraDirectory}
                >
                  Change
                </button>
              </div>

              <div className="setup-dir-item">
                <div>
                  <div className="setup-dir-label">Screen Snaps</div>
                  <div className="setup-dir-path" title={screenDir}>{screenDir || 'Loading default...'}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={selectScreenDirectory}
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Setup Footer Action Bar */}
        <footer className="setup-footer-bar">
          <div className="setup-footer-status">
            {!cameraEnabled || !fullScreen
              ? 'Complete Camera and Full Screen permissions above to start.'
              : 'All system checks verified. You are ready to enter the assessment.'}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-large"
            disabled={!cameraEnabled || !fullScreen}
            onClick={handleStartTest}
          >
            Go To Test →
          </button>
        </footer>
      </main>
    </div>
  );
}

export default App