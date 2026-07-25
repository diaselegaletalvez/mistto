# Mistto — site (landing multi-página)

Site estático de marketing do **Mistto** (builder de sites com IA da família Weblar), no mesmo padrão do repositório Weblar: **cada página numa pasta** (URLs em pastas), `style.css` e `script.js` compartilhados, `CNAME`, `favicon.svg`.

## Estrutura

```
/                → index.html        (Home: hero, demo, como funciona)
/precos/         → planos Ventos + tokens avulsos
/recursos/       → catálogo de features
/wecoins/        → programa de fidelidade + lista de espera (#lista)
/docs/           → documentação
/demos/          → galeria de exemplos
style.css        → estilo compartilhado
script.js        → JS compartilhado (menu, chips, lista de espera)
favicon.svg
CNAME            → mistto.weblar.app.br
```

## Publicar (GitHub Pages, igual Weblar)

1. Suba esta pasta como um repositório (ou subpasta) no GitHub.
2. Em Settings → Pages, aponte pro branch `main`.
3. O `CNAME` já está setado pra `mistto.weblar.app.br`.
4. No DNS do `weblar.app.br`, crie um registro **CNAME** `mistto` → `<seu-usuario>.github.io` (ou o A/ALIAS que o Weblar já usa pros outros subdomínios).

## Ativar a lista de espera (Supabase)

O formulário já está ligado via `fetch` no `script.js`. Falta só a **anon key**:

1. No projeto Supabase do Weblar (`unsvccbzrrgnvzvdwwrz`), rode este SQL:

```sql
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  created_at timestamptz default now()
);

alter table public.waitlist enable row level security;

-- permite QUALQUER visitante inserir (só INSERT, nada de ler)
create policy "public insert waitlist"
  on public.waitlist for insert
  to anon
  with check (true);
```

2. Copie a **anon/public key** (Settings → API) e cole em `script.js`:

```js
const SUPABASE_ANON_KEY = "cole-aqui";
```

> A anon key é feita pra ficar exposta no front-end — a RLS acima só deixa inserir, não ler. Enquanto a key estiver vazia, o form mostra a confirmação visual mas não grava.

## Cores da marca

navy `#0D1520` · card `#141F30` · dourado `#D4A017` · texto `#F1F5F9` · Playfair Display + Inter.
