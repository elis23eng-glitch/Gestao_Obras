/*
# Autenticação Real, RBAC e Controle de Acesso por Obra

## Visão Geral
Transforma perfis simulados em autenticação real com Supabase Auth,
vincula usuários autenticados a perfis, cria controle de acesso por obra,
remove políticas anônimas permissivas e protege colunas financeiras.

## Alterações
1. `usuarios` — adiciona `auth_user_id` linkando a `auth.users`, unique constraint em email
2. Nova tabela `projeto_usuarios` — associação usuário ↔ obra
3. Nova tabela `audit_log` — histórico de alterações com autor, valores antes/depois
4. `updated_at` em orcamentos, orcamento_itens, tarefas, diario_obra, usuarios
5. Remove TODAS políticas anon_*, substitui por políticas autenticadas com checagem de acesso
6. Funções SECURITY DEFINER: user_cargo(), user_id_by_auth(), user_has_project_access()
7. Views: orcamento_itens_mestre (sem custos), projetos_mestre (sem valor_contrato)
8. Trigger que impede alteração de cargo por não-admins
9. Triggers de audit log em orcamentos, orcamento_itens, tarefas
*/
-- ============================================================
-- 1. VINCULAR usuarios A auth.users
-- ============================================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_auth_user_id_key') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_email_key') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_key UNIQUE (email);
  END IF;
END $$;

-- ============================================================
-- 2. TABELA projeto_usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS projeto_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(projeto_id, usuario_id)
);
ALTER TABLE projeto_usuarios ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_projeto_usuarios_projeto ON projeto_usuarios(projeto_id);
CREATE INDEX IF NOT EXISTS idx_projeto_usuarios_usuario ON projeto_usuarios(usuario_id);

-- ============================================================
-- 3. TABELA audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  acao text NOT NULL CHECK (acao IN ('insert', 'update', 'delete')),
  valores_anteriores jsonb,
  valores_posteriores jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_log_tabela ON audit_log(tabela);
CREATE INDEX IF NOT EXISTS idx_audit_log_registro ON audit_log(registro_id);

-- ============================================================
-- 4. updated_at nas tabelas principais
-- ============================================================
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE diario_obra ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ============================================================
-- 5. FUNÇÕES HELPER (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_cargo()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo text;
BEGIN
  SELECT cargo INTO v_cargo FROM usuarios WHERE auth_user_id = auth.uid();
  RETURN COALESCE(v_cargo, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.user_id_by_auth()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM usuarios WHERE auth_user_id = auth.uid();
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_project_access(p_projeto_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo text;
  v_count int;
BEGIN
  v_cargo := public.user_cargo();
  IF v_cargo = 'admin' THEN
    RETURN true;
  END IF;
  SELECT count(*) INTO v_count
  FROM projeto_usuarios
  WHERE projeto_id = p_projeto_id AND usuario_id = public.user_id_by_auth();
  RETURN v_count > 0;
END;
$$;

-- ============================================================
-- 6. REMOVER POLÍTICAS ANÔNIMAS EXISTENTES
-- ============================================================
DROP POLICY IF EXISTS "anon_select_insumos" ON insumos;
DROP POLICY IF EXISTS "anon_insert_insumos" ON insumos;
DROP POLICY IF EXISTS "anon_update_insumos" ON insumos;
DROP POLICY IF EXISTS "anon_delete_insumos" ON insumos;
DROP POLICY IF EXISTS "anon_select_composicoes" ON composicoes;
DROP POLICY IF EXISTS "anon_insert_composicoes" ON composicoes;
DROP POLICY IF EXISTS "anon_update_composicoes" ON composicoes;
DROP POLICY IF EXISTS "anon_delete_composicoes" ON composicoes;
DROP POLICY IF EXISTS "anon_select_composicao_insumos" ON composicao_insumos;
DROP POLICY IF EXISTS "anon_insert_composicao_insumos" ON composicao_insumos;
DROP POLICY IF EXISTS "anon_update_composicao_insumos" ON composicao_insumos;
DROP POLICY IF EXISTS "anon_delete_composicao_insumos" ON composicao_insumos;
DROP POLICY IF EXISTS "anon_select_projetos" ON projetos;
DROP POLICY IF EXISTS "anon_insert_projetos" ON projetos;
DROP POLICY IF EXISTS "anon_update_projetos" ON projetos;
DROP POLICY IF EXISTS "anon_delete_projetos" ON projetos;
DROP POLICY IF EXISTS "anon_select_eap_itens" ON eap_itens;
DROP POLICY IF EXISTS "anon_insert_eap_itens" ON eap_itens;
DROP POLICY IF EXISTS "anon_update_eap_itens" ON eap_itens;
DROP POLICY IF EXISTS "anon_delete_eap_itens" ON eap_itens;
DROP POLICY IF EXISTS "anon_select_orcamentos" ON orcamentos;
DROP POLICY IF EXISTS "anon_insert_orcamentos" ON orcamentos;
DROP POLICY IF EXISTS "anon_update_orcamentos" ON orcamentos;
DROP POLICY IF EXISTS "anon_delete_orcamentos" ON orcamentos;
DROP POLICY IF EXISTS "anon_select_orcamento_itens" ON orcamento_itens;
DROP POLICY IF EXISTS "anon_insert_orcamento_itens" ON orcamento_itens;
DROP POLICY IF EXISTS "anon_update_orcamento_itens" ON orcamento_itens;
DROP POLICY IF EXISTS "anon_delete_orcamento_itens" ON orcamento_itens;
DROP POLICY IF EXISTS "anon_select_fornecedores" ON fornecedores;
DROP POLICY IF EXISTS "anon_insert_fornecedores" ON fornecedores;
DROP POLICY IF EXISTS "anon_update_fornecedores" ON fornecedores;
DROP POLICY IF EXISTS "anon_delete_fornecedores" ON fornecedores;
DROP POLICY IF EXISTS "anon_select_propostas" ON propostas_fornecedor;
DROP POLICY IF EXISTS "anon_insert_propostas" ON propostas_fornecedor;
DROP POLICY IF EXISTS "anon_update_propostas" ON propostas_fornecedor;
DROP POLICY IF EXISTS "anon_delete_propostas" ON propostas_fornecedor;
DROP POLICY IF EXISTS "anon_select_tarefas" ON tarefas;
DROP POLICY IF EXISTS "anon_insert_tarefas" ON tarefas;
DROP POLICY IF EXISTS "anon_update_tarefas" ON tarefas;
DROP POLICY IF EXISTS "anon_delete_tarefas" ON tarefas;
DROP POLICY IF EXISTS "anon_select_medicoes" ON medicoes;
DROP POLICY IF EXISTS "anon_insert_medicoes" ON medicoes;
DROP POLICY IF EXISTS "anon_update_medicoes" ON medicoes;
DROP POLICY IF EXISTS "anon_delete_medicoes" ON medicoes;
DROP POLICY IF EXISTS "anon_select_usuarios" ON usuarios;
DROP POLICY IF EXISTS "anon_insert_usuarios" ON usuarios;
DROP POLICY IF EXISTS "anon_update_usuarios" ON usuarios;
DROP POLICY IF EXISTS "anon_delete_usuarios" ON usuarios;
DROP POLICY IF EXISTS "anon_select_diario" ON diario_obra;
DROP POLICY IF EXISTS "anon_insert_diario" ON diario_obra;
DROP POLICY IF EXISTS "anon_update_diario" ON diario_obra;
DROP POLICY IF EXISTS "anon_delete_diario" ON diario_obra;

-- ============================================================
-- 7. NOVAS POLÍTICAS — AUTENTICADAS, BASEADAS EM ACESSO
-- ============================================================
-- INSUMOS
CREATE POLICY "auth_select_insumos" ON insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_insumos" ON insumos FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_insumos" ON insumos FOR UPDATE TO authenticated USING (public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_insumos" ON insumos FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- COMPOSICOES
CREATE POLICY "auth_select_composicoes" ON composicoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_composicoes" ON composicoes FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_composicoes" ON composicoes FOR UPDATE TO authenticated USING (public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_composicoes" ON composicoes FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- COMPOSICAO_INSUMOS
CREATE POLICY "auth_select_composicao_insumos" ON composicao_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_composicao_insumos" ON composicao_insumos FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_composicao_insumos" ON composicao_insumos FOR UPDATE TO authenticated USING (public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_composicao_insumos" ON composicao_insumos FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- PROJETOS
CREATE POLICY "auth_select_projetos" ON projetos FOR SELECT TO authenticated USING (public.user_has_project_access(id));
CREATE POLICY "auth_insert_projetos" ON projetos FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_projetos" ON projetos FOR UPDATE TO authenticated USING (public.user_has_project_access(id) AND public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_has_project_access(id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_projetos" ON projetos FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- EAP_ITENS
CREATE POLICY "auth_select_eap_itens" ON eap_itens FOR SELECT TO authenticated USING (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_insert_eap_itens" ON eap_itens FOR INSERT TO authenticated WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_eap_itens" ON eap_itens FOR UPDATE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_eap_itens" ON eap_itens FOR DELETE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() = 'admin');
-- ORCAMENTOS
CREATE POLICY "auth_select_orcamentos" ON orcamentos FOR SELECT TO authenticated USING (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_insert_orcamentos" ON orcamentos FOR INSERT TO authenticated WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_orcamentos" ON orcamentos FOR UPDATE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_orcamentos" ON orcamentos FOR DELETE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() = 'admin');
-- ORCAMENTO_ITENS
CREATE POLICY "auth_select_orcamento_itens" ON orcamento_itens FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND public.user_has_project_access(o.projeto_id))
);
CREATE POLICY "auth_insert_orcamento_itens" ON orcamento_itens FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND public.user_has_project_access(o.projeto_id))
  AND public.user_cargo() IN ('admin','engenheiro')
);
CREATE POLICY "auth_update_orcamento_itens" ON orcamento_itens FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND public.user_has_project_access(o.projeto_id))
  AND public.user_cargo() IN ('admin','engenheiro')
) WITH CHECK (
  EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND public.user_has_project_access(o.projeto_id))
  AND public.user_cargo() IN ('admin','engenheiro')
);
CREATE POLICY "auth_delete_orcamento_itens" ON orcamento_itens FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND public.user_has_project_access(o.projeto_id))
  AND public.user_cargo() = 'admin'
);
-- FORNECEDORES
CREATE POLICY "auth_select_fornecedores" ON fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_fornecedores" ON fornecedores FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_fornecedores" ON fornecedores FOR UPDATE TO authenticated USING (public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_fornecedores" ON fornecedores FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- PROPOSTAS_FORNECEDOR
CREATE POLICY "auth_select_propostas" ON propostas_fornecedor FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_propostas" ON propostas_fornecedor FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_propostas" ON propostas_fornecedor FOR UPDATE TO authenticated USING (public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_propostas" ON propostas_fornecedor FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- TAREFAS
CREATE POLICY "auth_select_tarefas" ON tarefas FOR SELECT TO authenticated USING (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_insert_tarefas" ON tarefas FOR INSERT TO authenticated WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_tarefas" ON tarefas FOR UPDATE TO authenticated USING (public.user_has_project_access(projeto_id)) WITH CHECK (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_delete_tarefas" ON tarefas FOR DELETE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
-- MEDICOES
CREATE POLICY "auth_select_medicoes" ON medicoes FOR SELECT TO authenticated USING (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_insert_medicoes" ON medicoes FOR INSERT TO authenticated WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_update_medicoes" ON medicoes FOR UPDATE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
CREATE POLICY "auth_delete_medicoes" ON medicoes FOR DELETE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() = 'admin');
-- USUARIOS
CREATE POLICY "auth_select_usuarios" ON usuarios FOR SELECT TO authenticated USING (public.user_cargo() = 'admin' OR auth_user_id = auth.uid());
CREATE POLICY "auth_insert_usuarios" ON usuarios FOR INSERT TO authenticated WITH CHECK (public.user_cargo() = 'admin');
CREATE POLICY "auth_update_usuarios" ON usuarios FOR UPDATE TO authenticated USING (public.user_cargo() = 'admin' OR auth_user_id = auth.uid()) WITH CHECK (public.user_cargo() = 'admin' OR auth_user_id = auth.uid());
CREATE POLICY "auth_delete_usuarios" ON usuarios FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- PROJETO_USUARIOS
CREATE POLICY "auth_select_projeto_usuarios" ON projeto_usuarios FOR SELECT TO authenticated USING (public.user_cargo() = 'admin' OR usuario_id = public.user_id_by_auth());
CREATE POLICY "auth_insert_projeto_usuarios" ON projeto_usuarios FOR INSERT TO authenticated WITH CHECK (public.user_cargo() = 'admin');
CREATE POLICY "auth_update_projeto_usuarios" ON projeto_usuarios FOR UPDATE TO authenticated USING (public.user_cargo() = 'admin') WITH CHECK (public.user_cargo() = 'admin');
CREATE POLICY "auth_delete_projeto_usuarios" ON projeto_usuarios FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
-- DIARIO_OBRA
CREATE POLICY "auth_select_diario" ON diario_obra FOR SELECT TO authenticated USING (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_insert_diario" ON diario_obra FOR INSERT TO authenticated WITH CHECK (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_update_diario" ON diario_obra FOR UPDATE TO authenticated USING (public.user_has_project_access(projeto_id)) WITH CHECK (public.user_has_project_access(projeto_id));
CREATE POLICY "auth_delete_diario" ON diario_obra FOR DELETE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));
-- AUDIT_LOG
CREATE POLICY "auth_select_audit_log" ON audit_log FOR SELECT TO authenticated USING (public.user_cargo() = 'admin');
CREATE POLICY "auth_insert_audit_log" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_audit_log" ON audit_log FOR UPDATE TO authenticated USING (false);
CREATE POLICY "auth_delete_audit_log" ON audit_log FOR DELETE TO authenticated USING (false);

-- ============================================================
-- 8. VIEWS PARA PROTEÇÃO DE COLUNAS FINANCEIRAS
-- ============================================================
CREATE OR REPLACE VIEW orcamento_itens_mestre AS
SELECT id, orcamento_id, eap_item_id, composicao_id, descricao, quantidade, created_at, updated_at
FROM orcamento_itens;

CREATE OR REPLACE VIEW projetos_mestre AS
SELECT id, nome, cliente, endereco, status, data_inicio, data_termino, created_at
FROM projetos;

GRANT SELECT ON orcamento_itens_mestre TO authenticated;
GRANT SELECT ON projetos_mestre TO authenticated;

-- ============================================================
-- 9. TRIGGER PARA PROTEGER CARGO
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_usuario_cargo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.user_cargo() != 'admin' AND NEW.cargo IS DISTINCT FROM OLD.cargo THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o cargo de usuários';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_usuario_cargo ON usuarios;
CREATE TRIGGER trg_protect_usuario_cargo
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_usuario_cargo();

-- ============================================================
-- 10. TRIGGERS DE AUDIT LOG
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tabela, registro_id, usuario_id, acao, valores_anteriores, valores_posteriores)
    VALUES (TG_TABLE_NAME, NEW.id, public.user_id_by_auth(), 'update', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tabela, registro_id, usuario_id, acao, valores_anteriores, valores_posteriores)
    VALUES (TG_TABLE_NAME, NEW.id, public.user_id_by_auth(), 'insert', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tabela, registro_id, usuario_id, acao, valores_anteriores, valores_posteriores)
    VALUES (TG_TABLE_NAME, OLD.id, public.user_id_by_auth(), 'delete', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_orcamentos ON orcamentos;
CREATE TRIGGER trg_audit_orcamentos
  AFTER INSERT OR UPDATE OR DELETE ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

DROP TRIGGER IF EXISTS trg_audit_orcamento_itens ON orcamento_itens;
CREATE TRIGGER trg_audit_orcamento_itens
  AFTER INSERT OR UPDATE OR DELETE ON orcamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

DROP TRIGGER IF EXISTS trg_audit_tarefas ON tarefas;
CREATE TRIGGER trg_audit_tarefas
  AFTER INSERT OR UPDATE OR DELETE ON tarefas
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();
