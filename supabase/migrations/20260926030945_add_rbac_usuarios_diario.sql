/*
# RBAC - Tabela de Usuários e Diário de Obra

## Visão Geral
Adiciona controle de níveis de acesso (RBAC) ao sistema com 3 perfis:
- Administrador / Diretor: acesso total
- Engenheiro de Planejamento: orçamentos, cronogramas, insumos (sem editar BDI)
- Mestre de Obras / Apontador: apenas cronograma de campo e diário de obra

## Tabelas Criadas
1. **usuarios** - Usuários do sistema com perfil (cargo), nome e email
2. **diario_obra** - Registro diário de ocorrências na obra (clima, equipe, observações)

## Segurança
- RLS habilitado, políticas anon+authenticated (single-tenant)
*/

CREATE TABLE IF NOT EXISTS usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  cargo text NOT NULL DEFAULT 'engenheiro' CHECK (cargo IN ('admin', 'engenheiro', 'mestre')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_usuarios" ON usuarios FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_usuarios" ON usuarios FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_usuarios" ON usuarios FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_usuarios" ON usuarios FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS diario_obra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  clima text,
  equipe text,
  ocorrencias text,
  impedimentos text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE diario_obra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_diario" ON diario_obra FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_diario" ON diario_obra FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_diario" ON diario_obra FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_diario" ON diario_obra FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_diario_projeto ON diario_obra(projeto_id);
CREATE INDEX IF NOT EXISTS idx_diario_data ON diario_obra(data);

-- Seed: 3 usuários, um por perfil
INSERT INTO usuarios (nome, email, cargo, ativo)
VALUES
  ('Carlos Diretor', 'carlos.diretor@buildmanager.com', 'admin', true),
  ('Ana Engenheira', 'ana.engenheira@buildmanager.com', 'engenheiro', true),
  ('José Mestre', 'jose.mestre@buildmanager.com', 'mestre', true)
ON CONFLICT DO NOTHING;

-- Seed: alguns registros de diário de obra
DO $$
DECLARE
  v_projeto_id uuid;
  v_mestre_id uuid;
  v_eng_id uuid;
BEGIN
  SELECT id INTO v_projeto_id FROM projetos WHERE nome LIKE 'Reforma Apartamento%' LIMIT 1;
  SELECT id INTO v_mestre_id FROM usuarios WHERE cargo = 'mestre' LIMIT 1;
  SELECT id INTO v_eng_id FROM usuarios WHERE cargo = 'engenheiro' LIMIT 1;

  INSERT INTO diario_obra (projeto_id, usuario_id, data, clima, equipe, ocorrencias, impedimentos)
  VALUES
  (v_projeto_id, v_mestre_id, '2026-10-01', 'Ensolarado, 28°C', '2 demolidores + 1 servente', 'Início da demolição da parede da sala. Remoção do reboco concluída.', 'Sem impedimentos'),
  (v_projeto_id, v_mestre_id, '2026-10-03', 'Nublado, 25°C', '2 demolidores + 1 servente', 'Demolição 80% concluída. Entulho acumulado no corredor.', 'Falta caminhão basculante agendado para amanhã'),
  (v_projeto_id, v_mestre_id, '2026-10-06', 'Chuva leve, 22°C', '1 pedreiro + 1 servente', 'Início da alvenaria nova na área da cozinha.', 'Chuva atrasou o início das atividades em 2h'),
  (v_projeto_id, v_eng_id, '2026-10-10', 'Ensolarado, 27°C', '1 encanador + 1 pedreiro', 'Instalação hidráulica iniciada. Tubulação PVC da cozinha concluída.', 'Sem impedimentos'),
  (v_projeto_id, v_mestre_id, '2026-10-15', 'Ensolarado, 30°C', '1 pedreiro + 1 servente + 1 encanador', 'Alvenaria concluída. Início do emboço. Hidráulica 70% concluída.', 'Faltam conexões para o banheiro social')
  ON CONFLICT DO NOTHING;
END $$;
