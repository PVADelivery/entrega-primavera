-- Migration: add fcm_token column to delivery_drivers for MT 24 Horas Express FCM
ALTER TABLE delivery_drivers ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Index para facilitar busca de drivers online com token
CREATE INDEX IF NOT EXISTS idx_delivery_drivers_fcm_token ON delivery_drivers (fcm_token) WHERE fcm_token IS NOT NULL;
