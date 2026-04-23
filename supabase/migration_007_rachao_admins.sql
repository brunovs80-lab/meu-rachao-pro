-- ============================================================
-- MEU RACHÃO PRO - Migration 007: Co-admins com permissões granulares
-- Permite ao dono do rachão delegar poderes específicos a outros jogadores.
-- ============================================================

CREATE TABLE IF NOT EXISTS rachao_admins (
  rachao_id TEXT NOT NULL REFERENCES rachaos(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_by TEXT REFERENCES players(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rachao_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_rachao_admins_player ON rachao_admins(player_id);
CREATE INDEX IF NOT EXISTS idx_rachao_admins_rachao ON rachao_admins(rachao_id);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION rachao_admins_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rachao_admins_updated_at ON rachao_admins;
CREATE TRIGGER trg_rachao_admins_updated_at
  BEFORE UPDATE ON rachao_admins
  FOR EACH ROW EXECUTE FUNCTION rachao_admins_set_updated_at();

-- RLS
ALTER TABLE rachao_admins ENABLE ROW LEVEL SECURITY;

-- Permite a qualquer usuário autenticado LER (clientes precisam saber seus próprios poderes).
DROP POLICY IF EXISTS "rachao_admins_select_all" ON rachao_admins;
CREATE POLICY "rachao_admins_select_all" ON rachao_admins
  FOR SELECT
  USING (true);

-- Insert/update/delete ficam bloqueados para anon/authenticated — só service_role
-- pode modificar (via RPCs ou edge function server-side que valide o caller).

-- RPC utilitário: verifica se um player tem uma permissão em um rachão
-- (owner sempre tem tudo; co-admins têm só o que foi concedido).
CREATE OR REPLACE FUNCTION check_rachao_permission(
  p_rachao_id TEXT,
  p_player_id TEXT,
  p_permission TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_owner TEXT;
  v_perms JSONB;
BEGIN
  SELECT created_by INTO v_owner FROM rachaos WHERE id = p_rachao_id;
  IF v_owner IS NULL THEN RETURN FALSE; END IF;
  IF v_owner = p_player_id THEN RETURN TRUE; END IF;

  SELECT permissions INTO v_perms
  FROM rachao_admins
  WHERE rachao_id = p_rachao_id AND player_id = p_player_id;

  IF v_perms IS NULL THEN RETURN FALSE; END IF;
  RETURN COALESCE((v_perms ->> p_permission)::boolean, FALSE);
END;
$$;

-- RPC para listar co-admins de um rachão (inclui nome do jogador)
CREATE OR REPLACE FUNCTION list_rachao_admins(p_rachao_id TEXT)
RETURNS TABLE (
  player_id TEXT,
  player_name TEXT,
  permissions JSONB,
  granted_by TEXT,
  granted_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT ra.player_id, p.name AS player_name, ra.permissions, ra.granted_by, ra.granted_at
  FROM rachao_admins ra
  JOIN players p ON p.id = ra.player_id
  WHERE ra.rachao_id = p_rachao_id
  ORDER BY ra.granted_at DESC;
$$;

-- RPC para upsert de um co-admin (deve ser chamado via edge function que valide o caller)
CREATE OR REPLACE FUNCTION upsert_rachao_admin(
  p_rachao_id TEXT,
  p_player_id TEXT,
  p_permissions JSONB,
  p_granted_by TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Dono não pode ser co-admin de si mesmo
  IF EXISTS (SELECT 1 FROM rachaos WHERE id = p_rachao_id AND created_by = p_player_id) THEN
    RAISE EXCEPTION 'Dono do rachão já tem todos os poderes';
  END IF;

  INSERT INTO rachao_admins (rachao_id, player_id, permissions, granted_by)
  VALUES (p_rachao_id, p_player_id, p_permissions, p_granted_by)
  ON CONFLICT (rachao_id, player_id)
  DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW();
END;
$$;

-- RPC para remover co-admin
CREATE OR REPLACE FUNCTION remove_rachao_admin(
  p_rachao_id TEXT,
  p_player_id TEXT
) RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM rachao_admins WHERE rachao_id = p_rachao_id AND player_id = p_player_id;
$$;

GRANT EXECUTE ON FUNCTION check_rachao_permission(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_rachao_admins(TEXT) TO anon, authenticated;
-- upsert/remove só via service_role (chamado pela edge function manage-coadmin)
