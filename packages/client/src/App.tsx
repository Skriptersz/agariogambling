import { useState } from 'react';
import { Home } from './pages/Home';
import { Game } from './pages/Game';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'game'>('home');
  const [matchId, setMatchId] = useState<string | null>(null);

  const startGame = (id: string) => {
    setMatchId(id);
    setCurrentPage('game');
  };

  const exitGame = () => {
    setMatchId(null);
    setCurrentPage('home');
  };

  return (
    <AuthProvider>
      {currentPage === 'home' && <Home onStartGame={startGame} />}
      {currentPage === 'game' && matchId && <Game matchId={matchId} onExit={exitGame} />}
    </AuthProvider>
  );
}
