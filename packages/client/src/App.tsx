import { useState } from 'react';
import { Home } from './pages/Home';
import { Game } from './pages/Game';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'game'>('home');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [buyInCents, setBuyInCents] = useState<number>(0);

  const startGame = (id: string, buyIn: number) => {
    setMatchId(id);
    setBuyInCents(buyIn);
    setCurrentPage('game');
  };

  const exitGame = () => {
    setMatchId(null);
    setBuyInCents(0);
    setCurrentPage('home');
  };

  return (
    <AuthProvider>
      {currentPage === 'home' && <Home onStartGame={startGame} />}
      {currentPage === 'game' && matchId && <Game matchId={matchId} buyInCents={buyInCents} onExit={exitGame} />}
    </AuthProvider>
  );
}
