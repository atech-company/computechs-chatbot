import { WordPressEmbedShell } from "./WordPressEmbedShell";

export default function WordPressEmbedPage() {
  return (
    <div className="wp-chat-embed">
      <WordPressEmbedShell />

      {/* 👇 THIS is what guarantees clickability */}
      <div className="computechs-chat-scope">
        {/* Your ChatWidget goes here */}
      </div>
    </div>
  );
}