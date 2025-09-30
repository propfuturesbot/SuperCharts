-- Initial database setup script
-- This script will run when the PostgreSQL container is first created

-- Create schema if needed
CREATE SCHEMA IF NOT EXISTS supercharts;

-- Set search path
SET search_path TO supercharts, public;

-- Create tables (adjust based on your application's requirements)
-- Example tables for a charting application:

-- User configuration table
CREATE TABLE IF NOT EXISTS user_config (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chart data table
CREATE TABLE IF NOT EXISTS chart_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    timeframe VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    open DECIMAL(20, 8),
    high DECIMAL(20, 8),
    low DECIMAL(20, 8),
    close DECIMAL(20, 8),
    volume DECIMAL(20, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, timeframe, timestamp)
);

-- Indicator settings table
CREATE TABLE IF NOT EXISTS indicator_settings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    indicator_type VARCHAR(100) NOT NULL,
    settings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trading strategies table
CREATE TABLE IF NOT EXISTS strategies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parameters JSONB,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backtest results table
CREATE TABLE IF NOT EXISTS backtest_results (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER REFERENCES strategies(id),
    symbol VARCHAR(50) NOT NULL,
    timeframe VARCHAR(20) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    results JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chart_data_symbol ON chart_data(symbol);
CREATE INDEX IF NOT EXISTS idx_chart_data_timestamp ON chart_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_chart_data_symbol_timeframe ON chart_data(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_user_config_user_id ON user_config(user_id);
CREATE INDEX IF NOT EXISTS idx_indicator_settings_user_id ON indicator_settings(user_id);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updating timestamp
CREATE TRIGGER update_user_config_updated_at BEFORE UPDATE ON user_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_indicator_settings_updated_at BEFORE UPDATE ON indicator_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust based on your user requirements)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA supercharts TO supercharts_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA supercharts TO supercharts_user;