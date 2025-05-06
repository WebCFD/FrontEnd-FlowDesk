/**
 * Constantes para categorías de eventos de analytics
 */
export const AnalyticsCategories = {
  SIMULATION: 'simulation',
  UI: 'ui_interaction',
  NAVIGATION: 'navigation',
  DESIGN: 'design_tool',
  ACCOUNT: 'account',
  CERTIFICATION: 'certification'
};

/**
 * Constantes para acciones de eventos de analytics
 */
export const AnalyticsActions = {
  // Simulación
  CREATE_SIMULATION: 'create_simulation',
  START_SIMULATION: 'start_simulation',
  EXPORT_SIMULATION: 'export_simulation',
  SAVE_SIMULATION: 'save_simulation',
  LOAD_SIMULATION: 'load_simulation',
  
  // UI
  OPEN_PANEL: 'open_panel',
  CLOSE_PANEL: 'close_panel',
  TOGGLE_VIEW: 'toggle_view',
  CHANGE_TAB: 'change_tab',
  
  // Navegación
  PAGE_VIEW: 'page_view',
  EXTERNAL_LINK: 'external_link',
  INTERNAL_NAVIGATION: 'internal_navigation',
  
  // Herramientas de diseño
  ADD_WALL: 'add_wall',
  ADD_WINDOW: 'add_window',
  ADD_DOOR: 'add_door',
  ADD_STAIR: 'add_stair',
  MODIFY_ELEMENT: 'modify_element',
  DELETE_ELEMENT: 'delete_element',
  CHANGE_FLOOR: 'change_floor',
  ADD_FLOOR: 'add_floor',
  
  // Cuenta
  LOGIN: 'login',
  SIGNUP: 'signup',
  LOGOUT: 'logout',
  UPDATE_PROFILE: 'update_profile',
  
  // Certificaciones
  SELECT_CERTIFICATION: 'select_certification',
  VIEW_CERTIFICATION_DETAILS: 'view_certification_details'
};