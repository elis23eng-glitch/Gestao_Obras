# BuildManager - Gestão de Obras e Orçamentos

Sistema de gestão de obras para construção civil, com orçamentação (EAP + BDI), cronograma (Gantt), diário de obra, banco de insumos/composições e dashboard de indicadores.

## Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + Vite
- **Backend:** Supabase (Postgres, Auth, RLS)
- **Ícones:** lucide-react

## Funcionalidades

### Autenticação e Permissões (RBAC)

Login real com Supabase Auth (email/senha). Três perfis com permissões differentes:

| Perfil | Acesso |
|--------|--------|
| **Admin** | Gestão de usuários, obras, orçamentos, BDI, todas as telas |
| **Engenheiro** | Orçamentos, cronogramas, insumos, diário. Não altera BDI nem gerencia usuários |
| **Mestre** | Consulta cronograma, registra avanço e diário. Sem acesso a custos, BDI ou margens |

As permissões são enforced no banco de dados via RLS policies e funções SECURITY DEFINER, não apenas na interface.

### Módulos

- **Dashboard:** Indicadores da obra selecionada (custo direto, BDI, preço de venda, avanço físico, curva S, desvio)
- **Obras:** Cadastro e listagem de obras
- **Orçamentos:** EAP + composições + BDI com cálculo centralizado
- **Planejamento:** Cronograma Gantt com dependências e controle de avanço
- **Banco de Insumos:** Insumos, composições (CPU) e equalização de propostas
- **Diário de Obra:** Registros diários com identificação do responsável
- **Assistente:** Resumo automático baseado em consultas reais aos dados da obra

### Cálculos Centralizados

Todas as fórmulas financeiras e de cronograma estão em `src/lib/calc.ts`:

- `custoComposicao(insumos)` = Σ(coeficiente × custo_unitario)
- `custoDireto(itens)` = Σ(quantidade × custo_unitario)
- `valorBdi(custoDireto, taxa)` = custoDireto × taxa / 100
- `precoVenda(custoDireto, taxa)` = custoDireto + valorBdi
- `ganttPosition(start, windowStart, windowDays)` = offset / windowDays × 100
- `ganttWidth(start, end, windowDays)` = duration / windowDays × 100
- `avançoFisico(tarefas)` = média ponderada por valor_previsto (ou média simples)
- `parseBR("1.234,56")` = 1234.56 (decimal brasileiro)

## Configuração

### Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```
VITE_SUPABASE_URL=sua-url-do-supabase
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

### Migrações do Banco

As migrações estão em `supabase/migrations/` e devem ser aplicadas na ordem:

1. `20260926025850_create_construction_management_schema.sql` — schema base
2. `20260926030032_seed_construction_data.sql` — dados de demonstração
3. `20260926030945_add_rbac_usuarios_diario.sql` — RBAC inicial
4. `20260928173642_20260928010000_auth_rbac_project_access.sql` — auth real, RLS por acesso, audit log

### Primeiro Administrador

Para configurar o primeiro admin:

1. Crie uma conta via a tela de login (modo "Criar Conta")
2. Acesse o banco de dados via Supabase Studio ou SQL
3. Vincule o auth_user_id ao perfil existente ou crie um novo:

```sql
-- Se já existe um usuário admin na tabela usuarios:
UPDATE usuarios SET auth_user_id = '<uuid-do-auth-users>'
WHERE email = 'seu@email.com';

-- Ou crie um novo:
INSERT INTO usuarios (nome, email, cargo, auth_user_id)
VALUES ('Admin', 'seu@email.com', 'admin', '<uuid-do-auth-users>');
```

4. Associe obras ao admin:

```sql
INSERT INTO projeto_usuarios (projeto_id, usuario_id)
SELECT p.id, u.id FROM projetos p, usuarios u
WHERE u.email = 'seu@email.com';
```

## Scripts

```bash
npm run dev        # Servidor de desenvolvimento
npm run build      # Build de produção
npm run preview    # Preview do build
npm run typecheck  # Verificação de tipos TypeScript
npm run lint       # ESLint
```

## Importação e Exportação

### Importação de Insumos (CSV)

Na aba "Importar/Exportar", é possível importar insumos em massa via arquivo CSV.

- **Modelo:** `codigo;nome;unidade;custo_unitario;tipo` (tipos: material, mao_obra, equipamento, servico)
- **Vírgula decimal:** use vírgula (ex: `28,50`), não ponto
- **Prévia:** todos os dados são validados antes de gravar (códigos duplicados, valores inválidos, tipos inválidos)
- **Relatório de erros:** cada linha com problema é exibida com a mensagem específica
- **Confirmação:** nada é gravado até o usuário confirmar; falhas em linhas individuais não afetam as demais
- Baixe o modelo pelo botão "Baixar Modelo"

### Exportação de Orçamento

- **CSV (Excel):** exporta EAP, composições, descrições, quantidades, custos, BDI e totais com vírgula decimal
- **PDF (HTML imprimível):** gera documento HTML formatado que pode ser impresso como PDF (Ctrl+P no navegador)
- Ambos incluem identificação da obra, cliente, data, versão do orçamento e os mesmos valores e arredondamentos usados na aplicação

### Reagendamento por Dependências

Na aba "Planejamento", conflitos de datas entre tarefas e suas dependências são detectados automaticamente. O usuário pode:
- Visualizar todos os conflitos com detalhes (tarefa, datas, dependência)
- Reagendar automaticamente: o início da tarefa é ajustado para o dia seguinte do término da dependência, preservando a duração original
- Reagendar todas de uma vez com o botão "Reagendar Todas"

## Bootstrap do Primeiro Administrador

Quando o primeiro usuário autentica e ainda não tem perfil vinculado, a tela oferece um botão "Tornar-se Administrador". Esse botão chama a função `bootstrap_first_admin()` no banco, que:

1. Verifica se já existe algum admin. Se sim, recusa.
2. Se não há admin, vincula o usuário autenticado como admin (cria ou promove o perfil).

Isso impede autoelevação pública após o primeiro admin estar configurado.

## Limitações

- O assistente é baseado em regras (consultas ao banco), não em modelo de IA externo
- Dados de demonstração (seed) não devem ser tratados como valores reais de mercado
- SINAPI: preços demonstrativos, não são base oficial atualizada
- Importação de Excel (.xlsx) com múltiplas abas não é suportada; use CSV
- Macros e fórmulas de planilhas não são executadas na importação
