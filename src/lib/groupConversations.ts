import type { Conversation } from "@/types/chat";

export interface ConversationGroup {
  label: string;
  items: Conversation[];
}

export function groupConversationsByDate(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const last7 = new Date(today); last7.setDate(last7.getDate() - 7);
  const last30 = new Date(today); last30.setDate(last30.getDate() - 30);

  const groups: ConversationGroup[] = [
    { label: "আজ", items: [] },
    { label: "গতকাল", items: [] },
    { label: "গত ৭ দিন", items: [] },
    { label: "গত ৩০ দিন", items: [] },
    { label: "আরও আগে", items: [] },
  ];

  conversations.forEach(c => {
    const d = new Date(c.updated_at);
    if (d >= today) groups[0].items.push(c);
    else if (d >= yesterday) groups[1].items.push(c);
    else if (d >= last7) groups[2].items.push(c);
    else if (d >= last30) groups[3].items.push(c);
    else groups[4].items.push(c);
  });

  return groups.filter(g => g.items.length > 0);
}
