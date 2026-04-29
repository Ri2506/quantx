'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, ArrowUp, Sparkles } from 'lucide-react';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

const SUGGESTIONS = [
  'What stocks are trending?',
  'Show breakout patterns',
  'Explain risk management',
  "Today's market outlook",
];

const WELCOME_MESSAGE: Message = {
  role: 'ai',
  content:
    "Hi! I'm Quant X AI. Ask me about stocks, trading strategies, market analysis, or anything about Indian markets.",
};

const DEMO_RESPONSE =
  "I'm currently in demo mode. Connect to the backend to get real-time AI responses about Indian markets, stocks, and trading strategies.";

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasUserMessages = messages.some((m) => m.role === 'user');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: 'ai', content: DEMO_RESPONSE }]);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 sm:bottom-6 sm:right-6 max-sm:bottom-4 max-sm:right-4">
      <AnimatePresence mode="wait">
        {isOpen ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col w-[400px] h-[520px] max-sm:w-[calc(100vw-2rem)] max-sm:h-[70vh] bg-[#0d1017]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-white">
                  Quant X AI
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10"
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={
                      msg.role === 'ai'
                        ? 'bg-white/[0.04] rounded-2xl rounded-bl-sm p-3 text-sm text-white/80 max-w-[85%]'
                        : 'bg-primary/20 rounded-2xl rounded-br-sm p-3 text-sm text-white max-w-[85%]'
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.04] rounded-2xl rounded-bl-sm p-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[bounce_1s_ease-in-out_infinite]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[bounce_1s_ease-in-out_0.15s_infinite]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[bounce_1s_ease-in-out_0.3s_infinite]" />
                  </div>
                </div>
              )}

              {/* Suggestion pills */}
              {!hasUserMessages && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-2 text-xs text-d-text-muted hover:bg-white/[0.08] hover:text-white transition-all text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="px-4 py-3 border-t border-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything..."
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary/40 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white disabled:opacity-30 hover:brightness-110 transition-all"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.button
            key="trigger"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(true)}
            className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary to-[#5DCBD8] flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform"
          >
            <div className="absolute inset-0 rounded-full bg-primary/30 animate-[pulse-ring_2s_ease-out_infinite]" />
            <MessageCircle className="h-6 w-6 relative z-10" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
