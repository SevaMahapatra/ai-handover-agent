// Print chats that recently messaged the bot, newest first: node scripts/chat-id.js
import "dotenv/config";

const api = (m) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`;
const me = await (await fetch(api("getMe"))).json();
if (!me.ok) throw new Error(`telegram getMe: ${me.description}`);
const { result: updates } = await (await fetch(api("getUpdates"))).json();

const chats = new Map();
for (const u of updates ?? []) {
  const m = u.message ?? u.edited_message ?? u.my_chat_member;
  if (m?.chat) chats.set(m.chat.id, { chat: m.chat, text: m.text ?? "", date: m.date });
}
if (!chats.size) {
  console.log(`No messages yet. Have them open t.me/${me.result.username} and tap Start (or send "hi"), then rerun.`);
  process.exit(1);
}
for (const { chat, text, date } of [...chats.values()].sort((a, b) => b.date - a.date)) {
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.title;
  console.log(`${chat.id}\t${name}${chat.username ? ` @${chat.username}` : ""}\t${new Date(date * 1000).toLocaleTimeString()}\t"${text}"`);
}
