-- Create jobs table for async synthesis jobs
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  conversation_id uuid references conversations(id) not null,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  result jsonb,
  error text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS
alter table jobs enable row level security;

-- Users can view their own jobs
create policy "Users can view their own jobs"
  on jobs for select
  using (auth.uid() = user_id);

-- Users can insert their own jobs
create policy "Users can insert their own jobs"
  on jobs for insert
  with check (auth.uid() = user_id);

-- Create index for faster queries
create index idx_jobs_user_id on jobs(user_id);
create index idx_jobs_conversation_id on jobs(conversation_id);
create index idx_jobs_status on jobs(status);
