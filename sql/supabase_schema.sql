-- Create table for load history
create table public.historial_cargas (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  nombre_archivo text not null,
  fecha_corte date not null
);

-- Create table for portfolio items (invoices/debts)
create table public.cartera_items (
  id uuid default gen_random_uuid() primary key,
  carga_id uuid references public.historial_cargas(id) on delete cascade not null,
  cliente_nombre text not null,
  documento_id text,
  fecha_emision date,
  fecha_vencimiento date,
  dias_mora integer,
  valor_saldo numeric,
  estado text,
  telefono text, -- Added for future use (WhatsApp)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for performance
create index idx_cartera_items_carga_id on public.cartera_items(carga_id);
create index idx_cartera_items_cliente_nombre on public.cartera_items(cliente_nombre);

-- Enable Row Level Security (RLS) - Optional but recommended
alter table public.historial_cargas enable row level security;
alter table public.cartera_items enable row level security;

-- Create policies (Allow public read/write for now, tighten later if auth is added)
-- Ideally, you would restrict this to authenticated users.
create policy "Enable read access for all users" on public.historial_cargas for select using (true);
create policy "Enable insert access for all users" on public.historial_cargas for insert with check (true);

create policy "Enable read access for all users" on public.cartera_items for select using (true);
create policy "Enable insert access for all users" on public.cartera_items for insert with check (true);
