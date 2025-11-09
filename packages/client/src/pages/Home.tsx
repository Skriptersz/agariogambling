import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface HomeProps {
  onStartGame: (matchId: string, buyInCents: number) => void;
}

export function Home({ onStartGame }: HomeProps) {
  const { token, login, signup, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(!token);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [balance, setBalance] = useState({ availableCents: 0, escrowCents: 0 });
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    if (token) {
      fetchBalance();
    }
  }, [token]);

  const fetchBalance = async () => {
    try {
      const res = await fetch(`${API_URL}/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data);
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, nickname);
      }
      setShowAuth(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleQuickJoin = async (buyInCents: number) => {
    try {
      // Get open lobbies
      const res = await fetch(`${API_URL}/lobbies?mode=SOLO&buyIn=${buyInCents}`);
      const { lobbies } = await res.json();

      let lobbyId;
      if (lobbies.length > 0) {
        lobbyId = lobbies[0].id;
      } else {
        // Create new lobby
        const createRes = await fetch(`${API_URL}/admin/lobbies`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            mode: 'SOLO',
            buyInCents,
            payoutModel: 'WINNER_TAKE_ALL',
            region: 'US',
            rakeBps: 800,
          }),
        });
        const { lobbyId: newLobbyId } = await createRes.json();
        lobbyId = newLobbyId;
      }

      // Join lobby
      const joinRes = await fetch(`${API_URL}/lobbies/${lobbyId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!joinRes.ok) {
        const error = await joinRes.json();
        throw new Error(error.error);
      }

      const { wsToken } = await joinRes.json();
      onStartGame(lobbyId, buyInCents);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeposit = async () => {
    try {
      const res = await fetch(`${API_URL}/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: 5000, method: 'sandbox' }), // $50
      });

      if (res.ok) {
        await fetchBalance();
      }
    } catch (err) {
      console.error('Deposit failed:', err);
    }
  };

  if (showAuth) {
    return (
      <div style={styles.container}>
        <div style={styles.authBox}>
          <h1 style={styles.title}>P2P Agar Arena</h1>
          <p style={styles.subtitle}>Money-Match Battle Royale</p>

          {error && <div style={styles.error}>{error}</div>}

          <form onSubmit={handleAuth} style={styles.form}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
            />
            {!isLogin && (
              <input
                type="text"
                placeholder="Nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={styles.input}
                required
              />
            )}
            <button type="submit" style={styles.button}>
              {isLogin ? 'Login' : 'Sign Up'}
            </button>
          </form>

          <button
            onClick={() => setIsLogin(!isLogin)}
            style={styles.switchButton}
          >
            {isLogin ? 'Need an account? Sign up' : 'Have an account? Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.homeBox}>
        <h1 style={styles.title}>P2P Agar Arena</h1>

        <div style={styles.balanceCard}>
          <h3>Balance</h3>
          <p style={styles.balance}>${(balance.availableCents / 100).toFixed(2)}</p>
          <p style={styles.escrow}>Escrowed: ${(balance.escrowCents / 100).toFixed(2)}</p>
          <button onClick={handleDeposit} style={styles.depositButton}>
            Deposit $50 (Sandbox)
          </button>
        </div>

        <div style={styles.quickJoin}>
          <h3>Quick Join</h3>
          <button onClick={() => handleQuickJoin(1000)} style={styles.buyInButton}>
            $10 SOLO
          </button>
          <button onClick={() => handleQuickJoin(2000)} style={styles.buyInButton}>
            $20 SOLO
          </button>
          <button onClick={() => handleQuickJoin(5000)} style={styles.buyInButton}>
            $50 SOLO
          </button>
        </div>

        <button onClick={logout} style={styles.logoutButton}>
          Logout
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  authBox: {
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    padding: '40px',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    minWidth: '400px',
  },
  homeBox: {
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    padding: '40px',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    minWidth: '500px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '10px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '14px',
    opacity: 0.8,
    marginBottom: '30px',
    textAlign: 'center',
  },
  error: {
    background: '#ff4444',
    padding: '10px',
    borderRadius: '5px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  input: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.2)',
    color: '#fff',
    fontSize: '16px',
  },
  button: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: '#667eea',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  switchButton: {
    marginTop: '20px',
    padding: '10px',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    opacity: 0.8,
  },
  balanceCard: {
    background: 'rgba(255, 255, 255, 0.1)',
    padding: '20px',
    borderRadius: '10px',
    marginBottom: '30px',
    textAlign: 'center',
  },
  balance: {
    fontSize: '36px',
    fontWeight: 'bold',
    margin: '10px 0',
  },
  escrow: {
    fontSize: '14px',
    opacity: 0.7,
    marginBottom: '15px',
  },
  depositButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: '#4caf50',
    color: '#fff',
    cursor: 'pointer',
  },
  quickJoin: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  buyInButton: {
    padding: '15px',
    borderRadius: '8px',
    border: 'none',
    background: '#667eea',
    color: '#fff',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  logoutButton: {
    marginTop: '30px',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    width: '100%',
  },
};
