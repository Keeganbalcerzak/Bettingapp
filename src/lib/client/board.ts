"use client";

import { useEffect } from "react";
import type { BoardResponse } from "../types";
import { useApi } from "./api";
import { analysisQuery, useSettings } from "./settings";
import { refreshSlipLegs } from "./slip";

export function boardUrl(sports: string[], method: string, infoWeight: number): string {
  return `/api/board?sports=${encodeURIComponent(sports.join(","))}&${analysisQuery({ method: method as never, infoWeight })}`;
}

export function useBoard() {
  const settings = useSettings();
  const url = boardUrl(settings.sports, settings.method, settings.infoWeight);
  const state = useApi<BoardResponse>(url);
  useEffect(() => {
    if (state.data) refreshSlipLegs(state.data.legs);
  }, [state.data]);
  return state;
}
