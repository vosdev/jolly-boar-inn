-- Names are 12 characters, as in OSRS. Not valid: rows from before keep their longer names.
alter table players drop constraint players_display_name_check;
alter table players add constraint players_display_name_check
    check (char_length(display_name) between 1 and 12) not valid;
