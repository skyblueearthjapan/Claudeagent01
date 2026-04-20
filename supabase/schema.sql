-- ============================================================
-- Claudeagent01 knowledge base — Supabase schema
-- Generic index for vault markdown files.
-- Apply via: supabase db push  OR  psql -f schema.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null,                          -- free text: defect / standard / project / meeting / ...
  tags        text[] not null default '{}',
  keywords    text,
  summary     text,
  vault_path  text not null unique,                   -- relative path under knowledge/, e.g. "standards/材料選定.md"
  metadata    jsonb not null default '{}'::jsonb,     -- category-specific fields
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists documents_category_idx on documents (category);
create index if not exists documents_tags_gin    on documents using gin (tags);
create index if not exists documents_search_gin  on documents
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(keywords,'') || ' ' || coalesce(summary,'')));

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at before update on documents
  for each row execute function set_updated_at();

-- Search helper: pass any of category / tag_any / query; NULLs are ignored.
create or replace function search_documents(
  p_query     text default null,
  p_category  text default null,
  p_tag_any   text[] default null,
  p_limit     int default 20
) returns setof documents language sql stable as $$
  select *
  from documents d
  where (p_category is null or d.category = p_category)
    and (p_tag_any  is null or d.tags && p_tag_any)
    and (p_query    is null or
         to_tsvector('simple',
           coalesce(d.title,'') || ' ' || coalesce(d.keywords,'') || ' ' || coalesce(d.summary,''))
         @@ plainto_tsquery('simple', p_query))
  order by d.updated_at desc
  limit p_limit;
$$;
