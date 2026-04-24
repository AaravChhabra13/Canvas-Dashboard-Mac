-- Profiles table
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = user_id);

-- User settings (feed URL, etc.)
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  feed_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users view own settings" on public.user_settings for select using (auth.uid() = user_id);
create policy "Users insert own settings" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "Users update own settings" on public.user_settings for update using (auth.uid() = user_id);
create policy "Users delete own settings" on public.user_settings for delete using (auth.uid() = user_id);

-- Completed assignments (synced across devices)
create table public.completed_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, assignment_id)
);

alter table public.completed_assignments enable row level security;

create policy "Users view own completions" on public.completed_assignments for select using (auth.uid() = user_id);
create policy "Users insert own completions" on public.completed_assignments for insert with check (auth.uid() = user_id);
create policy "Users delete own completions" on public.completed_assignments for delete using (auth.uid() = user_id);

-- Updated_at trigger function (reusable)
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row execute function public.update_updated_at_column();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();