import { createContext } from 'react';

export type MenuDesign = 'new' | 'previous';
export const MENU_DESIGN_KEY = 'trailreplay-menu-design-v1';
export const MENU_FEEDBACK_KEY = 'trailreplay-menu-feedback-v1';
export const MenuDesignContext = createContext<MenuDesign>('new');

export function savedMenuDesign(): MenuDesign {
  try { return localStorage.getItem(MENU_DESIGN_KEY) === 'previous' ? 'previous' : 'new'; }
  catch { return 'new'; }
}
