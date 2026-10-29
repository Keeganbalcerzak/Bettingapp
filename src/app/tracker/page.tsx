import type { Metadata } from "next";
import { Tracker } from "./Tracker";

export const metadata: Metadata = { title: "Bet tracker · ParlayLab" };

export default function Page() {
  return <Tracker />;
}
