-- Final testing/cleanup pass: covering indexes for foreign keys the
-- performance advisor flagged as missing across several features built
-- this phase (Town Hall, Planner, Credentials, Direct Messages, Document
-- ratings). Purely additive, no behavior change.
create index if not exists idx_continuing_education_credits_license_id on continuing_education_credits (license_id);
create index if not exists idx_conversation_messages_author_id on conversation_messages (author_id);
create index if not exists idx_conversations_created_by on conversations (created_by);
create index if not exists idx_document_ratings_rated_by on document_ratings (rated_by);
create index if not exists idx_planner_assignments_caseload_client_id on planner_assignments (caseload_client_id);
create index if not exists idx_planner_projects_profile_id on planner_projects (profile_id);
create index if not exists idx_town_hall_channels_lookup_value_id on town_hall_channels (lookup_value_id);
create index if not exists idx_town_hall_memberships_profile_id on town_hall_memberships (profile_id);
create index if not exists idx_town_hall_messages_author_id on town_hall_messages (author_id);
create index if not exists idx_town_hall_reactions_reactor_id on town_hall_reactions (reactor_id);
