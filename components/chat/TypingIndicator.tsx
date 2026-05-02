export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2" aria-live="polite" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
