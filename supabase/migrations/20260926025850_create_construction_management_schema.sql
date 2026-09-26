/*
# Plataforma de Gestão de Obras - Schema Completo

## Visão Geral
Cria o banco de dados relacional para gerenciamento de projetos, orçamentos e controle de obras.
Aplicação single-tenant (sem autenticação) - todas as políticas usam anon+authenticated.

## Tabelas Criadas

1. **insumos** - Materiais, mão de obra, equipamentos e serviços com código, unidade, custo unitário e origem (SINAPI/Próprio)
2. **composicoes** - Composições de Custo Unitário (CPU) que agrupam múltiplos insumos
3. **composicao_insumos** - Tabela de ligação entre composições e insumos com índice de consumo (coeficiente)
4. **projetos** - Obras com nome, cliente, endereço, status, datas de início/término e valor de contrato
5. **eap_itens** - Estrutura Analítica do Projeto (hierárquica, auto-referenciada via parent_id)
6. **orcamentos** - Orçamentos vinculados a projetos com taxa de BDI configurável
7. **orcamento_itens** - Itens do orçamento ligando EAP + composições com quantidades e custos
8. **fornecedores** - Fornecedores para equalização de propostas
9. **propostas_fornecedor** - Cotações de preço de fornecedores para insumos
10. **tarefas** - Tarefas do cronograma vinculadas à EAP com dependências e percentual de conclusão
11. **medicoes** - Medições de avanço físico e financeiro ao longo do tempo (para Curva S)

## Segurança
- RLS habilitado em todas as tabelas
- Políticas CRUD para anon+authenticated (single-tenant, dados compartilhados)
*/

-- ============================================================
-- 1. INSUMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  unidade text NOT NULL,
  custo_unitario numeric(12,2) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'Proprio' CHECK (origem IN ('SINAPI', 'Proprio')),
  tipo text NOT NULL DEFAULT 'material' CHECK (tipo IN ('material', 'mao_obra', 'equipamento', 'servico')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_insumos" ON insumos;
CREATE POLICY "anon_select_insumos" ON insumos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_insumos" ON insumos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_insumos" ON insumos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_insumos" ON insumos FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 2. COMPOSICOES (CPU)
-- ============================================================
CREATE TABLE IF NOT EXISTS composicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  unidade text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE composicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_composicoes" ON composicoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_composicoes" ON composicoes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_composicoes" ON composicoes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_composicoes" ON composicoes FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 3. COMPOSICAO_INSUMOS (ligação N:N)
-- ============================================================
CREATE TABLE IF NOT EXISTS composicao_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_id uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  coeficiente numeric(10,4) NOT NULL DEFAULT 1,
  UNIQUE(composicao_id, insumo_id)
);
ALTER TABLE composicao_insumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_composicao_insumos" ON composicao_insumos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_composicao_insumos" ON composicao_insumos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_composicao_insumos" ON composicao_insumos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_composicao_insumos" ON composicao_insumos FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 4. PROJETOS (OBRAS)
-- ============================================================
CREATE TABLE IF NOT EXISTS projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cliente text NOT NULL,
  endereco text,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('planejamento', 'em_andamento', 'pausado', 'concluido', 'cancelado')),
  data_inicio date,
  data_termino date,
  valor_contrato numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_projetos" ON projetos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_projetos" ON projetos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_projetos" ON projetos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_projetos" ON projetos FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 5. EAP_ITENS (Estrutura Analítica do Projeto - hierárquica)
-- ============================================================
CREATE TABLE IF NOT EXISTS eap_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES eap_itens(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  nivel int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE eap_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_eap_itens" ON eap_itens FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_eap_itens" ON eap_itens FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_eap_itens" ON eap_itens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_eap_itens" ON eap_itens FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 6. ORCAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  bdi_taxa numeric(5,2) NOT NULL DEFAULT 25.00,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado', 'revisao')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_orcamentos" ON orcamentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_orcamentos" ON orcamentos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_orcamentos" ON orcamentos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_orcamentos" ON orcamentos FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 7. ORCAMENTO_ITENS
-- ============================================================
CREATE TABLE IF NOT EXISTS orcamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  eap_item_id uuid REFERENCES eap_itens(id) ON DELETE SET NULL,
  composicao_id uuid REFERENCES composicoes(id) ON DELETE SET NULL,
  descricao text,
  quantidade numeric(12,2) NOT NULL DEFAULT 1,
  custo_unitario numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_orcamento_itens" ON orcamento_itens FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_orcamento_itens" ON orcamento_itens FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_orcamento_itens" ON orcamento_itens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_orcamento_itens" ON orcamento_itens FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 8. FORNECEDORES
-- ============================================================
CREATE TABLE IF NOT EXISTS fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  contato text,
  telefone text,
  email text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_fornecedores" ON fornecedores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_fornecedores" ON fornecedores FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_fornecedores" ON fornecedores FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_fornecedores" ON fornecedores FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 9. PROPOSTAS_FORNECEDOR (Equalização de Propostas)
-- ============================================================
CREATE TABLE IF NOT EXISTS propostas_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  preco numeric(12,2) NOT NULL DEFAULT 0,
  prazo_entrega text,
  data_cotacao date DEFAULT CURRENT_DATE,
  UNIQUE(insumo_id, fornecedor_id)
);
ALTER TABLE propostas_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_propostas" ON propostas_fornecedor FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_propostas" ON propostas_fornecedor FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_propostas" ON propostas_fornecedor FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_propostas" ON propostas_fornecedor FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 10. TAREFAS (Cronograma/Gantt)
-- ============================================================
CREATE TABLE IF NOT EXISTS tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  eap_item_id uuid REFERENCES eap_itens(id) ON DELETE SET NULL,
  nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  dependencia_id uuid REFERENCES tarefas(id) ON DELETE SET NULL,
  percentual_concluido numeric(5,2) NOT NULL DEFAULT 0 CHECK (percentual_concluido >= 0 AND percentual_concluido <= 100),
  valor_previsto numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_tarefas" ON tarefas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_tarefas" ON tarefas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_tarefas" ON tarefas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_tarefas" ON tarefas FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 11. MEDICOES (Curva S - avanço físico e financeiro ao longo do tempo)
-- ============================================================
CREATE TABLE IF NOT EXISTS medicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  tarefa_id uuid REFERENCES tarefas(id) ON DELETE SET NULL,
  data date NOT NULL,
  percentual_previsto numeric(5,2) DEFAULT 0,
  percentual_realizado numeric(5,2) DEFAULT 0,
  valor_previsto numeric(12,2) DEFAULT 0,
  valor_realizado numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE medicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_medicoes" ON medicoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_medicoes" ON medicoes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_medicoes" ON medicoes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_medicoes" ON medicoes FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_insumos_tipo ON insumos(tipo);
CREATE INDEX IF NOT EXISTS idx_composicao_insumos_comp ON composicao_insumos(composicao_id);
CREATE INDEX IF NOT EXISTS idx_composicao_insumos_insumo ON composicao_insumos(insumo_id);
CREATE INDEX IF NOT EXISTS idx_eap_projeto ON eap_itens(projeto_id);
CREATE INDEX IF NOT EXISTS idx_eap_parent ON eap_itens(parent_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orc ON orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_projeto ON tarefas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_medicoes_projeto ON medicoes(projeto_id);
CREATE INDEX IF NOT EXISTS idx_propostas_insumo ON propostas_fornecedor(insumo_id);
