/*
# Fluxo de Compras por Obra: Fornecedores, Solicitações, Propostas e Equalização

## Visão Geral
Adiciona o fluxo completo de compras por obra: cadastro avançado de fornecedores,
solicitações de compra vinculadas a obras, propostas de fornecedores com itens
detalhados, equalização comparativa e aprovação com justificativa.

## Novas Tabelas
1. `fornecedores` — ALTERADA: adiciona campos CPF/CNPJ, cidade, categorias, status ativo/desativado
2. `solicitacoes_compra` — solicitações de compra por obra (material, serviço, mão de obra, equipamento)
3. `propostas` — propostas de fornecedores vinculadas a obra + solicitação
4. `proposta_itens` — itens de cada proposta com preços, descontos, unidades
5. `compra_aprovacoes` — registro de aprovação de proposta com justificativa

## Segurança
- RLS em todas as novas tabelas
- Admin e engenheiro podem operar compras conforme acesso à obra
- Mestre não pode ver preços, propostas ou indicadores financeiros
- Sem políticas anônimas permissivas
- Views para proteger colunas financeiras do mestre
*/

-- ============================================================
-- 1. EVOLUIR fornecedores COM NOVOS CAMPOS
-- ============================================================
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS cpf_cnpj text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS categorias text[] DEFAULT '{}';
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Unique constraint on cpf_cnpj (partial — only when not null)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fornecedores_cpf_cnpj_key') THEN
    ALTER TABLE fornecedores ADD CONSTRAINT fornecedores_cpf_cnpj_key UNIQUE (cpf_cnpj) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ============================================================
-- 2. TABELA solicitacoes_compra
-- ============================================================
CREATE TABLE IF NOT EXISTS solicitacoes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  categoria text NOT NULL DEFAULT 'material' CHECK (categoria IN ('material','servico','mao_obra','equipamento')),
  insumo_id uuid REFERENCES insumos(id) ON DELETE SET NULL,
  unidade text NOT NULL DEFAULT 'un',
  quantidade numeric NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  data_necessaria date,
  orcamento_referencia numeric,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','cotando','aprovada','cancelada','entregue')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE solicitacoes_compra ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_projeto ON solicitacoes_compra(projeto_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_compra(status);

-- ============================================================
-- 3. TABELA propostas
-- ============================================================
CREATE TABLE IF NOT EXISTS propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes_compra(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES fornecedores(id) ON DELETE RESTRICT,
  numero text,
  data_proposta date DEFAULT CURRENT_DATE,
  validade date,
  frete numeric NOT NULL DEFAULT 0,
  impostos_adicionais numeric NOT NULL DEFAULT 0 CHECK (impostos_adicionais >= 0),
  desconto_global numeric NOT NULL DEFAULT 0,
  prazo_entrega text,
  condicao_pagamento text,
  observacoes text,
  status text NOT NULL DEFAULT 'recebida' CHECK (status IN ('recebida','em_analise','aprovada','rejeitada','vencida')),
  import_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE propostas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_propostas_projeto ON propostas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_propostas_solicitacao ON propostas(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_propostas_fornecedor ON propostas(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_propostas_import_hash ON propostas(import_hash);

-- ============================================================
-- 4. TABELA proposta_itens
-- ============================================================
CREATE TABLE IF NOT EXISTS proposta_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  quantidade numeric NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario numeric NOT NULL DEFAULT 0 CHECK (preco_unitario >= 0),
  desconto numeric NOT NULL DEFAULT 0,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE proposta_itens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_proposta_itens_proposta ON proposta_itens(proposta_id);

-- ============================================================
-- 5. TABELA compra_aprovacoes
-- ============================================================
CREATE TABLE IF NOT EXISTS compra_aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL UNIQUE REFERENCES propostas(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  justificativa text NOT NULL,
  custo_total_aprovado numeric NOT NULL,
  economia_aprovada numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE compra_aprovacoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_aprovacoes_proposta ON compra_aprovacoes(proposta_id);

-- ============================================================
-- 6. FUNÇÃO: custo total de uma proposta
-- ============================================================
CREATE OR REPLACE FUNCTION public.proposta_custo_total(p_proposta_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT SUM(quantidade * preco_unitario * (1 - desconto/100.0))
     FROM proposta_itens WHERE proposta_id = p_proposta_id),
    0
  ) + COALESCE(
    (SELECT frete + impostos_adicionais - desconto_global
     FROM propostas WHERE id = p_proposta_id),
    0
  );
$$;

-- ============================================================
-- 7. POLÍTICAS RLS — FORNECEDORES (atualizar existentes)
-- ============================================================
-- Mestre não pode ver fornecedores (dados comerciais)
DROP POLICY IF EXISTS "auth_select_fornecedores" ON fornecedores;
CREATE POLICY "auth_select_fornecedores" ON fornecedores FOR SELECT TO authenticated USING (public.user_cargo() IN ('admin','engenheiro'));
DROP POLICY IF EXISTS "auth_insert_fornecedores" ON fornecedores;
CREATE POLICY "auth_insert_fornecedores" ON fornecedores FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
DROP POLICY IF EXISTS "auth_update_fornecedores" ON fornecedores;
CREATE POLICY "auth_update_fornecedores" ON fornecedores FOR UPDATE TO authenticated USING (public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
DROP POLICY IF EXISTS "auth_delete_fornecedores" ON fornecedores;
CREATE POLICY "auth_delete_fornecedores" ON fornecedores FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');

-- ============================================================
-- 8. POLÍTICAS RLS — SOLICITACOES_COMPRA
-- ============================================================
DROP POLICY IF EXISTS "auth_select_solicitacoes" ON solicitacoes_compra;
CREATE POLICY "auth_select_solicitacoes" ON solicitacoes_compra FOR SELECT TO authenticated USING (public.user_has_project_access(projeto_id));

DROP POLICY IF EXISTS "auth_insert_solicitacoes" ON solicitacoes_compra;
CREATE POLICY "auth_insert_solicitacoes" ON solicitacoes_compra FOR INSERT TO authenticated WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));

DROP POLICY IF EXISTS "auth_update_solicitacoes" ON solicitacoes_compra;
CREATE POLICY "auth_update_solicitacoes" ON solicitacoes_compra FOR UPDATE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro'));

DROP POLICY IF EXISTS "auth_delete_solicitacoes" ON solicitacoes_compra;
CREATE POLICY "auth_delete_solicitacoes" ON solicitacoes_compra FOR DELETE TO authenticated USING (public.user_has_project_access(projeto_id) AND public.user_cargo() = 'admin');

-- ============================================================
-- 9. POLÍTICAS RLS — PROPOSTAS (sem acesso para mestre)
-- ============================================================
DROP POLICY IF EXISTS "auth_select_propostas_compra" ON propostas;
CREATE POLICY "auth_select_propostas_compra" ON propostas FOR SELECT TO authenticated USING (
  public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')
);

DROP POLICY IF EXISTS "auth_insert_propostas_compra" ON propostas;
CREATE POLICY "auth_insert_propostas_compra" ON propostas FOR INSERT TO authenticated WITH CHECK (
  public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')
);

DROP POLICY IF EXISTS "auth_update_propostas_compra" ON propostas;
CREATE POLICY "auth_update_propostas_compra" ON propostas FOR UPDATE TO authenticated USING (
  public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')
) WITH CHECK (
  public.user_has_project_access(projeto_id) AND public.user_cargo() IN ('admin','engenheiro')
);

DROP POLICY IF EXISTS "auth_delete_propostas_compra" ON propostas;
CREATE POLICY "auth_delete_propostas_compra" ON propostas FOR DELETE TO authenticated USING (
  public.user_has_project_access(projeto_id) AND public.user_cargo() = 'admin'
);

-- ============================================================
-- 10. POLÍTICAS RLS — PROPOSTA_ITENS
-- ============================================================
DROP POLICY IF EXISTS "auth_select_proposta_itens" ON proposta_itens;
CREATE POLICY "auth_select_proposta_itens" ON proposta_itens FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM propostas p WHERE p.id = proposta_itens.proposta_id
  AND public.user_has_project_access(p.projeto_id) AND public.user_cargo() IN ('admin','engenheiro'))
);

DROP POLICY IF EXISTS "auth_insert_proposta_itens" ON proposta_itens;
CREATE POLICY "auth_insert_proposta_itens" ON proposta_itens FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM propostas p WHERE p.id = proposta_itens.proposta_id
  AND public.user_has_project_access(p.projeto_id) AND public.user_cargo() IN ('admin','engenheiro'))
);

DROP POLICY IF EXISTS "auth_update_proposta_itens" ON proposta_itens;
CREATE POLICY "auth_update_proposta_itens" ON proposta_itens FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM propostas p WHERE p.id = proposta_itens.proposta_id
  AND public.user_has_project_access(p.projeto_id) AND public.user_cargo() IN ('admin','engenheiro'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM propostas p WHERE p.id = proposta_itens.proposta_id
  AND public.user_has_project_access(p.projeto_id) AND public.user_cargo() IN ('admin','engenheiro'))
);

DROP POLICY IF EXISTS "auth_delete_proposta_itens" ON proposta_itens;
CREATE POLICY "auth_delete_proposta_itens" ON proposta_itens FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM propostas p WHERE p.id = proposta_itens.proposta_id
  AND public.user_has_project_access(p.projeto_id) AND public.user_cargo() = 'admin')
);

-- ============================================================
-- 11. POLÍTICAS RLS — COMPRA_APROVACOES
-- ============================================================
DROP POLICY IF EXISTS "auth_select_aprovacoes" ON compra_aprovacoes;
CREATE POLICY "auth_select_aprovacoes" ON compra_aprovacoes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM propostas p WHERE p.id = compra_aprovacoes.proposta_id
  AND public.user_has_project_access(p.projeto_id) AND public.user_cargo() IN ('admin','engenheiro'))
);

DROP POLICY IF EXISTS "auth_insert_aprovacoes" ON compra_aprovacoes;
CREATE POLICY "auth_insert_aprovacoes" ON compra_aprovacoes FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM propostas p WHERE p.id = compra_aprovacoes.proposta_id
  AND public.user_has_project_access(p.projeto_id) AND public.user_cargo() IN ('admin','engenheiro'))
);

DROP POLICY IF EXISTS "auth_update_aprovacoes" ON compra_aprovacoes;
CREATE POLICY "auth_update_aprovacoes" ON compra_aprovacoes FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "auth_delete_aprovacoes" ON compra_aprovacoes;
CREATE POLICY "auth_delete_aprovacoes" ON compra_aprovacoes FOR DELETE TO authenticated USING (
  public.user_cargo() = 'admin'
);

-- ============================================================
-- 12. VIEW para mestre: solicitacoes sem dados financeiros
-- ============================================================
CREATE OR REPLACE VIEW solicitacoes_compra_mestre AS
SELECT id, projeto_id, descricao, categoria, unidade, quantidade, data_necessaria, status, created_at
FROM solicitacoes_compra;

GRANT SELECT ON solicitacoes_compra_mestre TO authenticated;

-- ============================================================
-- 13. UPDATE PROPOSTAS_FORNECEDOR — bloquear mestre
-- ============================================================
DROP POLICY IF EXISTS "auth_select_propostas" ON propostas_fornecedor;
CREATE POLICY "auth_select_propostas" ON propostas_fornecedor FOR SELECT TO authenticated USING (public.user_cargo() IN ('admin','engenheiro'));
DROP POLICY IF EXISTS "auth_insert_propostas" ON propostas_fornecedor;
CREATE POLICY "auth_insert_propostas" ON propostas_fornecedor FOR INSERT TO authenticated WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
DROP POLICY IF EXISTS "auth_update_propostas" ON propostas_fornecedor;
CREATE POLICY "auth_update_propostas" ON propostas_fornecedor FOR UPDATE TO authenticated USING (public.user_cargo() IN ('admin','engenheiro')) WITH CHECK (public.user_cargo() IN ('admin','engenheiro'));
DROP POLICY IF EXISTS "auth_delete_propostas" ON propostas_fornecedor;
CREATE POLICY "auth_delete_propostas" ON propostas_fornecedor FOR DELETE TO authenticated USING (public.user_cargo() = 'admin');
