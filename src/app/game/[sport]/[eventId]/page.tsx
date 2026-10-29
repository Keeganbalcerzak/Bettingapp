import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { GameDetail } from "./GameDetail";

export default function Page({ params }: { params: Promise<{ sport: string; eventId: string }> }) {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      {params.then(({ sport, eventId }) => (
        <GameDetail sport={sport} eventId={decodeURIComponent(eventId)} />
      ))}
    </Suspense>
  );
}
