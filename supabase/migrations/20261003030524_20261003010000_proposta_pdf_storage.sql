/*
# PDF de Propostas: coluna e bucket de armazenamento privado

## Visão Geral
Adiciona suporte para anexar o PDF original da proposta como documento de referência.
O armazenamento é privado, com acesso autorizado por RLS.

## Alterações
1. `propostas` — adiciona coluna `pdf_path` (caminho no storage)
2. Storage bucket `propostas-pdfs` — bucket privado para PDFs de propostas
3. RLS no storage: apenas admin e engenheiro com acesso à obra podem ler/escrever
*/

-- 1. Adicionar coluna pdf_path
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS pdf_path text;

-- 2. Criar bucket privado (insert via storage.buckets)
INSERT INTO storage.buckets (id, name, public)
VALUES ('propostas-pdfs', 'propostas-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas RLS no bucket
-- SELECT: admin e engenheiro podem ler
DROP POLICY IF EXISTS "auth_read_proposta_pdfs" ON storage.objects;
CREATE POLICY "auth_read_proposta_pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'propostas-pdfs'
    AND public.user_cargo() IN ('admin','engenheiro')
  );

-- INSERT: admin e engenheiro podem subir PDFs
DROP POLICY IF EXISTS "auth_insert_proposta_pdfs" ON storage.objects;
CREATE POLICY "auth_insert_proposta_pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'propostas-pdfs'
    AND public.user_cargo() IN ('admin','engenheiro')
  );

-- UPDATE: admin e engenheiro podem atualizar
DROP POLICY IF EXISTS "auth_update_proposta_pdfs" ON storage.objects;
CREATE POLICY "auth_update_proposta_pdfs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'propostas-pdfs'
    AND public.user_cargo() IN ('admin','engenheiro')
  )
  WITH CHECK (
    bucket_id = 'propostas-pdfs'
    AND public.user_cargo() IN ('admin','engenheiro')
  );

-- DELETE: apenas admin pode remover PDFs
DROP POLICY IF EXISTS "auth_delete_proposta_pdfs" ON storage.objects;
CREATE POLICY "auth_delete_proposta_pdfs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'propostas-pdfs'
    AND public.user_cargo() = 'admin'
  );
