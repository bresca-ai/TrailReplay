-- Low-cardinality acquisition context for the Studio delivery lead funnel.
-- Only normalized source/medium/campaign, referrer host, and path are stored;
-- no full URLs, query strings, or contact data are duplicated into attribution.
ALTER TABLE leads ADD COLUMN first_touch_source TEXT;
ALTER TABLE leads ADD COLUMN first_touch_medium TEXT;
ALTER TABLE leads ADD COLUMN first_touch_campaign TEXT;
ALTER TABLE leads ADD COLUMN first_touch_referrer_host TEXT;
ALTER TABLE leads ADD COLUMN first_touch_landing_page TEXT;
ALTER TABLE leads ADD COLUMN last_touch_source TEXT;
ALTER TABLE leads ADD COLUMN last_touch_medium TEXT;
ALTER TABLE leads ADD COLUMN last_touch_campaign TEXT;
ALTER TABLE leads ADD COLUMN last_touch_referrer_host TEXT;
ALTER TABLE leads ADD COLUMN last_touch_landing_page TEXT;
