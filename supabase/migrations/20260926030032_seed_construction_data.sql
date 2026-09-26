/*
# Seed Data - Reforma Residencial Completa

## Visão Geral
Popula o banco com dados fictícios de uma reforma residencial real: demolição, alvenaria, revestimento, pintura, instalações elétricas e hidráulicas.

## Dados Inseridos
1. Insumos (~30 insumos SINAPI e próprios)
2. Composições (CPU) com insumos vinculados
3. Projeto - Reforma Apartamento Residencial
4. EAP - Estrutura hierárquica com 3 níveis
5. Orçamento com BDI 25%
6. Orçamento Itens vinculando EAP + composições
7. Fornecedores (3) para equalização
8. Propostas de fornecedores para insumos chave
9. Tarefas com dependências
10. Medições para Curva S (12 semanas)
*/

-- ============================================================
-- 1. INSUMOS
-- ============================================================
INSERT INTO insumos (codigo, nome, unidade, custo_unitario, origem, tipo) VALUES
('MAT001', 'Cimento CP II-32', 'saco 50kg', 28.50, 'SINAPI', 'material'),
('MAT002', 'Areia média lavada', 'm³', 95.00, 'SINAPI', 'material'),
('MAT003', 'Brita 19mm', 'm³', 110.00, 'SINAPI', 'material'),
('MAT004', 'Argamassa colante AC-III', 'saco 20kg', 32.00, 'SINAPI', 'material'),
('MAT005', 'Rejunte epoxy cinza', 'kg', 18.00, 'SINAPI', 'material'),
('MAT006', 'Porcelanato 60x60 retificado', 'm²', 89.90, 'Proprio', 'material'),
('MAT007', 'Tinta acrílica fosca branca', 'galão 18L', 145.00, 'SINAPI', 'material'),
('MAT008', 'Massa corrida', 'balde 25kg', 65.00, 'SINAPI', 'material'),
('MAT009', 'Fita crepe 50mm', 'rolo', 12.50, 'SINAPI', 'material'),
('MAT010', 'Gesso acartonado 12.5mm', 'm²', 38.00, 'SINAPI', 'material'),
('MAT011', 'Perfil galvanizado 60mm', 'm', 14.00, 'SINAPI', 'material'),
('MAT012', 'Conduíte corrugado 25mm', 'm', 4.50, 'SINAPI', 'material'),
('MAT013', 'Fio 2.5mm² cobre', 'm', 3.80, 'SINAPI', 'material'),
('MAT014', 'Tomada 2P+T', 'un', 18.00, 'SINAPI', 'material'),
('MAT015', 'Interruptor simples', 'un', 12.00, 'SINAPI', 'material'),
('MAT016', 'Tubo PVC 25mm', 'm', 8.50, 'SINAPI', 'material'),
('MAT017', 'Registro esfera 1/2', 'un', 35.00, 'SINAPI', 'material'),
('MAT018', 'Caixa de passagem 4x4', 'un', 6.50, 'SINAPI', 'material'),
('MAT019', 'Lona plástica 4m', 'rolo', 55.00, 'Proprio', 'material'),
('MAT020', 'Saco de lixo reforçado 100L', 'un', 3.50, 'Proprio', 'material'),
('MO001', 'Pedreiro', 'dia', 180.00, 'SINAPI', 'mao_obra'),
('MO002', 'Servente', 'dia', 120.00, 'SINAPI', 'mao_obra'),
('MO003', 'Pintor', 'dia', 200.00, 'SINAPI', 'mao_obra'),
('MO004', 'Eletricista', 'dia', 220.00, 'SINAPI', 'mao_obra'),
('MO005', 'Encanador', 'dia', 210.00, 'SINAPI', 'mao_obra'),
('MO006', 'Azulejista/Revestidor', 'dia', 190.00, 'SINAPI', 'mao_obra'),
('MO007', 'Demolidor', 'dia', 150.00, 'SINAPI', 'mao_obra'),
('EQ001', 'Martelo demolidor elétrico', 'dia', 85.00, 'Proprio', 'equipamento'),
('EQ002', 'Betoneira 400L', 'dia', 65.00, 'Proprio', 'equipamento'),
('EQ003', 'Cortadora de porcelanato', 'dia', 45.00, 'Proprio', 'equipamento'),
('EQ004', 'Andaime metálico', 'm²', 8.00, 'Proprio', 'equipamento'),
('EQ005', 'Caminhão basculante 5m³', 'viagem', 380.00, 'Proprio', 'equipamento')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- 2. COMPOSICOES
-- ============================================================
INSERT INTO composicoes (codigo, nome, unidade) VALUES
('CPU001', 'Demolição de alvenaria de tijolo', 'm²'),
('CPU002', 'Emboço/reboco de parede', 'm²'),
('CPU003', 'Assentamento de porcelanato 60x60', 'm²'),
('CPU004', 'Pintura acrílica 2 demãos', 'm²'),
('CPU005', 'Instalação elétrica embutida', 'ponto'),
('CPU006', 'Instalação hidráulica PVC', 'ponto'),
('CPU007', 'Regularização de piso cimentado', 'm²'),
('CPU008', 'Forro de gesso acartonado', 'm²')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- 3. COMPOSICAO_INSUMOS
-- ============================================================
INSERT INTO composicao_insumos (composicao_id, insumo_id, coeficiente)
SELECT c.id, i.id, CASE
  WHEN c.codigo = 'CPU001' AND i.codigo = 'MO007' THEN 0.05
  WHEN c.codigo = 'CPU001' AND i.codigo = 'EQ001' THEN 0.03
  WHEN c.codigo = 'CPU001' AND i.codigo = 'MAT019' THEN 0.10
  WHEN c.codigo = 'CPU001' AND i.codigo = 'MAT020' THEN 0.05
  WHEN c.codigo = 'CPU001' AND i.codigo = 'EQ005' THEN 0.01
  WHEN c.codigo = 'CPU002' AND i.codigo = 'MAT001' THEN 0.20
  WHEN c.codigo = 'CPU002' AND i.codigo = 'MAT002' THEN 0.03
  WHEN c.codigo = 'CPU002' AND i.codigo = 'MO001' THEN 0.05
  WHEN c.codigo = 'CPU002' AND i.codigo = 'MO002' THEN 0.05
  WHEN c.codigo = 'CPU003' AND i.codigo = 'MAT006' THEN 1.05
  WHEN c.codigo = 'CPU003' AND i.codigo = 'MAT004' THEN 0.20
  WHEN c.codigo = 'CPU003' AND i.codigo = 'MAT005' THEN 0.15
  WHEN c.codigo = 'CPU003' AND i.codigo = 'MO006' THEN 0.10
  WHEN c.codigo = 'CPU003' AND i.codigo = 'EQ003' THEN 0.02
  WHEN c.codigo = 'CPU004' AND i.codigo = 'MAT007' THEN 0.05
  WHEN c.codigo = 'CPU004' AND i.codigo = 'MAT008' THEN 0.08
  WHEN c.codigo = 'CPU004' AND i.codigo = 'MAT009' THEN 0.02
  WHEN c.codigo = 'CPU004' AND i.codigo = 'MO003' THEN 0.04
  WHEN c.codigo = 'CPU005' AND i.codigo = 'MAT012' THEN 2.5
  WHEN c.codigo = 'CPU005' AND i.codigo = 'MAT013' THEN 5.0
  WHEN c.codigo = 'CPU005' AND i.codigo = 'MAT014' THEN 1.0
  WHEN c.codigo = 'CPU005' AND i.codigo = 'MAT015' THEN 1.0
  WHEN c.codigo = 'CPU005' AND i.codigo = 'MAT018' THEN 1.0
  WHEN c.codigo = 'CPU005' AND i.codigo = 'MO004' THEN 0.20
  WHEN c.codigo = 'CPU006' AND i.codigo = 'MAT016' THEN 3.0
  WHEN c.codigo = 'CPU006' AND i.codigo = 'MAT017' THEN 1.0
  WHEN c.codigo = 'CPU006' AND i.codigo = 'MO005' THEN 0.25
  WHEN c.codigo = 'CPU007' AND i.codigo = 'MAT001' THEN 0.25
  WHEN c.codigo = 'CPU007' AND i.codigo = 'MAT002' THEN 0.04
  WHEN c.codigo = 'CPU007' AND i.codigo = 'MAT003' THEN 0.02
  WHEN c.codigo = 'CPU007' AND i.codigo = 'MO002' THEN 0.06
  WHEN c.codigo = 'CPU007' AND i.codigo = 'EQ002' THEN 0.02
  WHEN c.codigo = 'CPU008' AND i.codigo = 'MAT010' THEN 1.0
  WHEN c.codigo = 'CPU008' AND i.codigo = 'MAT011' THEN 2.5
  WHEN c.codigo = 'CPU008' AND i.codigo = 'MO001' THEN 0.08
  WHEN c.codigo = 'CPU008' AND i.codigo = 'MO002' THEN 0.04
END
FROM composicoes c, insumos i
WHERE (c.codigo, i.codigo) IN (
  ('CPU001','MO007'),('CPU001','EQ001'),('CPU001','MAT019'),('CPU001','MAT020'),('CPU001','EQ005'),
  ('CPU002','MAT001'),('CPU002','MAT002'),('CPU002','MO001'),('CPU002','MO002'),
  ('CPU003','MAT006'),('CPU003','MAT004'),('CPU003','MAT005'),('CPU003','MO006'),('CPU003','EQ003'),
  ('CPU004','MAT007'),('CPU004','MAT008'),('CPU004','MAT009'),('CPU004','MO003'),
  ('CPU005','MAT012'),('CPU005','MAT013'),('CPU005','MAT014'),('CPU005','MAT015'),('CPU005','MAT018'),('CPU005','MO004'),
  ('CPU006','MAT016'),('CPU006','MAT017'),('CPU006','MO005'),
  ('CPU007','MAT001'),('CPU007','MAT002'),('CPU007','MAT003'),('CPU007','MO002'),('CPU007','EQ002'),
  ('CPU008','MAT010'),('CPU008','MAT011'),('CPU008','MO001'),('CPU008','MO002')
)
ON CONFLICT (composicao_id, insumo_id) DO NOTHING;

-- ============================================================
-- 4. PROJETO
-- ============================================================
INSERT INTO projetos (nome, cliente, endereco, status, data_inicio, data_termino, valor_contrato)
SELECT 'Reforma Apartamento Residencial - Edifício Vista Mar', 'Família Carvalho', 'Rua das Palmeiras, 450 - Apto 1202 - São Paulo/SP', 'em_andamento', '2026-10-01', '2026-12-15', 185000.00
WHERE NOT EXISTS (SELECT 1 FROM projetos WHERE nome LIKE 'Reforma Apartamento%');

-- ============================================================
-- 5. EAP
-- ============================================================
DO $$
DECLARE
  v_projeto_id uuid;
  v_infra uuid; v_sup uuid; v_pintura uuid; v_elet uuid; v_hid uuid;
  v_dem uuid; v_alv uuid; v_reg uuid; v_rev uuid; v_forro uuid; v_pintura_parede uuid;
  v_elet_ponto uuid; v_hid_ponto uuid;
BEGIN
  SELECT id INTO v_projeto_id FROM projetos WHERE nome LIKE 'Reforma Apartamento%' LIMIT 1;

  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, NULL, '1', 'Infraestrutura e Demolição', 1) RETURNING id INTO v_infra;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, NULL, '2', 'Estrutura e Alvenaria', 1) RETURNING id INTO v_sup;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, NULL, '3', 'Revestimentos e Acabamentos', 1) RETURNING id INTO v_pintura;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, NULL, '4', 'Instalações Elétricas', 1) RETURNING id INTO v_elet;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, NULL, '5', 'Instalações Hidráulicas', 1) RETURNING id INTO v_hid;

  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_infra, '1.1', 'Demolição de paredes', 2) RETURNING id INTO v_dem;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_infra, '1.2', 'Remoção de entulho', 2);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_sup, '2.1', 'Alvenaria nova', 2) RETURNING id INTO v_alv;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_sup, '2.2', 'Emboço e reboco', 2);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_pintura, '3.1', 'Regularização de piso', 2) RETURNING id INTO v_reg;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_pintura, '3.2', 'Assentamento de porcelanato', 2) RETURNING id INTO v_rev;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_pintura, '3.3', 'Forro de gesso', 2) RETURNING id INTO v_forro;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_pintura, '3.4', 'Pintura geral', 2) RETURNING id INTO v_pintura_parede;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_elet, '4.1', 'Pontos elétricos embutidos', 2) RETURNING id INTO v_elet_ponto;
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_hid, '5.1', 'Pontos hidráulicos PVC', 2) RETURNING id INTO v_hid_ponto;

  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_dem, '1.1.1', 'Demolição de alvenaria de tijolo - 45m²', 3);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_alv, '2.1.1', 'Elevação de alvenaria nova - 20m²', 3);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_reg, '3.1.1', 'Regularização de piso cimentado - 80m²', 3);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_rev, '3.2.1', 'Assentamento porcelanato 60x60 - 80m²', 3);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_forro, '3.3.1', 'Forro de gesso acartonado - 120m²', 3);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_pintura_parede, '3.4.1', 'Pintura acrílica 2 demãos - 250m²', 3);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_elet_ponto, '4.1.1', 'Instalação elétrica embutida - 35 pontos', 3);
  INSERT INTO eap_itens (projeto_id, parent_id, codigo, nome, nivel)
  VALUES (v_projeto_id, v_hid_ponto, '5.1.1', 'Instalação hidráulica PVC - 18 pontos', 3);
END $$;

-- ============================================================
-- 6. ORCAMENTO
-- ============================================================
DO $$
DECLARE
  v_projeto_id uuid;
BEGIN
  SELECT id INTO v_projeto_id FROM projetos WHERE nome LIKE 'Reforma Apartamento%' LIMIT 1;
  INSERT INTO orcamentos (projeto_id, nome, bdi_taxa, status)
  VALUES (v_projeto_id, 'Orçamento Principal - Reforma Vista Mar', 25.00, 'aprovado');
END $$;

-- ============================================================
-- 7. ORCAMENTO_ITENS
-- ============================================================
INSERT INTO orcamento_itens (orcamento_id, eap_item_id, composicao_id, descricao, quantidade, custo_unitario)
SELECT o.id, e.id, c.id, e.nome,
  CASE e.codigo
    WHEN '1.1.1' THEN 45 WHEN '2.1.1' THEN 20 WHEN '3.1.1' THEN 80
    WHEN '3.2.1' THEN 80 WHEN '3.3.1' THEN 120 WHEN '3.4.1' THEN 250
    WHEN '4.1.1' THEN 35 WHEN '5.1.1' THEN 18
  END,
  CASE e.codigo
    WHEN '1.1.1' THEN 32.50 WHEN '2.1.1' THEN 85.00 WHEN '3.1.1' THEN 45.00
    WHEN '3.2.1' THEN 145.00 WHEN '3.3.1' THEN 75.00 WHEN '3.4.1' THEN 28.50
    WHEN '4.1.1' THEN 55.00 WHEN '5.1.1' THEN 95.00
  END
FROM orcamentos o
JOIN eap_itens e ON e.projeto_id = o.projeto_id AND e.nivel = 3
JOIN composicoes c ON (
  (e.codigo = '1.1.1' AND c.codigo = 'CPU001') OR
  (e.codigo = '2.1.1' AND c.codigo = 'CPU002') OR
  (e.codigo = '3.1.1' AND c.codigo = 'CPU007') OR
  (e.codigo = '3.2.1' AND c.codigo = 'CPU003') OR
  (e.codigo = '3.3.1' AND c.codigo = 'CPU008') OR
  (e.codigo = '3.4.1' AND c.codigo = 'CPU004') OR
  (e.codigo = '4.1.1' AND c.codigo = 'CPU005') OR
  (e.codigo = '5.1.1' AND c.codigo = 'CPU006')
)
WHERE o.nome LIKE 'Orçamento Principal%';

-- ============================================================
-- 8. FORNECEDORES
-- ============================================================
INSERT INTO fornecedores (nome, contato, telefone, email) VALUES
('Casa do Construtor Ltda', 'João Mendes', '(11) 3456-7890', 'vendas@casadoconstrutor.com.br'),
('Material de Obra SP', 'Carlos Ferreira', '(11) 2345-6789', 'orcamento@materialdeobra.com.br'),
('Distribuidora Técnica Civil', 'Mariana Souza', '(11) 4567-8901', 'comercial@distribuidoratecnica.com.br')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. PROPOSTAS_FORNECEDOR
-- ============================================================
INSERT INTO propostas_fornecedor (insumo_id, fornecedor_id, preco, prazo_entrega)
SELECT i.id, f.id, CASE
  WHEN i.codigo = 'MAT001' AND f.nome = 'Casa do Construtor Ltda' THEN 28.50
  WHEN i.codigo = 'MAT001' AND f.nome = 'Material de Obra SP' THEN 26.90
  WHEN i.codigo = 'MAT001' AND f.nome = 'Distribuidora Técnica Civil' THEN 29.80
  WHEN i.codigo = 'MAT006' AND f.nome = 'Casa do Construtor Ltda' THEN 89.90
  WHEN i.codigo = 'MAT006' AND f.nome = 'Material de Obra SP' THEN 82.50
  WHEN i.codigo = 'MAT006' AND f.nome = 'Distribuidora Técnica Civil' THEN 95.00
  WHEN i.codigo = 'MAT007' AND f.nome = 'Casa do Construtor Ltda' THEN 145.00
  WHEN i.codigo = 'MAT007' AND f.nome = 'Material de Obra SP' THEN 138.00
  WHEN i.codigo = 'MAT007' AND f.nome = 'Distribuidora Técnica Civil' THEN 152.00
  WHEN i.codigo = 'MAT004' AND f.nome = 'Casa do Construtor Ltda' THEN 32.00
  WHEN i.codigo = 'MAT004' AND f.nome = 'Material de Obra SP' THEN 29.50
  WHEN i.codigo = 'MAT004' AND f.nome = 'Distribuidora Técnica Civil' THEN 34.00
  WHEN i.codigo = 'MAT010' AND f.nome = 'Casa do Construtor Ltda' THEN 38.00
  WHEN i.codigo = 'MAT010' AND f.nome = 'Material de Obra SP' THEN 35.50
  WHEN i.codigo = 'MAT010' AND f.nome = 'Distribuidora Técnica Civil' THEN 41.00
END,
CASE f.nome
  WHEN 'Casa do Construtor Ltda' THEN '3 dias'
  WHEN 'Material de Obra SP' THEN '5 dias'
  WHEN 'Distribuidora Técnica Civil' THEN '2 dias'
END
FROM insumos i
CROSS JOIN fornecedores f
WHERE (i.codigo, f.nome) IN (
  ('MAT001','Casa do Construtor Ltda'),('MAT001','Material de Obra SP'),('MAT001','Distribuidora Técnica Civil'),
  ('MAT006','Casa do Construtor Ltda'),('MAT006','Material de Obra SP'),('MAT006','Distribuidora Técnica Civil'),
  ('MAT007','Casa do Construtor Ltda'),('MAT007','Material de Obra SP'),('MAT007','Distribuidora Técnica Civil'),
  ('MAT004','Casa do Construtor Ltda'),('MAT004','Material de Obra SP'),('MAT004','Distribuidora Técnica Civil'),
  ('MAT010','Casa do Construtor Ltda'),('MAT010','Material de Obra SP'),('MAT010','Distribuidora Técnica Civil')
)
ON CONFLICT (insumo_id, fornecedor_id) DO NOTHING;

-- ============================================================
-- 10. TAREFAS
-- ============================================================
DO $$
DECLARE
  v_projeto_id uuid;
  v_t_dem uuid; v_t_ent uuid; v_t_alv uuid; v_t_emb uuid; v_t_reg uuid;
  v_t_por uuid; v_t_forro uuid; v_t_pint uuid; v_t_elet uuid; v_t_hid uuid;
  v_eap_dem uuid; v_eap_alv uuid; v_eap_reg uuid; v_eap_rev uuid;
  v_eap_forro uuid; v_eap_pint uuid; v_eap_elet uuid; v_eap_hid uuid;
BEGIN
  SELECT id INTO v_projeto_id FROM projetos WHERE nome LIKE 'Reforma Apartamento%' LIMIT 1;
  SELECT id INTO v_eap_dem FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '1.1.1';
  SELECT id INTO v_eap_alv FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '2.1.1';
  SELECT id INTO v_eap_reg FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '3.1.1';
  SELECT id INTO v_eap_rev FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '3.2.1';
  SELECT id INTO v_eap_forro FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '3.3.1';
  SELECT id INTO v_eap_pint FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '3.4.1';
  SELECT id INTO v_eap_elet FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '4.1.1';
  SELECT id INTO v_eap_hid FROM eap_itens WHERE projeto_id = v_projeto_id AND codigo = '5.1.1';

  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_dem, 'Demolição de alvenaria', '2026-10-01', '2026-10-05', 100, 1462.50)
  RETURNING id INTO v_t_dem;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, NULL, 'Remoção de entulho', '2026-10-04', '2026-10-08', 100, 1140.00)
  RETURNING id INTO v_t_ent;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_alv, 'Alvenaria nova + emboço', '2026-10-09', '2026-10-20', 100, 3400.00)
  RETURNING id INTO v_t_alv;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, NULL, 'Emboço e reboco', '2026-10-18', '2026-10-25', 85, 0)
  RETURNING id INTO v_t_emb;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_hid, 'Instalação hidráulica', '2026-10-10', '2026-10-18', 100, 1710.00)
  RETURNING id INTO v_t_hid;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_elet, 'Instalação elétrica embutida', '2026-10-12', '2026-10-22', 90, 1925.00)
  RETURNING id INTO v_t_elet;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_reg, 'Regularização de piso', '2026-10-26', '2026-11-02', 40, 3600.00)
  RETURNING id INTO v_t_reg;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_rev, 'Assentamento porcelanato', '2026-11-03', '2026-11-15', 0, 11600.00)
  RETURNING id INTO v_t_por;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_forro, 'Forro de gesso', '2026-11-10', '2026-11-18', 0, 9000.00)
  RETURNING id INTO v_t_forro;
  INSERT INTO tarefas (projeto_id, eap_item_id, nome, data_inicio, data_fim, percentual_concluido, valor_previsto)
  VALUES (v_projeto_id, v_eap_pint, 'Pintura geral', '2026-11-16', '2026-11-30', 0, 7125.00)
  RETURNING id INTO v_t_pint;

  UPDATE tarefas SET dependencia_id = v_t_dem WHERE id = v_t_ent;
  UPDATE tarefas SET dependencia_id = v_t_ent WHERE id = v_t_alv;
  UPDATE tarefas SET dependencia_id = v_t_alv WHERE id = v_t_emb;
  UPDATE tarefas SET dependencia_id = v_t_emb WHERE id = v_t_reg;
  UPDATE tarefas SET dependencia_id = v_t_reg WHERE id = v_t_por;
  UPDATE tarefas SET dependencia_id = v_t_por WHERE id = v_t_forro;
  UPDATE tarefas SET dependencia_id = v_t_forro WHERE id = v_t_pint;
  UPDATE tarefas SET dependencia_id = v_t_alv WHERE id = v_t_hid;
  UPDATE tarefas SET dependencia_id = v_t_alv WHERE id = v_t_elet;
END $$;

-- ============================================================
-- 11. MEDICOES (Curva S)
-- ============================================================
DO $$
DECLARE
  v_projeto_id uuid;
BEGIN
  SELECT id INTO v_projeto_id FROM projetos WHERE nome LIKE 'Reforma Apartamento%' LIMIT 1;
  INSERT INTO medicoes (projeto_id, data, percentual_previsto, percentual_realizado, valor_previsto, valor_realizado)
  VALUES
  (v_projeto_id, '2026-10-01', 5, 3, 9250, 5550),
  (v_projeto_id, '2026-10-08', 12, 8, 22200, 14800),
  (v_projeto_id, '2026-10-15', 22, 18, 40700, 33300),
  (v_projeto_id, '2026-10-22', 35, 30, 64750, 55500),
  (v_projeto_id, '2026-10-29', 45, 38, 83250, 70300),
  (v_projeto_id, '2026-11-05', 58, 45, 107300, 83250),
  (v_projeto_id, '2026-11-12', 72, 52, 133200, 96200),
  (v_projeto_id, '2026-11-19', 85, 58, 157250, 107300),
  (v_projeto_id, '2026-11-26', 95, 62, 175750, 114700),
  (v_projeto_id, '2026-12-03', 100, 65, 185000, 120250),
  (v_projeto_id, '2026-12-10', 100, 68, 185000, 125800),
  (v_projeto_id, '2026-12-15', 100, 70, 185000, 129500);
END $$;
