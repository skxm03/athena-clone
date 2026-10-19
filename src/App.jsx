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
  const cameraStreamRef = useRef(null);
  const isBlurredRef = useRef(false);
  const cameraDirRef = useRef('');
  const screenDirRef = useRef('');


  useEffect(() => {
    // Check initial kiosk mode status
    window.athena?.isKiosk?.().then((kiosk) => {
      if (kiosk) {
        setFullScreen(true);
      }
    });

    // Fetch initial snapshot directories
    window.athena?.getDirectories?.().then((dirs) => {
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
  }, []);

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

  // Re-attach camera feed if returning to setup screen
  useEffect(() => {
    if (!testRunning && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [testRunning]);

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

  async function saveVideoScreenShots() {
    const stream = cameraStreamRef.current || videoRef.current?.srcObject;
    if (!stream) {
      return;
    }

    try {
      const track = stream.getVideoTracks()[0];
      if (!track) return;

      // Use ImageCapture API
      const imageCapture = new ImageCapture(track);
      const blob = await imageCapture.takePhoto();
      const arrayBuffer = await blob.arrayBuffer();

      // Send raw binary buffer to main process with custom directory
      window.athena?.storeCameraSnapImageOnDisk?.(arrayBuffer, cameraDirRef.current || undefined);
    } catch (error) {
      console.error("Failed to capture image via ImageCapture:", error);
    }
  }

  async function saveScreenSnap() {
    try {
      await window.athena?.captureScreenSnap?.(screenDirRef.current || undefined);
    } catch (error) {
      console.error("Failed to capture screen via desktopCapturer:", error);
    }
  }

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
      if (videoRef.current) {
        videoRef.current.srcObject = videoData;
      }
      setCameraEnabled(true);
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

  function simulateManualWipe() {
    window.athena?.clearClipboard?.();
    setBlockedAlert({
      id: Date.now(),
      action: 'Clipboard Flushed',
      message: 'System clipboard flushed and cleared.',
      type: 'info'
    });
  }

  function handleContinueAfterFocus() {
    if (strikes >= 3) {
      handleEndTest('You reached the maximum of 3 focus-loss strikes. The exam has ended.');
    } else {
      setShowFocusModal(false);
      isBlurredRef.current = false;
    }
  }


  if (testRunning) {
    return (
      <div className="page-container" style={{ maxWidth: '960px' }}>
        {/* Floating Anti-Cheat Toast */}
        {blockedAlert && (
          <div className={`anti-cheat-toast ${blockedAlert.type}`}>
            <div className="toast-icon">{blockedAlert.type === 'danger' ? '🚫' : '🛡️'}</div>
            <div className="toast-content">
              <strong>{blockedAlert.type === 'danger' ? 'Anti-Cheating Security Alert' : 'Assessment Environment'}</strong>
              <p>{blockedAlert.message}</p>
            </div>
            <button className="toast-close" onClick={() => setBlockedAlert(null)}>×</button>
          </div>
        )}

        <div className="mock-test-card">
          {/* Header Bar */}
          <div className="mock-test-header">
            <div className="mock-header-info">
              <h2>Computer Systems & Architecture Assessment</h2>
              <p>Section 1: Asynchronous Execution & Event Loop • Candidate #3842</p>
            </div>

            <div className="mock-header-controls">
              {/* Live Timer */}
              <div className="test-timer-badge">
                <span className="timer-val">{formatTime(timer)}</span>
                <span className="timer-caption">Time Elapsed</span>
              </div>

              {/* Strikes Counter */}
              <div
                className="proctor-badge"
                style={strikes > 0 ? { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' } : {}}
              >
                Strikes: {strikes}/3
              </div>

              {/* Active Picture-in-Picture Webcam */}
              {cameraStreamRef.current && (
                <div className="pip-camera-box" title="Live proctoring webcam feed">
                  <video
                    ref={(el) => {
                      if (el && cameraStreamRef.current && el.srcObject !== cameraStreamRef.current) {
                        el.srcObject = cameraStreamRef.current;
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="pip-video"
                  />
                  <span className="pip-tag">● LIVE</span>
                </div>
              )}

              {/* End / Submit Test Button */}
              <button
                className="btn btn-danger"
                onClick={() => handleEndTest()}
              >
                End Test
              </button>
            </div>
          </div>

          {/* Security Status Banner */}
          <div className="security-status-banner">
            <span className="security-banner-icon">🛡️</span>
            <div className="security-banner-content">
              <strong>Proctoring Lockdown Active:</strong> OS Clipboard was wiped on test start. Cut, Copy, Paste (Keyboard shortcuts & Context menu), and text drag-and-drop are strictly blocked.
            </div>
            <span className="security-pill">PROTECTION ACTIVE</span>
          </div>

          {/* Mock Test Questions Workspace */}
          <div className="mock-question-section">
            {/* Question 1: Long Answer / Essay with Code Snippet */}
            <div className="question-block">
              <div className="question-header">
                <span className="question-num">Question 1</span>
                <span className="question-marks">20 Marks</span>
              </div>
              <p className="question-text">
                Explain the difference in execution scheduling between <strong>Microtasks</strong> (e.g., <code>Promise.then</code>, <code>queueMicrotask</code>) and <strong>Macrotasks</strong> (e.g., <code>setTimeout</code>) in the JavaScript runtime. What is the output order of the following snippet?
              </p>

              <div className="code-snippet-hint">💡 Try selecting the snippet below and pressing Cmd+C or Ctrl+C to test copy blocking:</div>
              <pre className="code-snippet-box">
{`console.log('1: Start');
setTimeout(() => console.log('2: Timeout'), 0);
Promise.resolve().then(() => console.log('3: Promise'));
queueMicrotask(() => console.log('4: Microtask'));
console.log('5: End');`}
              </pre>

              <div className="editor-wrapper">
                <div className="editor-meta">
                  <span><strong>Candidate Answer Workspace</strong> (Type freely to test input)</span>
                  <span>
                    {essayAnswer.trim() ? essayAnswer.trim().split(/\s+/).length : 0} words | {essayAnswer.length} chars
                  </span>
                </div>
                <textarea
                  className="mock-textarea"
                  rows={6}
                  value={essayAnswer}
                  onChange={(e) => setEssayAnswer(e.target.value)}
                  placeholder="Type your explanation and code response here...
- Try selecting your text and pressing Cmd+C / Ctrl+C
- Try pressing Cmd+V / Ctrl+V to paste
- Try pressing Cmd+X / Ctrl+X to cut
- Try right-clicking for context menu"
                />
              </div>
            </div>

            {/* Question 2: Short Answer Input */}
            <div className="question-block">
              <div className="question-header">
                <span className="question-num">Question 2</span>
                <span className="question-marks">10 Marks</span>
              </div>
              <p className="question-text">
                Which native JavaScript API function directly queues a microtask onto the microtask queue without using Promises?
              </p>
              <input
                type="text"
                className="mock-input"
                value={shortAnswer}
                onChange={(e) => setShortAnswer(e.target.value)}
                placeholder="Type short answer here (e.g., queueMicrotask)... Try Cmd+C, Cmd+V, or Cut"
              />
            </div>

            {/* Interactive Anti-Cheating Verification & Sandbox Panel */}
            <div className="verification-panel">
              <div className="verification-title">
                <span>🧪</span>
                <span>Anti-Cheating Verification Sandbox</span>
              </div>
              <p className="verification-desc">
                Verify that your system protections are actively intercepting unauthorized operations and not merely cosmetic:
              </p>

              <div className="protection-chips-grid">
                <div className="protection-chip">
                  <span>System Clipboard</span>
                  <span className="status-badge cleared">WIPED ✅</span>
                </div>
                <div className="protection-chip">
                  <span>Copy (Cmd/Ctrl+C)</span>
                  <span className="status-badge">BLOCKED 🔒</span>
                </div>
                <div className="protection-chip">
                  <span>Paste (Cmd/Ctrl+V)</span>
                  <span className="status-badge">BLOCKED 🔒</span>
                </div>
                <div className="protection-chip">
                  <span>Cut (Cmd/Ctrl+X)</span>
                  <span className="status-badge">BLOCKED 🔒</span>
                </div>
                <div className="protection-chip">
                  <span>Right-Click Menu</span>
                  <span className="status-badge">BLOCKED 🔒</span>
                </div>
                <div className="protection-chip">
                  <span>Drag-and-Drop</span>
                  <span className="status-badge">BLOCKED 🔒</span>
                </div>
              </div>

              <div className="sim-btn-row">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => recordBlockedAction('Simulated Copy')}
                >
                  Test Copy Interception
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => recordBlockedAction('Simulated Paste')}
                >
                  Test Paste Interception
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => recordBlockedAction('Simulated Cut')}
                >
                  Test Cut Interception
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={simulateManualWipe}
                >
                  Re-Wipe Clipboard Now
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => saveVideoScreenShots()}
                >
                  Capture Camera Snap
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => saveScreenSnap()}
                >
                  Capture Screen Snap
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => window.athena?.showRules?.()}
                >
                  Show Native Rules
                </button>
              </div>

              {/* Live Interception Console Feed */}
              <div className="audit-terminal">
                <div style={{ color: '#94a3b8', marginBottom: '6px', fontSize: '11px' }}>
                  ── LIVE SECURITY INTERCEPTION LOG ──
                </div>
                {blockedLog.length === 0 ? (
                  <div className="audit-empty">
                    No violations detected yet. Try typing above, or test pressing Cmd+C, Cmd+V, Cmd+X, or Right-Clicking.
                  </div>
                ) : (
                  blockedLog.map((item) => (
                    <div key={item.id} className="audit-entry">
                      <span className="audit-time">[{item.time}]</span>
                      <span className="audit-msg">🚫 INTERCEPTED: {item.action} blocked & OS clipboard purged</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Snapshot Storage Footer Indicator */}
          <div style={{ marginTop: '20px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
            <span>Camera snaps: <code style={{ color: '#475569' }}>{cameraDir ? (cameraDir.split('/').pop() || cameraDir) : 'user-camera-snap'}</code> | Screen snaps: <code style={{ color: '#475569' }}>{screenDir ? (screenDir.split('/').pop() || screenDir) : 'user-screen-snap'}</code></span>
          </div>
        </div>

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

              {/* Live Timer badge inside modal (Timer continues running) */}
              <div className="modal-timer-badge">
                ⏱️ Timer continuing: <strong>{formatTime(timer)}</strong> ({timer || 0}s elapsed)
              </div>

              <div>
                {strikes >= 3 ? (
                  <button
                    className="btn btn-danger"
                    onClick={() => handleEndTest('You reached the maximum of 3 focus-loss strikes. The exam has ended.')}
                  >
                    Exit Test
                  </button>
                ) : (
                  <button
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


  return (
    <div className="page-container">
      {/* Alert banner if test was ended due to 3 strikes */}
      {exitNotice && (
        <div className="alert-banner">
          <span>⚠️ {exitNotice}</span>
          <button
            onClick={() => setExitNotice('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#991b1b' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Card */}
      <div className="card-container">
        {/* Section 1: Camera / Heimdall */}
        <div className="permission-item">
          <div className="permission-content">
            <h3>Configure Camera</h3>
            <p>Kindly configure Camera to attempt quiz/contests.</p>
            <div className="action-row">
              <button
                className="btn btn-black"
                disabled={cameraEnabled}
                onClick={getCameraAccess}
              >
                {cameraEnabled ? 'Camera Connected' : 'Get Camera Access'}
              </button>

              {/* Hidden/Active Video Feed Preview */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`video-preview`}
              />
            </div>
          </div>
        </div>

        <div className="divider"></div>

        {/* Section 2: Fullscreen */}
        <div className="permission-item">
          <div className="permission-content">
            <h3>Switch to full screen</h3>
            <button
              className="btn btn-primary"
              disabled={fullScreen}
              onClick={() => {
                enableFullScreen();
              }}
            >
              {fullScreen ? 'Full Screen Enabled' : 'Give Full Screen Permissions'}
            </button>
          </div>
        </div>

        <div className="divider"></div>

        {/* Section 3: Snapshot Storage Directories */}
        <div className="permission-item">
          <div className="permission-content" style={{ width: '100%' }}>
            <h3>Snapshot Storage Directories</h3>
            <p>Select where your camera and screen snapshots will be saved.</p>
            <div className="storage-config-grid">
              <div className="storage-config-item">
                <div className="storage-label-group">
                  <span className="storage-title">Camera Snaps Folder</span>
                  <span className="storage-path" title={cameraDir}>{cameraDir || 'Loading default directory...'}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={selectCameraDirectory}
                >
                  Change Directory
                </button>
              </div>

              <div className="storage-config-item">
                <div className="storage-label-group">
                  <span className="storage-title">Screen Snaps Folder</span>
                  <span className="storage-path" title={screenDir}>{screenDir || 'Loading default directory...'}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={selectScreenDirectory}
                >
                  Change Directory
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="bottom-actions">
        <button
          className="btn btn-primary"
          disabled={!cameraEnabled || !fullScreen}
          onClick={handleStartTest}
        >
          Go To Test
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button onClick={() => {
          saveVideoScreenShots()
        }}>
          saveVideoScreenShots
        </button>

        <button onClick={() => {
          saveScreenSnap()
        }}>
          saveScreenSnap
        </button>
      </div>


      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button onClick={() => {
          window.athena?.showRules?.()
        }}>
          Show Native Rules
        </button>

        <button onClick={() => { alert("Rules ...") }}>
          Show Chromium Rules
        </button>
      </div>

    </div>
  );
}

export default App