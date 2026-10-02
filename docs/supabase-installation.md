# Instalação Supabase — Gestão de Obras

Projeto: `eflgkfjcmlrrxwbvryxl`
URL pública: https://eflgkfjcmlrrxwbvryxl.supabase.co
Data: 02/10/2026

## Histórico aplicado

- `create_construction_management_schema`: estrutura base.
- `seed_construction_data`: dados de demonstração (uma obra).
- `secure_rbac_auth_and_first_access`: equivale às migrações locais 20260926030945, 20260928173642, 20260929225100 e 20261002035726 em uma única transação. As políticas anônimas permissivas da migração antiga de RBAC foram removidas antes da execução.
- `restrict_internal_trigger_execution`: revoga execução direta das funções internas audit_changes e rls_auto_enable pelos clientes.

Não reaplique as migrações locais acima neste projeto: seu conteúdo já está instalado, embora os nomes no histórico remoto sejam diferentes. Antes de usar db push, reconcilie o histórico do CLI com a instalação consolidada; não execute o seed novamente em dados reais.

## Verificação

15 tabelas públicas com RLS habilitada; zero políticas públicas/anônimas; três views operacionais para o mestre; bootstrap não executável por anon. Os testes locais de segurança, TypeScript, lint e build passaram antes da instalação.

Os avisos sobre user_cargo, user_id_by_auth e user_has_project_access são helpers SECURITY DEFINER usados pelas políticas RLS, executáveis apenas por usuários autenticados; foram revisados para retorno restrito à identidade/acesso da sessão. Os testes de Auth e da Data API com contas reais ainda estão pendentes.

## Conectar o frontend

Configure VITE_SUPABASE_URL com a URL acima e VITE_SUPABASE_ANON_KEY com a chave pública publishable/anon do projeto. Nunca use chave secreta/service_role no frontend. Gere e publique um novo build após integrar o PR.

Crie sua conta na aplicação, confirme o e-mail e use Tornar-se Administrador no primeiro acesso. Na verificação inicial, auth.users estava vazio. Os perfis de demonstração não são contas de login.
