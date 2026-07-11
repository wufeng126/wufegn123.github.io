import { useState, useEffect, useRef } from 'react'
import './App.css'

// 目标网页地址
const WEB_URL = 'https://d6e3bb20-c45b-47c4-94ab-82634f5db024.dev.coze.site/';

function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // 监听 iframe 加载完成
    const handleLoad = () => {
      setLoading(false);
    };

    const handleError = () => {
      setError('页面加载失败，请检查网络连接');
      setLoading(false);
    };

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);
    }

    return () => {
      if (iframe) {
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      }
    };
  }, []);

  // 重试加载
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = WEB_URL;
    }
  };

  return (
    <div className="app-container">
      {/* 加载状态 */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="spinner"></div>
            <p>正在加载应用...</p>
          </div>
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="error-overlay">
          <div className="error-content">
            <div className="error-icon">⚠️</div>
            <p className="error-message">{error}</p>
            <button className="retry-button" onClick={handleRetry}>
              重试
            </button>
          </div>
        </div>
      )}

      {/* WebView iframe */}
      <iframe
        ref={iframeRef}
        src={WEB_URL}
        className="webview-iframe"
        title="建筑劳务管理系统"
        allow="geolocation; microphone; camera; midi; encrypted-media"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation"
      />
    </div>
  );
}

export default App
