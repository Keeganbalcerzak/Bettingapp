import type { Metadata } from "next";
import { BoardPage } from "./BoardPage";

export const metadata: Metadata = { title: "Odds board · ParlayLab" };

export default function Page() {
  return <BoardPage />;
}
