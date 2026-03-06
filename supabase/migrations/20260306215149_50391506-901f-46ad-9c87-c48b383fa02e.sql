-- Add pinned column to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;

-- Add share_token column for public sharing
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

-- Create folders table
CREATE TABLE IF NOT EXISTS public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add folder_id to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL;

-- RLS for folders
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders_select_own" ON public.folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "folders_insert_own" ON public.folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "folders_update_own" ON public.folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "folders_delete_own" ON public.folders FOR DELETE USING (auth.uid() = user_id);

-- Allow public read of shared conversations (via share_token)
CREATE POLICY "conversations_select_shared" ON public.conversations FOR SELECT USING (share_token IS NOT NULL);

-- Allow public read of messages in shared conversations
CREATE POLICY "messages_select_shared" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND share_token IS NOT NULL)
);

-- Trigger to update updated_at on folders
CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();