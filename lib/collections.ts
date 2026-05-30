"use client";
// Reading lists / collections — ported from Js/blog-reader-data.js. localStorage is
// the source of truth (_lb_reading_lists); cloud sync (reading_lists RPCs) is best-effort.
import { getBrowserClient } from "@/lib/supabase/browser";
import { ensureAnonSession } from "@/lib/supabase/anon";

const LS = "_lb_reading_lists";
export const COLL_EMOJIS = ["📑", "🔖", "🧠", "🚀", "💡", "📚", "🎯", "⭐", "🔬", "💻", "📰", "🌍"];

export interface ListItem {
  articleId: string;
  slug: string;
  title?: string;
  cover_image?: string;
  addedAt: string;
}
export interface ReadingList {
  id: string;
  cloudId: string | null;
  name: string;
  emoji: string;
  isDefault?: boolean;
  items: ListItem[];
}

function genId() {
  return "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}
export function getLists(): ReadingList[] {
  try {
    return (JSON.parse(localStorage.getItem(LS) || '{"lists":[]}').lists || []) as ReadingList[];
  } catch {
    return [];
  }
}
function setLists(lists: ReadingList[]) {
  try {
    localStorage.setItem(LS, JSON.stringify({ lists }));
  } catch {}
}
export function ensureDefault(): ReadingList[] {
  const lists = getLists();
  if (!lists.find((l) => l.isDefault)) {
    lists.unshift({ id: genId(), cloudId: null, name: "Saved", emoji: "🔖", isDefault: true, items: [] });
    setLists(lists);
  }
  return lists;
}

function cloud(fn: (sb: ReturnType<typeof getBrowserClient>) => Promise<unknown>) {
  (async () => {
    try {
      await ensureAnonSession();
      await fn(getBrowserClient());
    } catch {
      /* best-effort */
    }
  })();
}

export function createList(name: string, emoji: string): ReadingList {
  const lists = getLists();
  const list: ReadingList = { id: genId(), cloudId: null, name, emoji, items: [] };
  lists.push(list);
  setLists(lists);
  cloud(async (sb) => {
    const { data } = await sb.rpc("create_reading_list", { p_name: name, p_emoji: emoji });
    if (data) {
      const ls = getLists();
      const l = ls.find((x) => x.id === list.id);
      if (l) {
        l.cloudId = data as string;
        setLists(ls);
      }
    }
  });
  return list;
}
export function renameList(id: string, name: string, emoji: string) {
  const lists = getLists();
  const l = lists.find((x) => x.id === id);
  if (!l) return;
  l.name = name;
  l.emoji = emoji;
  setLists(lists);
  if (l.cloudId) cloud((sb) => sb.rpc("rename_reading_list", { p_list_id: l.cloudId, p_name: name, p_emoji: emoji }));
}
export function deleteList(id: string) {
  const lists = getLists();
  const l = lists.find((x) => x.id === id);
  if (!l || l.isDefault) return;
  setLists(lists.filter((x) => x.id !== id));
  if (l.cloudId) cloud((sb) => sb.rpc("delete_reading_list", { p_list_id: l.cloudId }));
}
export function isInList(listId: string, articleId: string): boolean {
  const l = getLists().find((x) => x.id === listId);
  return !!l && l.items.some((it) => it.articleId === articleId);
}
export function addToList(listId: string, item: ListItem) {
  const lists = getLists();
  const l = lists.find((x) => x.id === listId);
  if (!l || l.items.some((it) => it.articleId === item.articleId)) return;
  l.items.push(item);
  setLists(lists);
  if (l.cloudId) cloud((sb) => sb.rpc("add_to_reading_list", { p_list_id: l.cloudId, p_article_id: item.articleId }));
}
export function removeFromList(listId: string, articleId: string) {
  const lists = getLists();
  const l = lists.find((x) => x.id === listId);
  if (!l) return;
  l.items = l.items.filter((it) => it.articleId !== articleId);
  setLists(lists);
  if (l.cloudId) cloud((sb) => sb.rpc("remove_from_reading_list", { p_list_id: l.cloudId, p_article_id: articleId }));
}
