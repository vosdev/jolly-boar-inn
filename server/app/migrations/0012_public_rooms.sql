-- Whether Home lists the room for anyone to join. A column beside ``invite_key``, which it
-- excludes, rather than a setting.
alter table rooms add column public boolean not null default false;
