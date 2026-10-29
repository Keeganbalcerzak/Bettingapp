import type { Metadata } from "next";
import { ParlayBuilder } from "./ParlayBuilder";

export const metadata: Metadata = { title: "Parlay builder · ParlayLab" };

export default function Page() {
  return <ParlayBuilder />;
}
