import { UserRole } from '../types';

export enum Permission {
  MANAGE_USERS = 'manage_users',
  MANAGE_CHANNELS = 'manage_channels',
  DELETE_ANY_MESSAGE = 'delete_any_message',
  DELETE_OWN_MESSAGE = 'delete_own_message',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  UPLOAD_FILES = 'upload_files',
  CREATE_CHANNELS = 'create_channels',
}

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: Object.values(Permission), // Admins get all permissions
  [UserRole.MEMBER]: [
    Permission.DELETE_OWN_MESSAGE,
    Permission.UPLOAD_FILES,
    Permission.CREATE_CHANNELS,
  ],
  [UserRole.GUEST]: [
    // Guests are heavily restricted
  ],
};

export const hasPermission = (role: UserRole | undefined, permission: Permission): boolean => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};

export const isAtLeastRole = (currentRole: UserRole | undefined, requiredRole: UserRole): boolean => {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.ADMIN]: 3,
    [UserRole.MEMBER]: 2,
    [UserRole.GUEST]: 1,
  };
  
  const currentLevel = currentRole ? roleHierarchy[currentRole] : 0;
  const requiredLevel = roleHierarchy[requiredRole];
  
  return currentLevel >= requiredLevel;
};
