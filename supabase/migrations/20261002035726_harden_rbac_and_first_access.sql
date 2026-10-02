-- PostgreSQL 15+. Additive migration: existing data and memberships are preserved.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Disabled/unlinked profiles must not confer any permissions.
CREATE OR REPLACE FUNCTION public.user_cargo() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT cargo FROM public.usuarios
    WHERE auth_user_id = auth.uid() AND ativo), '');
$$;
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_projeto_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND public.user_cargo() IN ('admin','engenheiro','mestre')
    AND (public.user_cargo() = 'admin' OR EXISTS (
      SELECT 1 FROM public.projeto_usuarios
      WHERE projeto_id = p_projeto_id AND usuario_id = public.user_id_by_auth()));
$$;

-- RLS controls rows, not columns. Deny the financial tables to field profiles.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projetos','tarefas','orcamentos','orcamento_itens','medicoes'] LOOP
    EXECUTE format('CREATE POLICY financial_role_only ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.user_cargo() IN (''admin'',''engenheiro''))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['insumos','composicoes','composicao_insumos','fornecedores','propostas_fornecedor'] LOOP
    EXECUTE format('CREATE POLICY financial_role_only ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.user_cargo() IN (''admin'',''engenheiro''))', t);
  END LOOP;
END $$;
ALTER POLICY auth_update_tarefas ON public.tarefas
  USING (public.user_cargo() IN ('admin','engenheiro') AND public.user_has_project_access(projeto_id))
  WITH CHECK (public.user_cargo() IN ('admin','engenheiro') AND public.user_has_project_access(projeto_id));

-- Narrow privileged readers are private, check identity/membership themselves and
-- never return financial columns. Invoker views do not bypass those checks.
CREATE FUNCTION private.field_projects()
RETURNS TABLE (id uuid,nome text,cliente text,endereco text,status text,data_inicio date,data_termino date,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id,p.nome,p.cliente,p.endereco,p.status,p.data_inicio,p.data_termino,p.created_at
  FROM public.projetos p WHERE auth.uid() IS NOT NULL AND public.user_has_project_access(p.id);
$$;
CREATE FUNCTION private.field_tasks()
RETURNS TABLE (id uuid,projeto_id uuid,eap_item_id uuid,nome text,data_inicio date,data_fim date,dependencia_id uuid,percentual_concluido numeric,valor_previsto numeric,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id,t.projeto_id,t.eap_item_id,t.nome,t.data_inicio,t.data_fim,t.dependencia_id,
    t.percentual_concluido,0::numeric,t.created_at,t.updated_at
  FROM public.tarefas t WHERE auth.uid() IS NOT NULL AND public.user_has_project_access(t.projeto_id);
$$;
CREATE FUNCTION private.field_budget_items()
RETURNS TABLE (id uuid,orcamento_id uuid,eap_item_id uuid,composicao_id uuid,descricao text,quantidade numeric,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id,i.orcamento_id,i.eap_item_id,i.composicao_id,i.descricao,i.quantidade,i.created_at,i.updated_at
  FROM public.orcamento_itens i JOIN public.orcamentos o ON o.id=i.orcamento_id
  WHERE auth.uid() IS NOT NULL AND public.user_has_project_access(o.projeto_id);
$$;
REVOKE ALL ON FUNCTION private.field_projects(), private.field_tasks(), private.field_budget_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.field_projects(), private.field_tasks(), private.field_budget_items() TO authenticated;
CREATE OR REPLACE VIEW public.projetos_mestre WITH (security_invoker=true,security_barrier=true) AS SELECT * FROM private.field_projects();
CREATE OR REPLACE VIEW public.orcamento_itens_mestre WITH (security_invoker=true,security_barrier=true) AS SELECT id,orcamento_id,eap_item_id,composicao_id,descricao,quantidade::numeric(12,2),created_at,updated_at FROM private.field_budget_items();
CREATE VIEW public.tarefas_mestre WITH (security_invoker=true,security_barrier=true) AS SELECT * FROM private.field_tasks();
REVOKE ALL ON public.projetos_mestre, public.orcamento_itens_mestre, public.tarefas_mestre FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.projetos_mestre, public.orcamento_itens_mestre, public.tarefas_mestre TO authenticated;

CREATE FUNCTION private.update_task_progress(p_tarefa_id uuid,p_percentual numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_projeto uuid;
BEGIN
  IF auth.uid() IS NULL OR public.user_cargo() NOT IN ('admin','engenheiro','mestre') THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501';
  END IF;
  IF p_percentual IS NULL OR p_percentual::text IN ('NaN','Infinity','-Infinity') OR p_percentual < 0 OR p_percentual > 100 THEN
    RAISE EXCEPTION 'Progresso deve estar entre 0 e 100';
  END IF;
  SELECT projeto_id INTO v_projeto FROM public.tarefas WHERE id=p_tarefa_id FOR UPDATE;
  IF v_projeto IS NULL OR NOT public.user_has_project_access(v_projeto) THEN
    RAISE EXCEPTION 'Tarefa indisponível' USING ERRCODE='42501';
  END IF;
  UPDATE public.tarefas SET percentual_concluido=p_percentual,updated_at=now() WHERE id=p_tarefa_id;
END $$;
CREATE FUNCTION public.update_task_progress(p_tarefa_id uuid,p_percentual numeric) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.update_task_progress(p_tarefa_id,p_percentual); $$;

-- Engineers may use the default BDI on INSERT, but only admins choose/change it.
CREATE FUNCTION private.protect_budget_bdi() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND public.user_cargo() <> 'admin'
    AND ((TG_OP='UPDATE' AND NEW.bdi_taxa IS DISTINCT FROM OLD.bdi_taxa)
      OR (TG_OP='INSERT' AND NEW.bdi_taxa IS DISTINCT FROM 25.00::numeric)) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o BDI' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_budget_bdi BEFORE INSERT OR UPDATE ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION private.protect_budget_bdi();

-- Trusted database functions can perform bootstrap/linking. Direct client writes
-- cannot change their role, identity, email or activation status.
CREATE OR REPLACE FUNCTION public.protect_usuario_cargo() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND public.user_cargo() <> 'admin'
    AND (NEW.cargo IS DISTINCT FROM OLD.cargo OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
      OR NEW.ativo IS DISTINCT FROM OLD.ativo OR NEW.email IS DISTINCT FROM OLD.email) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar a identidade ou as permissões' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION private.bootstrap_first_admin() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'error','Não autenticado'); END IF;
  SELECT email INTO v_email FROM auth.users WHERE id=v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN jsonb_build_object('success',false,'error','Confirme seu e-mail antes de configurar o administrador.'); END IF;
  -- Serialize competing first-access calls; demo admins without Auth do not block.
  LOCK TABLE public.usuarios IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE cargo='admin' AND auth_user_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success',false,'error','Já existe um administrador vinculado. Solicite seu acesso a ele.');
  END IF;
  SELECT id INTO v_id FROM public.usuarios WHERE auth_user_id=v_uid;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.usuarios WHERE lower(email)=lower(v_email) AND auth_user_id IS NULL; END IF;
  IF v_id IS NOT NULL THEN
    UPDATE public.usuarios SET cargo='admin',auth_user_id=v_uid,ativo=true WHERE id=v_id;
  ELSE
    INSERT INTO public.usuarios(nome,email,cargo,auth_user_id,ativo)
    VALUES (split_part(v_email,'@',1),v_email,'admin',v_uid,true) RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('success',true,'usuario_id',v_id);
END $$;
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.bootstrap_first_admin(); $$;

CREATE FUNCTION private.link_my_profile() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_user_id=auth.uid()) THEN RETURN; END IF;
  UPDATE public.usuarios SET auth_user_id=auth.uid()
    WHERE lower(email)=lower(v_email) AND auth_user_id IS NULL AND ativo;
END $$;
CREATE FUNCTION public.link_my_profile() RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.link_my_profile(); $$;

CREATE FUNCTION private.link_project_creator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.user_cargo() IN ('admin','engenheiro') THEN
    INSERT INTO public.projeto_usuarios(projeto_id,usuario_id) VALUES (NEW.id,public.user_id_by_auth()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER link_project_creator AFTER INSERT ON public.projetos FOR EACH ROW EXECUTE FUNCTION private.link_project_creator();

-- Audit entries come only from trusted triggers, never arbitrary API inserts.
DROP POLICY auth_insert_audit_log ON public.audit_log;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.projetos,public.tarefas,public.orcamentos,public.orcamento_itens,public.medicoes,public.insumos,public.composicoes,public.composicao_insumos,public.fornecedores,public.propostas_fornecedor,public.eap_itens,public.usuarios,public.projeto_usuarios,public.diario_obra TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bootstrap_first_admin(),private.link_my_profile(),private.update_task_progress(uuid,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(),public.link_my_profile(),public.update_task_progress(uuid,numeric),public.user_cargo(),public.user_id_by_auth(),public.user_has_project_access(uuid),public.protect_usuario_cargo(),public.audit_changes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(),public.link_my_profile(),public.update_task_progress(uuid,numeric),public.user_cargo(),public.user_id_by_auth(),public.user_has_project_access(uuid) TO authenticated;
COMMIT;
