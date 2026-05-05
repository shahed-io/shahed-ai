
-- Video generation queue
CREATE TABLE public.video_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  video_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.video_generation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own videos" ON public.video_generation_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own videos" ON public.video_generation_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own videos" ON public.video_generation_queue FOR DELETE USING (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_generation_queue;

CREATE TRIGGER update_video_queue_updated_at
BEFORE UPDATE ON public.video_generation_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Document uploads (PDF/DOCX analysis)
CREATE TABLE public.document_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.document_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own docs" ON public.document_uploads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own docs" ON public.document_uploads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own docs" ON public.document_uploads FOR DELETE USING (auth.uid() = user_id);

-- Documents storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read documents" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Users upload own docs to bucket" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own docs from bucket" ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
