-- Settings written before the vault existed: the password hash lives in .env, the IPTV proxy account is gone.
delete from settings where key in ('admin_password_hash', 'proxy_password', 'stream_mode', 'proxy_username');
