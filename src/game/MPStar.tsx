import { useEffect, useRef, useState } from 'react';

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
}

const POINT_RADIUS = 20;
const TARGET_CAMERA_WIDTH = 1920;
const TARGET_CAMERA_HEIGHT = 1680;

const MPStar = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const pointIdRef = useRef(0);
  const holisticRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const animationFrameRef = useRef<number>();

  // Генерация новой точки по всему экрану
  const generateNewPoint = () => {
    if (!canvasRef.current) return;
    
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    
    pointIdRef.current += 1;
    return {
      x: Math.random() * (width - POINT_RADIUS * 2) + POINT_RADIUS,
      y: Math.random() * (height - POINT_RADIUS * 2) + POINT_RADIUS,
      radius: POINT_RADIUS,
      id: pointIdRef.current
    };
  };

  // Проверка столкновений
  const checkCollisions = (landmarks: any[]) => {
    if (!landmarks || !canvasRef.current) return;

    setPoints(prevPoints => {
      const newPoints = [...prevPoints];
      const wristLandmark = landmarks[15] || landmarks[16];

      if (wristLandmark) {
        const wristX = wristLandmark.x * canvasRef.current!.width;
        const wristY = wristLandmark.y * canvasRef.current!.height;

        for (let i = newPoints.length - 1; i >= 0; i--) {
          const point = newPoints[i];
          const distance = Math.sqrt(
            Math.pow(wristX - point.x, 2) + Math.pow(wristY - point.y, 2)
          );

          if (distance < point.radius + 30) {
            newPoints.splice(i, 1);
          }
        }

        // Добавляем новые точки если их меньше 3
        while (newPoints.length < 3) {
          const newPoint = generateNewPoint();
          if (newPoint) newPoints.push(newPoint);
        }
      }

      return newPoints;
    });
  };

  // Основная игровая логика
  useEffect(() => {
    const loadScripts = async () => {
      try {
        // Загрузка скриптов MediaPipe
        const loadScript = (src: string) => {
          return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        };

        await Promise.all([
          loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5/holistic.js'),
          loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js'),
          loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js')
        ]);

        // Инициализация Holistic
        holisticRef.current = new window.Holistic({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5/${file}`
        });

        holisticRef.current.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5
        });

        // Обработка результатов
        holisticRef.current.onResults((results: any) => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          const video = videoRef.current;

          if (!canvas || !ctx || !video) return;

          // Установка размеров canvas
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Очистка и отрисовка видео
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Отрисовка скелета
          if (results.poseLandmarks) {
            window.drawConnectors(
              ctx, 
              results.poseLandmarks, 
              window.POSE_CONNECTIONS, 
              { color: '#00FF00', lineWidth: 4 }
            );
            window.drawLandmarks(
              ctx, 
              results.poseLandmarks, 
              { color: '#FF0000', radius: 4 }
            );
            checkCollisions(results.poseLandmarks);
          }

          // Отрисовка точек
          points.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'red';
            ctx.fill();
            ctx.closePath();
          });
        });

        // Инициализация камеры с высоким разрешением
        if (videoRef.current) {
          cameraRef.current = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (holisticRef.current) {
                await holisticRef.current.send({ image: videoRef.current! });
              }
            },
            width: TARGET_CAMERA_WIDTH,
            height: TARGET_CAMERA_HEIGHT,
            facingMode: 'user'
          });
          cameraRef.current.start();
        }

        // Генерация начальных точек
        const initialPoints = [];
        for (let i = 0; i < 3; i++) {
          const point = generateNewPoint();
          if (point) initialPoints.push(point);
        }
        setPoints(initialPoints);

      } catch (error) {
        console.error('Ошибка инициализации:', error);
      }
    };

    loadScripts();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (holisticRef.current) {
        holisticRef.current.close();
      }
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100vh',
      backgroundColor: '#000',
      overflow: 'hidden'
    }}>
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }}
      />
    </div>
  );
};

export default MPStar;