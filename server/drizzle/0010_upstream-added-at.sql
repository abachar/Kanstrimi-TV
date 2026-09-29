UPDATE items
SET added_at = CASE 
  WHEN kind = 'series' AND NULLIF(raw->>'last_modified', '') ~ '^[0-9]+$' 
       AND to_timestamp((raw->>'last_modified')::numeric) <= now() 
  THEN to_timestamp((raw->>'last_modified')::numeric)
  WHEN kind != 'series' AND NULLIF(raw->>'added', '') ~ '^[0-9]+$' 
       AND to_timestamp((raw->>'added')::numeric) <= now() 
  THEN to_timestamp((raw->>'added')::numeric)
  ELSE added_at
END;
