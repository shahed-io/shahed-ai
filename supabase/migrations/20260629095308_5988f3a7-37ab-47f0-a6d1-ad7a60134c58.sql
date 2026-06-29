
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS idx_image_queue_user_created ON public.image_generation_queue(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_queue_user_created ON public.video_generation_queue(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_uploads_user_id ON public.document_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON public.error_logs(created_at DESC);
