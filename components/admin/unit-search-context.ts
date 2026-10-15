"use client";

/**
 * The units tab's search box (UnitsPanel) filters the tiles (UnitTileBoard).
 * The page renders the board as UnitsPanel's child, so the query reaches it
 * through context rather than props.
 */

import { createContext, useContext } from "react";

export const UnitSearchContext = createContext("");

export function useUnitSearch(): string {
  return useContext(UnitSearchContext);
}
