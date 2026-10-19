// App.jsx
import { useEffect, useRef, useState } from 'react'
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

  // ref variables
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const isBlurredRef = useRef(false);


  useEffect(() => {
    // Check initial kiosk mode status
    window.athena?.isKiosk?.().then((kiosk) => {
      if (kiosk) {
        setFullScreen(true);
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

      // Send raw binary buffer to main process
      window.athena?.storeCameraSnapImageOnDisk?.(arrayBuffer);
    } catch (error) {
      console.error("Failed to capture image via ImageCapture:", error);
    }
  }

  async function saveScreenSnap() {
    try {
      await window.athena?.captureScreenSnap?.();
    } catch (error) {
      console.error("Failed to capture screen via desktopCapturer:", error);
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
      await window.athena?.startTimerOnMain?.();
      setStrikes(0);
      setShowFocusModal(false);
      setExitNotice('');
      isBlurredRef.current = false;
      setTestRunning(true);
    } catch (error) {
      console.error("Error starting test:", error);
    }
  }

  async function handleEndTest(reason = '') {
    try {
      await window.athena?.stopTimerOnMain?.();
    } catch (error) {
      console.error("Error stopping test:", error);
    }
    setTestRunning(false);
    setTimer('');
    setShowFocusModal(false);
    isBlurredRef.current = false;
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


  if (testRunning) {
    return (
      <div className="page-container">
        <div className="test-running-card">
          <div className="test-running-header">
            <div>
              <h2 className="test-running-title">Assessment in Progress</h2>
              <p className="test-running-subtitle">Your camera and screen are currently being monitored.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="proctor-badge">
                <span className="pulsing-dot"></span>
                Proctoring Active
              </div>
              <div
                className="proctor-badge"
                style={strikes > 0 ? { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' } : {}}
              >
                Strikes: {strikes}/3
              </div>
            </div>
          </div>

          {/* Timer Display */}
          <div className="timer-box">
            <span className="timer-label">Time Elapsed</span>
            <span className="timer-display">{formatTime(timer)}</span>
            <span className="timer-subtext">
              {timer !== '' ? `${timer} seconds elapsed` : 'Starting test timer...'}
            </span>
          </div>

          {/* Active Proctoring Video Feed */}
          {cameraStreamRef.current && (
            <div className="test-running-camera-preview">
              <video
                ref={(el) => {
                  if (el && cameraStreamRef.current && el.srcObject !== cameraStreamRef.current) {
                    el.srcObject = cameraStreamRef.current;
                  }
                }}
                autoPlay
                playsInline
                muted
                className="video-preview"
              />
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              className="btn btn-danger"
              onClick={() => handleEndTest()}
            >
              End Test
            </button>
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

        {/* Manual Test Controls */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'center' }}>
          <button onClick={() => saveVideoScreenShots()}>
            saveVideoScreenShots
          </button>

          <button onClick={() => saveScreenSnap()}>
            saveScreenSnap
          </button>

          <button onClick={() => window.athena?.showRules?.()}>
            Show Native Rules
          </button>
        </div>
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