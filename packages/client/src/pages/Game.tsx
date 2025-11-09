import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WSSnapshotMessage, WSInputMessage, WSMessageType, WSEventType } from '@agar/shared';
import { useAuth } from '../contexts/AuthContext';

interface GameProps {
  matchId: string;
  buyInCents: number;
  onExit: () => void;
}

interface MatchResult {
  placements: Array<{
    userId: string;
    placement: number;
    finalMass: number;
    payoutCents: number;
  }>;
  seed: string;
  nonce: string;
  commit: string;
}

export function Game({ matchId, buyInCents, onExit }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [snapshot, setSnapshot] = useState<WSSnapshotMessage | null>(null);
  const [gameState, setGameState] = useState<'connecting' | 'countdown' | 'playing' | 'shrinking' | 'finished'>('connecting');
  const [countdown, setCountdown] = useState(10);
  const [timeRemaining, setTimeRemaining] = useState(360); // 6 minutes
  const [result, setResult] = useState<MatchResult | null>(null);
  const [potCents, setPotCents] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const { token, userId } = useAuth();

  const mousePos = useRef({ x: 0, y: 0 });
  const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

  useEffect(() => {
    const s = io(WS_URL, {
      auth: { token },
      query: { matchId },
    });

    s.on('connect', () => {
      console.log('🎮 Connected to match');
      s.emit('message', { type: WSMessageType.AUTH, token });
    });

    s.on('snapshot', (data: WSSnapshotMessage) => {
      setSnapshot(data);
      setPlayerCount(data.players.filter(p => !p.isDead).length);
    });

    s.on('event', (data: any) => {
      console.log('Event:', data);

      if (data.eventType === WSEventType.COUNTDOWN) {
        setGameState('countdown');
        setCountdown(data.data.seconds);
      } else if (data.eventType === WSEventType.SHRINK) {
        setGameState('shrinking');
      } else if (data.eventType === WSEventType.END) {
        setGameState('finished');
      } else if (data.eventType === WSEventType.KILL) {
        // Could add kill notifications here
      }
    });

    s.on('result', (data: MatchResult) => {
      console.log('💰 Match result:', data);
      setResult(data);
      setGameState('finished');
    });

    s.on('disconnect', () => {
      console.log('Disconnected from game server');
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [matchId, token]);

  // Calculate pot based on player count
  useEffect(() => {
    if (snapshot) {
      const totalPlayers = snapshot.players.length;
      setPotCents(totalPlayers * buyInCents);
    }
  }, [snapshot, buyInCents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleSpaceBar = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        // Send boost input
        if (socket && gameState === 'playing') {
          socket.emit('input', {
            type: WSMessageType.INPUT,
            seq: Date.now(),
            axes: { x: 0, y: 0 },
            boost: true,
            ts: Date.now(),
          });
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleSpaceBar);

    // Send input at 30 Hz
    const inputInterval = setInterval(() => {
      if (!socket || gameState !== 'playing') return;

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
    let animationId: number;
    const render = () => {
      // Dark background with grid
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = 'rgba(102, 126, 234, 0.1)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      if (gameState === 'connecting') {
        drawCenteredText(ctx, canvas, 'Connecting to match...', 32, '#667eea');
        animationId = requestAnimationFrame(render);
        return;
      }

      if (gameState === 'countdown') {
        drawCenteredText(ctx, canvas, `Match starting in ${countdown}...`, 48, '#4ade80');
        drawCenteredText(ctx, canvas, `💰 ${(potCents / 100).toFixed(2)} POT`, 32, '#fbbf24', 60);
        animationId = requestAnimationFrame(render);
        return;
      }

      if (!snapshot) {
        animationId = requestAnimationFrame(render);
        return;
      }

      const camera = { x: 0, y: 0, zoom: 1 };

      // Find our player
      const ourPlayer = snapshot.players.find(p => p.userId === userId);
      if (ourPlayer && !ourPlayer.isDead) {
        camera.x = ourPlayer.pos.x;
        camera.y = ourPlayer.pos.y;

        // Zoom based on mass (bigger = zoom out more)
        camera.zoom = Math.max(0.5, 1 - (ourPlayer.mass / 1000));
      }

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Draw pellets with glow
      for (const pellet of snapshot.pellets) {
        const screenX = centerX + (pellet.pos.x - camera.x) * camera.zoom;
        const screenY = centerY + (pellet.pos.y - camera.y) * camera.zoom;

        // Glow
        const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, pellet.radius * camera.zoom * 2);
        gradient.addColorStop(0, 'rgba(74, 222, 128, 0.4)');
        gradient.addColorStop(1, 'rgba(74, 222, 128, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, pellet.radius * camera.zoom * 2, 0, Math.PI * 2);
        ctx.fill();

        // Pellet
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(screenX, screenY, pellet.radius * camera.zoom, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sort players by mass for rendering (bigger on top)
      const sortedPlayers = [...snapshot.players].sort((a, b) => a.mass - b.mass);

      // Draw players
      for (const player of sortedPlayers) {
        if (player.isDead) continue;

        const screenX = centerX + (player.pos.x - camera.x) * camera.zoom;
        const screenY = centerY + (player.pos.y - camera.y) * camera.zoom;
        const radius = player.radius * camera.zoom;

        const isOurPlayer = player.userId === userId;

        // Glow for our player
        if (isOurPlayer) {
          const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius * 1.5);
          gradient.addColorStop(0, 'rgba(251, 191, 36, 0.3)');
          gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(screenX, screenY, radius * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Player circle with gradient
        const playerGradient = ctx.createRadialGradient(
          screenX - radius * 0.3,
          screenY - radius * 0.3,
          radius * 0.1,
          screenX,
          screenY,
          radius
        );

        if (isOurPlayer) {
          playerGradient.addColorStop(0, '#fbbf24');
          playerGradient.addColorStop(1, '#f59e0b');
        } else {
          playerGradient.addColorStop(0, '#667eea');
          playerGradient.addColorStop(1, '#764ba2');
        }

        ctx.fillStyle = playerGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = isOurPlayer ? '#fbbf24' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isOurPlayer ? 3 : 2;
        ctx.stroke();

        // Mass/value text
        const massValue = (player.mass / 10 * buyInCents / 100).toFixed(2);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(12, radius / 3)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`$${massValue}`, screenX, screenY);
      }

      // Draw fog boundary during shrink
      if (gameState === 'shrinking' && snapshot.fogRadius < 10000) {
        // Red zone outside fog
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 6;
        ctx.setLineDash([20, 10]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, snapshot.fogRadius * camera.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Warning text
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Draw HUD
      drawMoneyHUD(ctx, canvas, snapshot, ourPlayer, potCents, buyInCents, timeRemaining, gameState);

      // Draw leaderboard
      drawLeaderboard(ctx, canvas, snapshot, userId, buyInCents);

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      clearInterval(inputInterval);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleSpaceBar);
      cancelAnimationFrame(animationId);
    };
  }, [snapshot, socket, gameState, countdown, potCents, buyInCents, timeRemaining, userId]);

  if (gameState === 'finished' && result) {
    return <SettlementScreen result={result} buyInCents={buyInCents} onExit={onExit} userId={userId || ''} />;
  }

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'none' }} />
      <style>{`
        * {
          cursor: none !important;
        }
      `}</style>
    </>
  );
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  size: number,
  color: string,
  offsetY: number = 0
) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + offsetY);
}

function drawMoneyHUD(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  snapshot: WSSnapshotMessage,
  ourPlayer: any,
  potCents: number,
  buyInCents: number,
  timeRemaining: number,
  gameState: string
) {
  // Top HUD box
  const padding = 20;
  const hudWidth = 350;
  const hudHeight = 180;

  // Background
  ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
  ctx.fillRect(padding, padding, hudWidth, hudHeight);

  // Border
  ctx.strokeStyle = 'rgba(102, 126, 234, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(padding, padding, hudWidth, hudHeight);

  // Content
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'left';

  let y = padding + 30;

  // Pot
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(`💰 POT: $${(potCents / 100).toFixed(2)}`, padding + 15, y);
  y += 35;

  // Buy-in & Rake
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px Arial';
  const rake = Math.floor(potCents * 0.08);
  const netPot = potCents - rake;
  ctx.fillText(`Buy-in: $${(buyInCents / 100).toFixed(2)} | Rake: $${(rake / 100).toFixed(2)} (8%)`, padding + 15, y);
  y += 25;

  // Net pot
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`Net Pot: $${(netPot / 100).toFixed(2)}`, padding + 15, y);
  y += 30;

  // Your value
  if (ourPlayer) {
    const yourValue = (ourPlayer.mass / 10 * buyInCents / 100).toFixed(2);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`Your Value: $${yourValue}`, padding + 15, y);
  }
  y += 30;

  // Players alive
  const alive = snapshot.players.filter(p => !p.isDead).length;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px Arial';
  ctx.fillText(`Players: ${alive} alive`, padding + 15, y);

  // Timer (top right)
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  ctx.fillStyle = gameState === 'shrinking' ? '#ef4444' : '#4ade80';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(timerText, canvas.width - padding, padding + 40);

  if (gameState === 'shrinking') {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('⚠️ SUDDEN SHRINK', canvas.width - padding, padding + 75);
  }
}

function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  snapshot: WSSnapshotMessage,
  userId: string | null,
  buyInCents: number
) {
  const padding = 20;
  const width = 250;
  const x = canvas.width - width - padding;
  const y = 120;

  // Sort by mass
  const sorted = [...snapshot.players]
    .filter(p => !p.isDead)
    .sort((a, b) => b.mass - a.mass)
    .slice(0, 10);

  const height = 40 + sorted.length * 30;

  // Background
  ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = 'rgba(102, 126, 234, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('LEADERBOARD', x + 10, y + 25);

  // Players
  ctx.font = '14px Arial';
  sorted.forEach((player, i) => {
    const py = y + 50 + i * 30;
    const value = (player.mass / 10 * buyInCents / 100).toFixed(2);
    const isYou = player.userId === userId;

    ctx.fillStyle = isYou ? '#fbbf24' : '#e2e8f0';
    ctx.fillText(`${i + 1}.`, x + 10, py);
    ctx.fillText(`$${value}`, x + 40, py);

    if (isYou) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('(YOU)', x + 140, py);
    }
  });
}

function SettlementScreen({
  result,
  buyInCents,
  onExit,
  userId,
}: {
  result: MatchResult;
  buyInCents: number;
  onExit: () => void;
  userId: string;
}) {
  const myResult = result.placements.find(p => p.userId === userId);

  return (
    <div style={styles.settlementContainer}>
      <div style={styles.settlementBox}>
        <h1 style={styles.settlementTitle}>MATCH COMPLETE</h1>

        {myResult && (
          <div style={styles.yourResult}>
            <div style={styles.placement}>
              {myResult.placement === 1 && '🏆'}
              {myResult.placement === 2 && '🥈'}
              {myResult.placement === 3 && '🥉'}
              {' '}
              #{myResult.placement}
            </div>
            <div style={styles.payout}>
              {myResult.payoutCents > 0 ? (
                <>
                  <span style={styles.winAmount}>+${(myResult.payoutCents / 100).toFixed(2)}</span>
                  <span style={styles.winLabel}>YOU WON!</span>
                </>
              ) : (
                <>
                  <span style={styles.lossAmount}>-${(buyInCents / 100).toFixed(2)}</span>
                  <span style={styles.lossLabel}>Better luck next time</span>
                </>
              )}
            </div>
          </div>
        )}

        <div style={styles.provablyFair}>
          <h3>✅ Provably Fair</h3>
          <div style={styles.seedInfo}>
            <p><strong>Commitment:</strong> {result.commit.substring(0, 16)}...</p>
            <p><strong>Seed:</strong> {result.seed.substring(0, 16)}...</p>
            <p><strong>Nonce:</strong> {result.nonce}</p>
          </div>
          <p style={styles.verifyText}>
            All randomness was committed before the match. Verify at /matches/{result.commit.substring(0, 8)}/verify
          </p>
        </div>

        <div style={styles.leaderboardFinal}>
          <h3>Final Standings</h3>
          {result.placements.map((p) => (
            <div key={p.userId} style={p.userId === userId ? styles.leaderboardYou : styles.leaderboardRow}>
              <span>#{p.placement}</span>
              <span>${(p.payoutCents / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <button onClick={onExit} style={styles.rematchButton}>
          Return to Lobby
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  settlementContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  settlementBox: {
    background: 'rgba(10, 10, 15, 0.95)',
    backdropFilter: 'blur(10px)',
    padding: '40px',
    borderRadius: '20px',
    border: '2px solid rgba(102, 126, 234, 0.5)',
    maxWidth: '600px',
    width: '100%',
    color: '#fff',
  },
  settlementTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    marginBottom: '30px',
    textAlign: 'center',
    color: '#fbbf24',
  },
  yourResult: {
    textAlign: 'center',
    marginBottom: '40px',
    padding: '30px',
    background: 'rgba(102, 126, 234, 0.2)',
    borderRadius: '15px',
  },
  placement: {
    fontSize: '48px',
    fontWeight: 'bold',
    marginBottom: '20px',
  },
  payout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  winAmount: {
    fontSize: '42px',
    fontWeight: 'bold',
    color: '#4ade80',
  },
  winLabel: {
    fontSize: '18px',
    color: '#4ade80',
  },
  lossAmount: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#ef4444',
  },
  lossLabel: {
    fontSize: '16px',
    color: '#94a3b8',
  },
  provablyFair: {
    background: 'rgba(74, 222, 128, 0.1)',
    padding: '20px',
    borderRadius: '10px',
    marginBottom: '30px',
  },
  seedInfo: {
    fontSize: '12px',
    fontFamily: 'monospace',
    marginTop: '10px',
    color: '#94a3b8',
  },
  verifyText: {
    fontSize: '12px',
    marginTop: '10px',
    color: '#94a3b8',
  },
  leaderboardFinal: {
    marginBottom: '30px',
  },
  leaderboardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  leaderboardYou: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(251, 191, 36, 0.2)',
    borderRadius: '5px',
    fontWeight: 'bold',
  },
  rematchButton: {
    width: '100%',
    padding: '15px',
    borderRadius: '10px',
    border: 'none',
    background: '#667eea',
    color: '#fff',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};
