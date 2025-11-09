import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WSSnapshotMessage, WSInputMessage, WSMessageType } from '@agar/shared';
import { useAuth } from '../contexts/AuthContext';

interface GameProps {
  matchId: string;
  onExit: () => void;
}

export function Game({ matchId, onExit }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [snapshot, setSnapshot] = useState<WSSnapshotMessage | null>(null);
  const { token } = useAuth();

  const mousePos = useRef({ x: 0, y: 0 });
  const playerPos = useRef({ x: 0, y: 0 });

  const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

  useEffect(() => {
    // Connect to game server
    const s = io(WS_URL, {
      auth: { token },
      query: { matchId },
    });

    s.on('connect', () => {
      console.log('Connected to game server');
      s.emit('message', { type: WSMessageType.AUTH, token });
    });

    s.on('snapshot', (data: WSSnapshotMessage) => {
      setSnapshot(data);
    });

    s.on('event', (data: any) => {
      console.log('Event:', data);
    });

    s.on('result', (data: any) => {
      console.log('Match result:', data);
      alert('Match ended! Check console for results.');
    });

    s.on('disconnect', () => {
      console.log('Disconnected from game server');
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [matchId, token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Track mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Send input at 30 Hz
    const inputInterval = setInterval(() => {
      if (!socket) return;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const dx = mousePos.current.x - centerX;
      const dy = mousePos.current.y - centerY;
      const length = Math.sqrt(dx * dx + dy * dy);

      const axes = length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };

      const input: WSInputMessage = {
        type: WSMessageType.INPUT,
        seq: Date.now(),
        axes,
        boost: false,
        ts: Date.now(),
      };

      socket.emit('input', input);
    }, 1000 / 30);

    // Render loop
    const render = () => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!snapshot) {
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Connecting...', canvas.width / 2, canvas.height / 2);
        requestAnimationFrame(render);
        return;
      }

      const camera = { x: 0, y: 0, zoom: 1 };

      // Find our player (simplified - should use userId)
      const ourPlayer = snapshot.players[0];
      if (ourPlayer) {
        camera.x = ourPlayer.pos.x;
        camera.y = ourPlayer.pos.y;
        playerPos.current = ourPlayer.pos;
      }

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Draw pellets
      ctx.fillStyle = '#4ade80';
      for (const pellet of snapshot.pellets) {
        const screenX = centerX + (pellet.pos.x - camera.x) * camera.zoom;
        const screenY = centerY + (pellet.pos.y - camera.y) * camera.zoom;

        ctx.beginPath();
        ctx.arc(screenX, screenY, pellet.radius * camera.zoom, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw players
      for (const player of snapshot.players) {
        if (player.isDead) continue;

        const screenX = centerX + (player.pos.x - camera.x) * camera.zoom;
        const screenY = centerY + (player.pos.y - camera.y) * camera.zoom;

        // Draw player circle
        ctx.fillStyle = player.teamNo === 0 ? '#667eea' : '#f87171';
        ctx.beginPath();
        ctx.arc(screenX, screenY, player.radius * camera.zoom, 0, Math.PI * 2);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw mass
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.floor(player.mass).toString(), screenX, screenY);
      }

      // Draw fog
      if (snapshot.fogRadius < 10000) {
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 5;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          snapshot.fogRadius * camera.zoom,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw HUD
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(10, 10, 250, 120);

      ctx.fillStyle = '#fff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'left';
      if (ourPlayer) {
        ctx.fillText(`Mass: ${Math.floor(ourPlayer.mass)}`, 20, 35);
        ctx.fillText(`Rank: ${ourPlayer.teamNo}`, 20, 60);
        ctx.fillText(`Tick: ${snapshot.tick}`, 20, 85);
        ctx.fillText(`Alive: ${snapshot.players.filter(p => !p.isDead).length}`, 20, 110);
      }

      requestAnimationFrame(render);
    };

    render();

    return () => {
      clearInterval(inputInterval);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [snapshot, socket]);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <button
        onClick={onExit}
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          padding: '10px 20px',
          background: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          color: '#fff',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        Exit
      </button>
    </>
  );
}
