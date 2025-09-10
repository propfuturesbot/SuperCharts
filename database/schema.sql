-- Trading Bot Strategy Management System Database Schema
-- PostgreSQL Database Schema

-- Drop existing types if they exist (for clean setup)
DROP TYPE IF EXISTS strategy_type CASCADE;
DROP TYPE IF EXISTS strategy_status CASCADE;

-- Create enum types
CREATE TYPE strategy_type AS ENUM ('candlestick', 'heiken_ashi', 'renko');
CREATE TYPE strategy_status AS ENUM ('active', 'inactive', 'error');

-- Contracts table (should be created first as strategies reference it)
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    exchange VARCHAR(100),
    contract_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indicators configuration table
CREATE TABLE IF NOT EXISTS indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    parameters JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50), -- 'trend', 'momentum', 'volatility', 'volume'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main strategies table
CREATE TABLE IF NOT EXISTS strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    strategy_type strategy_type NOT NULL,
    contract_symbol VARCHAR(50) NOT NULL,
    contract_name VARCHAR(255),
    timeframe VARCHAR(10) NOT NULL,
    indicators JSONB NOT NULL,
    webhook_url TEXT,
    webhook_payload JSONB,
    status strategy_status DEFAULT 'inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255),
    FOREIGN KEY (contract_symbol) REFERENCES contracts(symbol) ON UPDATE CASCADE
);

-- Strategy execution history
CREATE TABLE IF NOT EXISTS strategy_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL, -- 'start', 'stop', 'error'
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSONB,
    user_id VARCHAR(255)
);

-- Create indexes for better performance
CREATE INDEX idx_strategies_status ON strategies(status);
CREATE INDEX idx_strategies_created_at ON strategies(created_at);
CREATE INDEX idx_strategy_executions_strategy_id ON strategy_executions(strategy_id);
CREATE INDEX idx_strategy_executions_timestamp ON strategy_executions(timestamp);

-- Create update trigger for updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE
    ON strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE
    ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default indicators
INSERT INTO indicators (name, display_name, parameters, description, category) VALUES
('sma', 'Simple Moving Average', '{"period": {"type": "number", "default": 20, "min": 1, "max": 200}}', 'Simple Moving Average indicator', 'trend'),
('ema', 'Exponential Moving Average', '{"period": {"type": "number", "default": 20, "min": 1, "max": 200}}', 'Exponential Moving Average indicator', 'trend'),
('rsi', 'Relative Strength Index', '{"period": {"type": "number", "default": 14, "min": 2, "max": 100}}', 'RSI momentum indicator', 'momentum'),
('macd', 'MACD', '{"fast": {"type": "number", "default": 12}, "slow": {"type": "number", "default": 26}, "signal": {"type": "number", "default": 9}}', 'MACD trend indicator', 'trend'),
('bb', 'Bollinger Bands', '{"period": {"type": "number", "default": 20}, "stdDev": {"type": "number", "default": 2}}', 'Bollinger Bands volatility indicator', 'volatility'),
('stochastic', 'Stochastic Oscillator', '{"kPeriod": {"type": "number", "default": 14}, "dPeriod": {"type": "number", "default": 3}}', 'Stochastic momentum indicator', 'momentum'),
('atr', 'Average True Range', '{"period": {"type": "number", "default": 14}}', 'ATR volatility indicator', 'volatility'),
('adx', 'Average Directional Index', '{"period": {"type": "number", "default": 14}}', 'ADX trend strength indicator', 'trend'),
('volume', 'Volume', '{}', 'Volume indicator', 'volume'),
('vwap', 'VWAP', '{}', 'Volume Weighted Average Price', 'volume')
ON CONFLICT (name) DO NOTHING;

-- Insert sample contracts (you can modify these based on your needs)
INSERT INTO contracts (symbol, name, exchange, contract_type) VALUES
('NQ', 'E-mini Nasdaq-100 Futures', 'CME', 'Futures'),
('ES', 'E-mini S&P 500 Futures', 'CME', 'Futures'),
('YM', 'E-mini Dow Futures', 'CBOT', 'Futures'),
('RTY', 'E-mini Russell 2000 Futures', 'CME', 'Futures'),
('CL', 'Crude Oil Futures', 'NYMEX', 'Futures'),
('GC', 'Gold Futures', 'COMEX', 'Futures'),
('6E', 'Euro FX Futures', 'CME', 'Futures'),
('ZB', '30-Year Treasury Bond Futures', 'CBOT', 'Futures')
ON CONFLICT (symbol) DO NOTHING;