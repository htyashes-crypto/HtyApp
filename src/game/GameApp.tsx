import { useEffect, useRef, useState } from "react";

const GAME_URL = "./game/embed.html";

export function GameApp() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Cleanup WebGL context when unmounting (switching tabs)
  useEffect(() => {
    return () => {
      // Force iframe to release GPU resources on unmount
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
    };
  }, []);

  return (
    <div className="game-app">
      {!loaded && (
        <div className="game-app__loading">
          <span>Loading game...</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="game-app__iframe"
        src={GAME_URL}
        onLoad={() => setLoaded(true)}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
