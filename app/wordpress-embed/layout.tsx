import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat widget",
  robots: { index: false, follow: false },
};

export default function WordPressEmbedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
