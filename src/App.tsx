import { useEffect, useRef, useState } from 'react';
import './App.css';

declare global {
  interface Window {
    Holistic: any;
    Camera: any;
    POSE_CONNECTIONS: any;
    drawConnectors: any;
    drawLandmarks: any;
  }
}

interface Point {
  x: number;
  y: number;
  radius: number;
  id: number;
  color: string;
  points: number;
}

const GameScreen = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameActive, setGameActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const pointIdRef = useRef(0);
  const holisticRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 480 });
  const timerRef = useRef<NodeJS.Timeout>();

  // Цвета точек
  const pointColors = [
    { color: '#FF5252', points: 1, radius: 20 },
    { color: '#FFEB3B', points: 3, radius: 25 },
    { color: '#4CAF50', points: 5, radius: 15 },
    { color: '#2196F3', points: 2, radius: 22 }
  ];

  // Генерация точки
  const generateNewPoint = () => {
    pointIdRef.current += 1;
    const type = pointColors[Math.floor(Math.random() * pointColors.length)];
    return {
      x: Math.random() * (canvasSize.width - type.radius * 2) + type.radius,
      y: Math.random() * (canvasSize.height - type.radius * 2) + type.radius,
      radius: type.radius,
      color: type.color,
      points: type.points,
      id: pointIdRef.current
    };
  };

  // Инициализация точек
  const initializePoints = () => {
    setPoints(Array.from({ length: 5 }, () => generateNewPoint()));
  };

  // Таймер (исправленная версия)
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Проверка столкновений
  const checkCollisions = (landmarks: any[]) => {
    if (!landmarks || !canvasRef.current) return;

    setPoints(prev => {
      const newPoints = [...prev];
      const wrist = landmarks[15] || landmarks[16];

      if (wrist) {
        const wristX = wrist.x * canvasRef.current!.width;
        const wristY = wrist.y * canvasRef.current!.height;

        for (let i = newPoints.length - 1; i >= 0; i--) {
          const p = newPoints[i];
          const dist = Math.sqrt(Math.pow(wristX - p.x, 2) + Math.pow(wristY - p.y, 2));
          if (dist < p.radius + 30) {
            setScore(s => s + p.points);
            newPoints.splice(i, 1);
          }
        }

        while (newPoints.length < 5 + Math.floor(score / 20)) {
          newPoints.push(generateNewPoint());
        }
      }

      return newPoints;
    });
  };

  // Отрисовка
  const drawFrame = (results: any) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = videoRef.current;

    if (!canvas || !ctx || !video) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
      window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, { 
        color: '#00FF00', 
        lineWidth: 4 
      });
      window.drawLandmarks(ctx, results.poseLandmarks, { 
        color: '#FF0000', 
        radius: 4 
      });
      checkCollisions(results.poseLandmarks);
    }

    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 15;
      ctx.fill();
    });
  };

  // Инициализация камеры
  const initCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Ваш браузер не поддерживает камеру');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user' 
        } 
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCanvasSize({
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight
        });
        setCameraActive(true);
        return true;
      }
    } catch (error) {
      let message = 'Ошибка камеры';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          message = 'Разрешите доступ к камере в настройках браузера';
        } else if (error.name === 'NotFoundError') {
          message = 'Камера не найдена';
        } else {
          message = error.message;
        }
      }
      setCameraError(message);
      return false;
    }
  };

  // Загрузка скриптов
  const loadScript = (src: string) => {
    return new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Ошибка загрузки ${src}`));
      document.head.appendChild(script);
    });
  };

  // Инициализация игры
  const initGame = async () => {
    try {
      await Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5/holistic.js'),
        loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js'),
        loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js')
      ]);

      if (!(await initCamera())) return;

      holisticRef.current = new window.Holistic({
        locateFile: (file: string) => 
          `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5/${file}`
      });

      holisticRef.current.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      holisticRef.current.onResults(drawFrame);

      if (videoRef.current) {
        cameraRef.current = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (holisticRef.current) {
              await holisticRef.current.send({ image: videoRef.current! });
            }
          },
          width: canvasSize.width,
          height: canvasSize.height
        });
        await cameraRef.current.start();
      }

      initializePoints();
      setGameActive(true);
      startTimer();
    } catch (error) {
      console.error('Ошибка инициализации:', error);
      setCameraError('Ошибка загрузки игры');
    }
  };

  // Сброс игры
  const resetGame = () => {
    setScore(0);
    setTimeLeft(60);
    initializePoints();
    setGameActive(true);
    startTimer();
  };

  useEffect(() => {
    initGame();
    return () => {
      clearInterval(timerRef.current);
      holisticRef.current?.close();
      cameraRef.current?.stop();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100vh',
      backgroundColor: '#000',
      overflow: 'hidden',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Статистика */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 10,
        color: 'white',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: '15px',
        borderRadius: '10px',
        display: 'flex',
        gap: '20px'
      }}>
        <div>★ Очки: <b>{score}</b></div>
        <div>⏱ Время: <b>{timeLeft}</b> сек</div>
      </div>

      {/* Ошибка камеры */}
      {cameraError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: '40px',
          borderRadius: '15px',
          textAlign: 'center',
          color: 'white'
        }}>
          <h2 style={{ color: '#FF5252' }}>Ошибка</h2>
          <p style={{ margin: '20px 0' }}>{cameraError}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Обновить
          </button>
        </div>
      )}

      {/* Конец игры */}
      {!gameActive && !cameraError && timeLeft === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: '40px',
          borderRadius: '15px',
          textAlign: 'center',
          color: 'white'
        }}>
          <h2>Игра окончена!</h2>
          <p style={{ fontSize: '24px', margin: '20px 0' }}>
            Ваш счет: <b>{score}</b>
          </p>
          <button
            onClick={resetGame}
            style={{
              padding: '10px 20px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Играть снова
          </button>
        </div>
      )}

      {/* Видео и canvas */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
      />
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />
    </div>
  );
};

const App = () => {
  const [gameStarted, setGameStarted] = useState(false);

  if (gameStarted) {
    return <GameScreen />;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'white',
      flexDirection: 'column'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>
        Игра с отслеживанием тела
      </h1>
      <div style={{
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: '2rem',
        borderRadius: '15px',
        maxWidth: '800px',
        textAlign: 'center'
      }}>
        <button
          onClick={() => setGameStarted(true)}
          style={{
            padding: '15px 30px',
            fontSize: '1.2rem',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '30px',
            cursor: 'pointer'
          }}
        >
          Начать игру
        </button>
      </div>
    </div>
  );
};

export default App;