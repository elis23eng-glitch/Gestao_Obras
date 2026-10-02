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
5. `20260929225100_20260929010000_bootstrap_first_admin.sql` — primeiro acesso
6. `20261002035726_harden_rbac_and_first_access.sql` — proteção financeira, BDI, vinculação de perfis e obras

### Primeiro Administrador

1. Aplique todas as migrações antes de publicar o frontend.
2. Crie sua conta, confirme o e-mail e entre na aplicação.
3. Na tela "Perfil não vinculado", clique em "Tornar-se Administrador".

O primeiro administrador precisa de e-mail confirmado no Supabase Auth. Perfis
fictícios sem `auth_user_id` não bloqueiam a configuração; um administrador já
vinculado bloqueia novas promoções. As chamadas de primeiro acesso são
serializadas no banco. Se o administrador estiver desativado, sua recuperação
precisa ser feita pelo responsável pelo banco; o bootstrap não reabre.

Depois, o administrador pode cadastrar perfis na tabela `usuarios` com o e-mail
e cargo corretos. Ao entrar com esse e-mail confirmado, o usuário é vinculado
pela função `link_my_profile()`. O cliente não pode alterar seu cargo, identidade
ou estado de ativação. Associações de acesso continuam em `projeto_usuarios`.
Obras criadas na aplicação são automaticamente vinculadas a seu criador.

### Atualizar uma instalação existente

Aplique **somente as migrações pendentes**, incluindo a sexta migração acima,
antes de publicar esta versão. Não execute novamente o seed em um banco com
dados reais. A migração preserva os dados e vínculos existentes.

Use o fluxo de migrações do Supabase CLI no projeto vinculado ou execute o SQL
da migração pendente pelo SQL Editor do projeto correto. Configure
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ambiente de publicação e gere
um novo build. A chave deve ser pública (publishable/anon), nunca `service_role`.

### Permissões garantidas no banco

- Administrador: acesso completo, inclusive definição do BDI.
- Engenheiro: dados financeiros e alterações de orçamento/cronograma nas obras
  vinculadas; novos orçamentos usam o BDI padrão de 25%, ajustável pelo admin.
- Mestre: dados operacionais das obras vinculadas pelas views `projetos_mestre`
  e `tarefas_mestre`; sem valores de contrato, custos, BDI ou valores de tarefas.
  O progresso é salvo exclusivamente pela RPC `update_task_progress`.
- Perfis desativados e contas sem perfil ativo não recebem acesso às obras.

As views são `security_invoker`. Seus leitores privados usam permissões
restritas, validam a identidade e o acesso à obra e retornam apenas as colunas
operacionais. O valor previsto da tarefa é substituído por zero nessa leitura,
portanto o avanço mostrado para o mestre é calculado sem pesos financeiros.
O schema `private` deve permanecer fora dos schemas expostos pela Data API.

## Scripts

```bash
npm run dev        # Servidor de desenvolvimento
npm run build      # Build de produção
npm run preview    # Preview do build
npm run typecheck  # Verificação de tipos TypeScript
npm run lint       # ESLint
npm test           # Regressões de permissões e migrações em PostgreSQL isolado
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

## Validação automatizada

O GitHub Actions usa Node.js 22 e executa instalação pelo lockfile, lint sem
avisos, TypeScript, testes de segurança e build. `npm test` cria um banco
PostgreSQL isolado com PGlite, aplica todas as migrações e verifica permissões
permitidas e negadas, bootstrap, BDI, vínculos e auditoria. Os testes não se
conectam ao Supabase de produção nem substituem a validação do Auth e da Data API
no ambiente publicado.

## Limitações

- O assistente é baseado em regras (consultas ao banco), não em modelo de IA externo
- Dados de demonstração (seed) não devem ser tratados como valores reais de mercado
- SINAPI: preços demonstrativos, não são base oficial atualizada
- Importação de Excel (.xlsx) com múltiplas abas não é suportada; use CSV
- Macros e fórmulas de planilhas não são executadas na importação
