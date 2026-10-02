import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ids = {
  admin: '11111111-1111-4111-8111-111111111111',
  mestre: '22222222-2222-4222-8222-222222222222',
  engenheiro: '33333333-3333-4333-8333-333333333333',
  unverified: '44444444-4444-4444-8444-444444444444',
  pending: '55555555-5555-4555-8555-555555555555',
};
let project, otherProject, task, otherTask, budget;
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
async function asUser(user, action) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids[user]}',false);`);
  try { return await action(); } finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);"); }
}
before(async () => {
  // Real PostgreSQL RLS/privileges/triggers; only Supabase Auth is represented by
  // a minimal test schema. This suite never connects to a remote database.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, dir), 'utf8'));
    // Simulate legacy Supabase default grants before the hardening migration.
    if (!file.includes('harden_rbac')) await db.exec('GRANT USAGE ON SCHEMA public TO authenticated,anon; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,anon;');
  }
  for (const [name, id] of Object.entries(ids)) {
    await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,$2,$3)',[id,`${name}@example.test`,name==='unverified'?null:new Date().toISOString()]);
  }
  await db.query("INSERT INTO usuarios(nome,email,cargo,auth_user_id) VALUES ('First admin','admin@example.test','engenheiro',$1)",[ids.admin]);
});
after(async () => { await db.close(); });

test('unverified accounts cannot become administrator', async () => {
  const result = await asUser('unverified', () => rows('SELECT bootstrap_first_admin() AS result'));
  assert.equal(result[0].result.success,false);
});
test('bootstrap creates a new profile while preserving demonstration data', async () => {
  const count = Number((await rows('SELECT count(*) AS n FROM usuarios'))[0].n);
  await db.exec('BEGIN');
  try {
    const result = await asUser('pending', () => rows('SELECT bootstrap_first_admin() AS result'));
    assert.equal(result[0].result.success, true);
    assert.equal(Number((await rows('SELECT count(*) AS n FROM usuarios'))[0].n), count + 1);
    assert.equal((await rows('SELECT cargo FROM usuarios WHERE auth_user_id=$1', [ids.pending]))[0].cargo, 'admin');
  } finally { await db.exec('ROLLBACK'); }
});
test('bootstrap promotes first verified account despite unlinked demo admin, then closes', async () => {
  const result = await asUser('admin', () => rows('SELECT bootstrap_first_admin() AS result'));
  assert.equal(result[0].result.success,true);
  assert.equal((await asUser('admin',()=>rows('SELECT user_cargo() AS cargo')))[0].cargo,'admin');
  assert.equal((await asUser('engenheiro',()=>rows('SELECT bootstrap_first_admin() AS result')))[0].result.success,false);
  await db.query("INSERT INTO usuarios(nome,email,cargo,auth_user_id) VALUES ('Field','mestre@example.test','mestre',$1),('Engineer','engenheiro@example.test','engenheiro',$2)",[ids.mestre,ids.engenheiro]);
  project=(await rows("INSERT INTO projetos(nome,cliente,valor_contrato) VALUES ('Assigned','A',123456) RETURNING id"))[0].id;
  otherProject=(await rows("INSERT INTO projetos(nome,cliente,valor_contrato) VALUES ('Unassigned','B',987654) RETURNING id"))[0].id;
  await db.query('INSERT INTO projeto_usuarios(projeto_id,usuario_id) SELECT $1,id FROM usuarios WHERE auth_user_id IN ($2,$3)',[project,ids.mestre,ids.engenheiro]);
  task=(await rows("INSERT INTO tarefas(projeto_id,nome,data_inicio,data_fim,valor_previsto) VALUES ($1,'Assigned task','2026-10-01','2026-10-10',999) RETURNING id",[project]))[0].id;
  otherTask=(await rows("INSERT INTO tarefas(projeto_id,nome,data_inicio,data_fim) VALUES ($1,'Unassigned task','2026-10-01','2026-10-10') RETURNING id",[otherProject]))[0].id;
  budget=(await rows("INSERT INTO orcamentos(projeto_id,nome) VALUES ($1,'Budget') RETURNING id",[project]))[0].id;
  await db.query("INSERT INTO orcamento_itens(orcamento_id,descricao,custo_unitario) VALUES ($1,'Item',888)",[budget]);
});
test('field accounts cannot read financial base tables',async()=>{
  await asUser('mestre',async()=>{
    for(const table of ['projetos','tarefas','orcamentos','orcamento_itens','medicoes','insumos','composicao_insumos','propostas_fornecedor']) assert.deepEqual(await rows(`SELECT * FROM ${table}`),[],table);
  });
});
test('field views expose only assigned projects and omit costs',async()=>{
  await asUser('mestre',async()=>{
    const projects=await rows('SELECT * FROM projetos_mestre');
    assert.deepEqual(projects.map(p=>p.id),[project]);
    assert.equal('valor_contrato' in projects[0],false);
    const tasks=await rows('SELECT * FROM tarefas_mestre');
    assert.deepEqual(tasks.map(t=>t.id),[task]);
    assert.equal(Number(tasks[0].valor_previsto),0);
    const items=await rows('SELECT * FROM orcamento_itens_mestre');
    assert.equal(items.length,1);assert.equal('custo_unitario' in items[0],false);
  });
});
test('field progress RPC works but rejects cross-project and invalid writes',async()=>{
  await asUser('mestre',async()=>{
    assert.deepEqual(await rows('UPDATE tarefas SET valor_previsto=123 WHERE id=$1 RETURNING id',[task]),[]);
    await db.query('SELECT update_task_progress($1,45)',[task]);
    await assert.rejects(db.query('SELECT update_task_progress($1,45)',[otherTask]),/Tarefa indisponível/);
    for(const value of [-1,101,null,'NaN']) await assert.rejects(db.query('SELECT update_task_progress($1,$2)',[task,value]),/entre 0 e 100/);
  });
  const result=(await rows('SELECT percentual_concluido,valor_previsto FROM tarefas WHERE id=$1',[task]))[0];
  assert.equal(Number(result.percentual_concluido),45);assert.equal(Number(result.valor_previsto),999);
});
test('engineer can edit budget and schedule but cannot choose or change BDI',async()=>{
  await asUser('engenheiro',async()=>{
    assert.equal((await rows('SELECT * FROM projetos WHERE id=$1',[project])).length,1);
    await assert.rejects(db.query('UPDATE orcamentos SET bdi_taxa=99 WHERE id=$1',[budget]),/administradores.*BDI/);
    await assert.rejects(db.query("INSERT INTO orcamentos(projeto_id,nome,bdi_taxa) VALUES ($1,'Invalid',99)",[project]),/administradores.*BDI/);
    await db.query("INSERT INTO orcamentos(projeto_id,nome) VALUES ($1,'Default')",[project]);
    assert.equal((await rows("UPDATE orcamentos SET nome='Renamed' WHERE id=$1 RETURNING id",[budget])).length,1);
    assert.equal((await rows('UPDATE tarefas SET valor_previsto=1000 WHERE id=$1 RETURNING id',[task])).length,1);
  });
  await asUser('admin',()=>db.query('UPDATE orcamentos SET bdi_taxa=30 WHERE id=$1',[budget]));
  assert.equal(Number((await rows('SELECT bdi_taxa FROM orcamentos WHERE id=$1',[budget]))[0].bdi_taxa),30);
});
test('new project is automatically assigned to the engineer who created it',async()=>{
  await asUser('engenheiro',async()=>{
    await db.exec("INSERT INTO projetos(nome,cliente) VALUES ('Created by engineer','Client')");
    const created=await rows("SELECT id FROM projetos WHERE nome='Created by engineer'");
    assert.equal(created.length,1);
    assert.equal((await rows('SELECT id FROM projeto_usuarios WHERE projeto_id=$1',[created[0].id])).length,1);
  });
  await asUser('mestre',()=>assert.rejects(db.exec("INSERT INTO projetos(nome,cliente) VALUES ('Forbidden','Client')"),/row-level security/));
});
test('profile linking uses confirmed Auth email and blocks identity self-edits',async()=>{
  await db.exec("INSERT INTO usuarios(nome,email,cargo) VALUES ('Unverified','unverified@example.test','engenheiro')");
  await asUser('unverified',async()=>{
    await db.exec('SELECT link_my_profile()');
    assert.deepEqual(await rows('SELECT id FROM usuarios WHERE auth_user_id=auth.uid()'),[]);
  });
  await db.exec("INSERT INTO usuarios(nome,email,cargo) VALUES ('Pending','pending@example.test','engenheiro')");
  await asUser('pending',async()=>{
    await db.exec('SELECT link_my_profile()');
    assert.equal((await rows('SELECT user_cargo() AS cargo'))[0].cargo,'engenheiro');
    await assert.rejects(db.exec("UPDATE usuarios SET cargo='admin' WHERE auth_user_id=auth.uid()"),/administradores/);
    await assert.rejects(db.query('UPDATE usuarios SET auth_user_id=$1 WHERE auth_user_id=auth.uid()',[ids.unverified]),/administradores/);
    await assert.rejects(db.exec("UPDATE usuarios SET ativo=false WHERE auth_user_id=auth.uid()"),/administradores/);
  });
  await db.query('UPDATE usuarios SET ativo=false WHERE auth_user_id=$1',[ids.mestre]);
  await asUser('mestre',async()=>{
    assert.deepEqual(await rows('SELECT * FROM projetos_mestre'),[]);
    await assert.rejects(db.query('SELECT update_task_progress($1,50)',[task]),/Sem permissão/);
  });
});
test('anonymous calls and forged audit entries are denied',async()=>{
  await asUser('engenheiro',()=>assert.rejects(db.exec("INSERT INTO audit_log(tabela,registro_id,acao) VALUES ('fake',gen_random_uuid(),'insert')"),/permission denied/));
  await db.exec('SET ROLE anon');
  try {
    await assert.rejects(db.exec('SELECT bootstrap_first_admin()'),/permission denied/);
    await assert.rejects(db.exec('SELECT * FROM projetos_mestre'),/permission denied/);
    assert.deepEqual(await rows('SELECT * FROM projetos'),[]);
  } finally { await db.exec('RESET ROLE'); }
});
