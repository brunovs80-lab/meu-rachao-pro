-- ============================================================
-- MEU RACHÃO PRO - Migration 010: Geolocalização de rachões
-- Adiciona latitude/longitude e RPC para descoberta por raio.
-- ============================================================

ALTER TABLE rachaos ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE rachaos ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_rachaos_latlng ON rachaos(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================================
-- RPC: list_open_guest_sessions_nearby(p_lat, p_lng, p_radius_km)
-- Retorna sessões abertas para avulsos com distância em km via Haversine.
-- ============================================================
CREATE OR REPLACE FUNCTION list_open_guest_sessions_nearby(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 25
)
RETURNS TABLE (
  session_id TEXT,
  session_date TEXT,
  rachao_id TEXT,
  rachao_name TEXT,
  rachao_location TEXT,
  rachao_day_of_week INTEGER,
  rachao_time TEXT,
  guest_fee NUMERIC,
  guest_slots INTEGER,
  guests_paid INTEGER,
  confirmed_count INTEGER,
  distance_km NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      s.id      AS session_id,
      s.date    AS session_date,
      r.id      AS rachao_id,
      r.name    AS rachao_name,
      r.location AS rachao_location,
      r.day_of_week AS rachao_day_of_week,
      r.time    AS rachao_time,
      s.guest_fee,
      s.guest_slots,
      r.latitude,
      r.longitude,
      (SELECT COUNT(*)::INT FROM session_guests g
        WHERE g.session_id = s.id AND g.status = 'paid') AS guests_paid,
      (SELECT COUNT(*)::INT FROM session_confirmations c
        WHERE c.session_id = s.id AND c.type = 'confirmed') AS confirmed_count
    FROM sessions s
    JOIN rachaos r ON r.id = s.rachao_id
    WHERE s.allow_guests = TRUE
      AND s.status = 'open'
      AND r.status = 'active'
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
  )
  SELECT
    b.session_id,
    b.session_date,
    b.rachao_id,
    b.rachao_name,
    b.rachao_location,
    b.rachao_day_of_week,
    b.rachao_time,
    b.guest_fee,
    b.guest_slots,
    b.guests_paid,
    b.confirmed_count,
    ROUND(
      (6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(b.latitude - p_lat) / 2), 2) +
        COS(RADIANS(p_lat)) * COS(RADIANS(b.latitude)) *
        POWER(SIN(RADIANS(b.longitude - p_lng) / 2), 2)
      )))::NUMERIC, 1
    ) AS distance_km
  FROM base b
  WHERE (6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(b.latitude - p_lat) / 2), 2) +
        COS(RADIANS(p_lat)) * COS(RADIANS(b.latitude)) *
        POWER(SIN(RADIANS(b.longitude - p_lng) / 2), 2)
      ))) <= p_radius_km
  ORDER BY distance_km;
$$;

GRANT EXECUTE ON FUNCTION list_open_guest_sessions_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated;
