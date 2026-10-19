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

  // ref variables
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);


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
      setTestRunning(true);
    } catch (error) {
      console.error("Error starting test:", error);
    }
  }

  async function handleEndTest() {
    try {
      await window.athena?.stopTimerOnMain?.();
    } catch (error) {
      console.error("Error stopping test:", error);
    }
    setTestRunning(false);
    setTimer('');
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
            <div className="proctor-badge">
              <span className="pulsing-dot"></span>
              Proctoring Active
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
              onClick={handleEndTest}
            >
              End Test
            </button>
          </div>
        </div>

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