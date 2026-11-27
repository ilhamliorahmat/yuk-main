'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, MessageSquare, Send } from 'lucide-react';
import { QUICK_QUESTIONS_ID } from '@/lib/games/spyfall/locations-id';
import type { ChatMessage } from '@/lib/games/types';
import { sendRoomChatMessage } from '@/lib/platform/chat-presence';

interface RoomChatPanelProps {
  roomId: string;
  myUid: string;
  myName: string;
  messages: ChatMessage[];
  quickPrompts?: string[];
  promptLabel?: string;
  emptyPlaceholder?: string;
}

export function RoomChatPanel({
  roomId,
  myUid,
  myName,
  messages,
  quickPrompts = QUICK_QUESTIONS_ID,
  promptLabel = 'Ide Tanya',
  emptyPlaceholder = 'Belum ada pesan. Mulailah bertanya atau berdiskusi untuk membongkar penyamar!',
}: RoomChatPanelProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const lastHeightRef = useRef(0);

  const scrollMessagesToBottom = (behavior: ScrollBehavior) => {
    const el = messagesScrollRef.current;
    if (!el || el.clientHeight === 0) return;
    if (behavior === 'smooth' && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  };

  const handleMessagesScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isPinnedToBottomRef.current = distanceFromBottom <= 64;
  };

  useEffect(() => {
    const el = messagesScrollRef.current;
    const prevCount = prevMessageCountRef.current;
    const nextCount = messages.length;
    prevMessageCountRef.current = nextCount;

    if (!el || nextCount === 0) return;

    const latestMsg = messages[nextCount - 1];
    const sentByMe = latestMsg?.senderUid === myUid;

    if (prevCount === 0) {
      isPinnedToBottomRef.current = true;
      scrollMessagesToBottom('auto');
      return;
    }

    if (nextCount > prevCount && (isPinnedToBottomRef.current || sentByMe)) {
      isPinnedToBottomRef.current = true;
      scrollMessagesToBottom('smooth');
    }
  }, [messages, myUid]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    lastHeightRef.current = el.clientHeight;
    const observer = new ResizeObserver(() => {
      const prevHeight = lastHeightRef.current;
      const nextHeight = el.clientHeight;
      lastHeightRef.current = nextHeight;

      if (prevHeight === 0 && nextHeight > 0 && isPinnedToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setChatError(null);
    isPinnedToBottomRef.current = true;
    try {
      await sendRoomChatMessage({
        roomId,
        senderUid: myUid,
        senderName: myName,
        text: trimmed,
        type: 'chat',
      });
      setText('');
      scrollMessagesToBottom('smooth');
    } catch {
      setChatError('Gagal mengirim pesan. Periksa aturan RTDB atau koneksi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl flex flex-col h-[min(460px,62dvh)] lg:h-[min(620px,calc(100dvh-9rem))] min-h-0 overflow-hidden overscroll-contain">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-rose-400 shrink-0" />
          <h2 className="text-sm font-bold text-white truncate">Obrolan Ruang</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowPrompts((v) => !v)}
          className="min-h-[36px] px-2.5 rounded-lg bg-[#0B1018] border border-slate-800 hover:border-slate-700 text-xs text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
          <span>{promptLabel}</span>
        </button>
      </div>

      {showPrompts && (
        <div className="p-3 bg-[#0B1018] border-b border-slate-800 space-y-2 max-h-44 overflow-y-auto overscroll-contain shrink-0">
          <p className="text-[11px] font-medium text-slate-400">
            Ketuk contoh kalimat untuk langsung dimasukkan ke kolom ketik:
          </p>
          <div className="space-y-1.5">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setText(q);
                  setShowPrompts(false);
                }}
                className="w-full text-left text-xs text-slate-200 hover:text-white bg-[#131A24] hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={messagesScrollRef}
        onScroll={handleMessagesScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-xs text-slate-500 px-6">
            {emptyPlaceholder}
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div
                  key={msg.id}
                  className="text-center text-xs text-amber-300/90 bg-amber-950/30 border border-amber-800/40 rounded-xl px-3 py-2"
                >
                  {msg.text}
                </div>
              );
            }

            const isMe = msg.senderUid === myUid;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[11px] text-slate-400 mb-1 px-1">
                  {isMe ? 'Kamu' : msg.senderName}
                </span>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words ${
                    isMe
                      ? 'bg-rose-600 text-white rounded-br-sm'
                      : 'bg-[#0B1018] border border-slate-800 text-slate-100 rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {chatError && (
        <div className="px-4 py-2 bg-rose-950/60 text-xs text-rose-200 border-t border-rose-800/60 shrink-0">
          {chatError}
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="p-3 border-t border-slate-800 bg-[#0B1018]/60 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tulis pertanyaan atau jawaban..."
          className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
        />
        <button
          type="submit"
          disabled={sending || text.trim().length === 0}
          aria-label="Kirim pesan"
          className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Kirim</span>
        </button>
      </form>
    </section>
  );
}
