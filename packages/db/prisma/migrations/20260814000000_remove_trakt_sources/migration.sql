DELETE FROM "ExternalTrendSnapshot"
WHERE "source" LIKE 'trakt%';

DELETE FROM "SourceConfig"
WHERE "sourceId" LIKE 'trakt%';

UPDATE "AppSetting"
SET "value" = "value" - 'traktClientId'
WHERE "key" = 'sources'
  AND jsonb_typeof("value") = 'object';
