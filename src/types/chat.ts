export interface Folder {
  id: string;
  name: string;
  color: string;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  pinned?: boolean;
  folder_id?: string | null;
  share_token?: string | null;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  images?: string[];
  generatedImage?: string;
  generatedVideo?: string;
  documentUrl?: string;
  documentName?: string;
  isStreaming?: boolean;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LLMMessage = {
  role: string;
  content: string | ContentPart[];
};
