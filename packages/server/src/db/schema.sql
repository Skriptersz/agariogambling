-- P2P Agar Arena Database Schema

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users & Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    pw_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- User Profiles
CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    mmr_solo INT NOT NULL DEFAULT 1000,
    mmr_duo INT NOT NULL DEFAULT 1000,
    mmr_squad INT NOT NULL DEFAULT 1000,
    kyc_status TEXT NOT NULL DEFAULT 'NONE' CHECK (kyc_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED')),
    kyc_provider_id TEXT,
    device_fingerprint TEXT,
    ip_asn TEXT,
    region TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wallets
CREATE TABLE wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    available_cents BIGINT NOT NULL DEFAULT 0 CHECK (available_cents >= 0),
    escrow_cents BIGINT NOT NULL DEFAULT 0 CHECK (escrow_cents >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INT NOT NULL DEFAULT 0 -- optimistic locking
);

-- Wallet Transactions (ledger)
CREATE TABLE wallet_tx (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'ESCROW_LOCK', 'ESCROW_RELEASE', 'PAYOUT', 'RAKE', 'REFUND')),
    amount_cents BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    ref JSONB NOT NULL DEFAULT '{}',
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_user_id ON wallet_tx(user_id);
CREATE INDEX idx_wallet_tx_status ON wallet_tx(status);
CREATE INDEX idx_wallet_tx_idempotency ON wallet_tx(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Lobbies
CREATE TABLE lobbies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mode TEXT NOT NULL CHECK (mode IN ('SOLO', 'DUO', 'SQUAD')),
    buy_in_cents INT NOT NULL CHECK (buy_in_cents > 0),
    payout_model TEXT NOT NULL CHECK (payout_model IN ('WINNER_TAKE_ALL', 'TOP_3_LADDER', 'PROPORTIONAL')),
    region TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'WAITING' CHECK (state IN ('WAITING', 'COUNTDOWN', 'ACTIVE', 'SUDDEN_SHRINK', 'SETTLEMENT', 'COMPLETED')),
    rake_bps INT NOT NULL DEFAULT 800 CHECK (rake_bps >= 0 AND rake_bps <= 10000), -- basis points (8% = 800)
    rake_cap_cents INT CHECK (rake_cap_cents >= 0),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE INDEX idx_lobbies_state ON lobbies(state);
CREATE INDEX idx_lobbies_mode ON lobbies(mode);
CREATE INDEX idx_lobbies_buy_in ON lobbies(buy_in_cents);

-- Lobby Players
CREATE TABLE lobby_players (
    lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    team_no INT NOT NULL DEFAULT 0,
    PRIMARY KEY (lobby_id, user_id)
);

CREATE INDEX idx_lobby_players_user_id ON lobby_players(user_id);

-- Matches
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lobby_id UUID NOT NULL REFERENCES lobbies(id),
    seed TEXT NOT NULL,
    nonce TEXT NOT NULL,
    commit TEXT NOT NULL, -- SHA256(seed + nonce) for provably fair
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    payout_model TEXT NOT NULL,
    rake_bps INT NOT NULL,
    pot_cents INT NOT NULL CHECK (pot_cents >= 0),
    rake_cents INT NOT NULL CHECK (rake_cents >= 0),
    net_pot_cents INT NOT NULL CHECK (net_pot_cents >= 0),
    replay_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matches_lobby_id ON matches(lobby_id);
CREATE INDEX idx_matches_started_at ON matches(started_at);

-- Match Players (results)
CREATE TABLE match_players (
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_no INT NOT NULL DEFAULT 0,
    placement INT NOT NULL CHECK (placement > 0),
    max_mass NUMERIC(15, 2) NOT NULL CHECK (max_mass >= 0),
    final_mass NUMERIC(15, 2) NOT NULL CHECK (final_mass >= 0),
    payout_cents INT NOT NULL CHECK (payout_cents >= 0),
    PRIMARY KEY (match_id, user_id)
);

CREATE INDEX idx_match_players_user_id ON match_players(user_id);
CREATE INDEX idx_match_players_placement ON match_players(placement);

-- Anti-Cheat Risk Events
CREATE TABLE risk_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- e.g., 'VELOCITY_SPIKE', 'TELEPORT', 'SYNCHRONIZED_PATHING'
    weight INT NOT NULL DEFAULT 1, -- severity weight
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_events_user_id ON risk_events(user_id);
CREATE INDEX idx_risk_events_match_id ON risk_events(match_id);
CREATE INDEX idx_risk_events_code ON risk_events(code);

-- Link Graph (anti-collusion)
CREATE TABLE link_graph (
    user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weight INT NOT NULL DEFAULT 1, -- number of shared matches, IP overlaps, etc.
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (user_a < user_b), -- enforce ordering to prevent duplicates
    PRIMARY KEY (user_a, user_b)
);

CREATE INDEX idx_link_graph_user_a ON link_graph(user_a);
CREATE INDEX idx_link_graph_user_b ON link_graph(user_b);
CREATE INDEX idx_link_graph_weight ON link_graph(weight);

-- Cosmetics (future)
CREATE TABLE cosmetics (
    id SERIAL PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, -- 'SKIN', 'TRAIL', 'EMOTE', etc.
    meta JSONB NOT NULL DEFAULT '{}',
    price_cents INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Inventory
CREATE TABLE inventory (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sku TEXT NOT NULL REFERENCES cosmetics(sku) ON DELETE CASCADE,
    obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, sku)
);

-- Seasons (future)
CREATE TABLE seasons (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Responsible Gaming Controls
CREATE TABLE responsible_gaming (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    self_exclude_until TIMESTAMPTZ,
    deposit_limit_daily_cents INT CHECK (deposit_limit_daily_cents >= 0),
    deposit_limit_weekly_cents INT CHECK (deposit_limit_weekly_cents >= 0),
    deposit_limit_monthly_cents INT CHECK (deposit_limit_monthly_cents >= 0),
    loss_limit_daily_cents INT CHECK (loss_limit_daily_cents >= 0),
    loss_limit_weekly_cents INT CHECK (loss_limit_weekly_cents >= 0),
    loss_limit_monthly_cents INT CHECK (loss_limit_monthly_cents >= 0),
    session_timer_minutes INT CHECK (session_timer_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geofencing
CREATE TABLE geofence (
    id SERIAL PRIMARY KEY,
    iso_code TEXT UNIQUE NOT NULL, -- ISO 3166-1 alpha-2 country code
    blocked BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promo Boosts (future)
CREATE TABLE promo_boosts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lobby_id UUID REFERENCES lobbies(id) ON DELETE CASCADE,
    factor NUMERIC(5, 2) NOT NULL CHECK (factor > 0), -- e.g., 1.5 for 50% boost
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallet_tx_updated_at BEFORE UPDATE ON wallet_tx
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lobbies_updated_at BEFORE UPDATE ON lobbies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_responsible_gaming_updated_at BEFORE UPDATE ON responsible_gaming
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for analytics
CREATE VIEW v_user_stats AS
SELECT
    u.id,
    u.email,
    p.nickname,
    p.mmr_solo,
    p.kyc_status,
    w.available_cents,
    w.escrow_cents,
    COUNT(DISTINCT mp.match_id) as total_matches,
    SUM(CASE WHEN mp.placement = 1 THEN 1 ELSE 0 END) as wins,
    SUM(mp.payout_cents) as total_winnings_cents
FROM users u
LEFT JOIN profiles p ON u.id = p.user_id
LEFT JOIN wallets w ON u.id = w.user_id
LEFT JOIN match_players mp ON u.id = mp.user_id
GROUP BY u.id, u.email, p.nickname, p.mmr_solo, p.kyc_status, w.available_cents, w.escrow_cents;

-- Indexes for performance
CREATE INDEX idx_wallet_tx_created_at ON wallet_tx(created_at);
CREATE INDEX idx_matches_ended_at ON matches(ended_at);
CREATE INDEX idx_risk_events_created_at ON risk_events(created_at);
