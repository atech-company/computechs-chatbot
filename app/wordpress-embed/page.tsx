import { WordPressEmbedShell } from "./WordPressEmbedShell";

/** Empty route body: ChatWidget is mounted from root layout; Shell tags html/body for iframe click-through CSS. */
export default function WordPressEmbedPage() {
  return (
    <>
      <WordPressEmbedShell />
    </>
  );
}